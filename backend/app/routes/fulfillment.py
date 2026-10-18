import hmac
import os
from datetime import datetime, timezone
from decimal import Decimal
from typing import Literal

from fastapi import APIRouter, Depends, Header, HTTPException
from pydantic import BaseModel, Field, model_validator
from sqlalchemy.orm import Session
from app.db.database import get_db
from app.models.user import User
from app.models.produce import ProduceRequest
from app.models.fulfillment import FulfillmentAgreement
from app.utils.auth_dependency import verify_firebase_token
from app.services.fulfillment import advance_handover

router = APIRouter(prefix="/api/fulfillment", tags=["fulfillment"])
Method = Literal["customer_pickup", "farmer_delivery"]


class OrderInput(BaseModel):
    restaurant_name: str = Field(min_length=1, max_length=200)
    produce_type: str = Field(min_length=1, max_length=200)
    quantity_needed: float = Field(gt=0, allow_inf_nan=False)
    unit: str = Field(min_length=1, max_length=30)
    delivery_address: str = Field(max_length=1000, default="")
    delivery_window_start: datetime
    delivery_window_end: datetime
    method: Method
    special_requirements: str = Field(default="", max_length=2000)
    customer_contact: str = Field(default="", max_length=254)

    @model_validator(mode="after")
    def valid_window(self):
        if self.delivery_window_start.tzinfo is None or self.delivery_window_end.tzinfo is None:
            raise ValueError("Collection/delivery times must include a timezone")
        if self.delivery_window_end <= self.delivery_window_start:
            raise ValueError("End time must be after start time")
        if not self.restaurant_name.strip() or not self.produce_type.strip() or not self.unit.strip():
            raise ValueError("Customer, produce and unit are required")
        if self.method == "farmer_delivery" and not self.delivery_address.strip():
            raise ValueError("Farmer delivery requires a delivery address")
        return self


class QuoteInput(BaseModel):
    method: Method
    fee: Decimal = Field(ge=0, max_digits=10, decimal_places=2)
    currency: Literal["USD"] = "USD"
    pickup_address: str = Field(default="", max_length=1000)
    instructions: str = Field(min_length=1, max_length=2000)
    expected_revision: int = Field(ge=0)

    @model_validator(mode="after")
    def valid_pickup(self):
        if not self.instructions.strip():
            raise ValueError("Provide handover instructions")
        if self.method == "customer_pickup" and (self.fee != 0 or not self.pickup_address.strip()):
            raise ValueError("Customer pickup requires a pickup address and zero delivery fee")
        return self


class Acceptance(BaseModel):
    revision: int = Field(gt=0)


class StageInput(BaseModel):
    stage: Literal["ready", "collected", "delivered"]


def customer_identity(
    authorization: str = Header(...),
    x_customer_id: str | None = Header(None),
    db: Session = Depends(get_db),
) -> str:
    bridge_key = os.getenv("FULFILLMENT_BRIDGE_KEY")
    if bridge_key and hmac.compare_digest(authorization, f"Bearer {bridge_key}"):
        if not x_customer_id or len(x_customer_id) > 128:
            raise HTTPException(400, "Customer identity is required")
        return f"menurithm:{x_customer_id}"
    claims = verify_firebase_token(authorization)
    user = db.query(User).filter(User.firebase_uid == claims["uid"]).first()
    if not user or user.role != "restaurant":
        raise HTTPException(403, "Restaurant account required")
    return f"croprithm:{user.firebase_uid}"


def farmer(db: Session = Depends(get_db), claims: dict = Depends(verify_firebase_token)) -> User:
    user = db.query(User).filter(User.firebase_uid == claims["uid"]).first()
    if not user or user.role != "farmer":
        raise HTTPException(403, "Farmer account required")
    return user


def serialize(agreement: FulfillmentAgreement, order: ProduceRequest) -> dict:
    seller = order.assigned_seller
    return {
        "id": agreement.id, "request_id": order.id,
        "restaurant_name": order.restaurant_name, "produce_type": order.produce_type,
        "quantity_needed": order.quantity_needed, "unit": order.unit,
        "delivery_address": order.delivery_address,
        "window_start": order.delivery_window_start, "window_end": order.delivery_window_end,
        "method": agreement.method, "fee": str(agreement.fee) if agreement.fee is not None else None,
        "currency": agreement.currency, "pickup_address": agreement.pickup_address,
        "instructions": agreement.instructions, "revision": agreement.revision,
        "accepted_revision": agreement.accepted_revision, "stage": agreement.stage,
        "accepted_at": agreement.accepted_at,
        "seller_id": order.assigned_seller_id,
        "farmer_name": seller.full_name if seller else None,
        "farmer_contact": seller.email if seller else None,
        "customer_contact": agreement.customer_contact,
        "special_requirements": order.special_requirements,
    }


def customer_order(db: Session, identity: str, identifier: int):
    agreement = db.query(FulfillmentAgreement).filter(
        FulfillmentAgreement.id == identifier, FulfillmentAgreement.customer_identity == identity
    ).with_for_update().first()
    if not agreement:
        raise HTTPException(404, "Order not found")
    return agreement, db.get(ProduceRequest, agreement.request_id)


@router.post("/orders")
def create_order(data: OrderInput, identity: str = Depends(customer_identity), db: Session = Depends(get_db)):
    local_user = None
    if identity.startswith("croprithm:"):
        local_user = db.query(User).filter(User.firebase_uid == identity.split(":", 1)[1]).first()
    order = ProduceRequest(
        restaurant_id=local_user.id if local_user else None,
        restaurant_name=data.restaurant_name.strip(), produce_type=data.produce_type.strip(),
        quantity_needed=data.quantity_needed, unit=data.unit.strip(),
        delivery_address=data.delivery_address.strip(),
        delivery_window_start=data.delivery_window_start, delivery_window_end=data.delivery_window_end,
        special_requirements=data.special_requirements, status="pending",
    )
    db.add(order)
    db.flush()
    agreement = FulfillmentAgreement(
        request_id=order.id, customer_identity=identity, method=data.method,
        customer_contact=local_user.email if local_user else data.customer_contact,
    )
    db.add(agreement)
    db.commit()
    db.refresh(agreement)
    return serialize(agreement, order)


@router.get("/orders")
def list_customer_orders(identity: str = Depends(customer_identity), db: Session = Depends(get_db)):
    rows = db.query(FulfillmentAgreement, ProduceRequest).join(
        ProduceRequest, ProduceRequest.id == FulfillmentAgreement.request_id
    ).filter(FulfillmentAgreement.customer_identity == identity).order_by(FulfillmentAgreement.id.desc()).all()
    return [serialize(agreement, order) for agreement, order in rows]


@router.get("/farmer/orders")
def list_farmer_orders(user: User = Depends(farmer), db: Session = Depends(get_db)):
    rows = db.query(FulfillmentAgreement, ProduceRequest).join(
        ProduceRequest, ProduceRequest.id == FulfillmentAgreement.request_id
    ).filter(
        (ProduceRequest.assigned_seller_id == user.id) | (ProduceRequest.assigned_seller_id.is_(None))
    ).order_by(FulfillmentAgreement.id.desc()).all()
    return [serialize(agreement, order) for agreement, order in rows]


@router.put("/farmer/orders/{identifier}/quote")
def quote_order(identifier: int, data: QuoteInput, user: User = Depends(farmer), db: Session = Depends(get_db)):
    agreement = db.query(FulfillmentAgreement).filter(FulfillmentAgreement.id == identifier).with_for_update().first()
    if not agreement:
        raise HTTPException(404, "Order not found")
    order = db.query(ProduceRequest).filter(ProduceRequest.id == agreement.request_id).with_for_update().first()
    if order.assigned_seller_id not in [None, user.id]:
        raise HTTPException(403, "Order belongs to another farmer")
    if agreement.stage not in ["requested", "quoted"]:
        raise HTTPException(409, "Accepted terms cannot be changed; arrange changes with the customer separately")
    if data.expected_revision != agreement.revision:
        raise HTTPException(409, "Quote changed. Refresh before editing")
    if data.method == "farmer_delivery" and not order.delivery_address.strip():
        raise HTTPException(422, "Customer must provide a delivery address; offer pickup for this request")
    order.assigned_seller_id = user.id
    agreement.method = data.method
    agreement.fee = data.fee
    agreement.currency = data.currency
    agreement.pickup_address = data.pickup_address.strip() if data.method == "customer_pickup" else None
    agreement.instructions = data.instructions.strip()
    agreement.revision += 1
    agreement.accepted_revision = None
    agreement.stage = "quoted"
    db.commit()
    return serialize(agreement, order)


@router.post("/orders/{identifier}/accept")
def accept_quote(identifier: int, data: Acceptance, identity: str = Depends(customer_identity), db: Session = Depends(get_db)):
    agreement, order = customer_order(db, identity, identifier)
    if agreement.revision != data.revision:
        raise HTTPException(409, "Quote changed. Review the latest fee and terms before accepting")
    if agreement.accepted_revision == data.revision:
        return serialize(agreement, order)
    if agreement.stage != "quoted" or agreement.fee is None:
        raise HTTPException(409, "A farmer must provide a quote first")
    agreement.accepted_revision = data.revision
    agreement.accepted_at = datetime.now(timezone.utc)
    agreement.stage = "accepted"
    order.status = "accepted"
    db.commit()
    return serialize(agreement, order)


@router.put("/farmer/orders/{identifier}/stage")
def update_stage(identifier: int, data: StageInput, user: User = Depends(farmer), db: Session = Depends(get_db)):
    agreement = db.query(FulfillmentAgreement).filter(FulfillmentAgreement.id == identifier).with_for_update().first()
    if not agreement:
        raise HTTPException(404, "Order not found")
    order = db.query(ProduceRequest).filter(ProduceRequest.id == agreement.request_id).with_for_update().first()
    advance_handover(agreement, order, data.stage, user.id)
    db.commit()
    return serialize(agreement, order)
