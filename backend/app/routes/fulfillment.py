import hmac
import os
from datetime import datetime, timezone
from decimal import Decimal
from typing import Literal

from fastapi import APIRouter, Depends, Header, HTTPException, Query
from pydantic import BaseModel, Field, model_validator
from sqlalchemy.orm import Session, joinedload
from app.db.database import get_db
from app.models.user import User
from app.models.produce import ProduceInventory, ProduceRequest
from app.models.fulfillment import FulfillmentAgreement
from app.utils.auth_dependency import verify_firebase_token
from app.services.fulfillment import advance_handover, cancel_agreement, matching_listing, reserve_stock

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
    produce_inventory_id: int | None = Field(default=None, gt=0)
    menurithm_inventory_item_id: int | None = Field(default=None, gt=0)

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
    produce_total: Decimal = Field(ge=0, max_digits=10, decimal_places=2, allow_inf_nan=False)
    produce_inventory_id: int | None = Field(default=None, gt=0)

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
        "produce_total": str(agreement.produce_total) if agreement.produce_total is not None else None,
        "sale_total": str(agreement.produce_total + agreement.fee)
        if agreement.produce_total is not None and agreement.fee is not None else None,
        "stock_reserved": agreement.stock_reserved,
        "payment_recorded_at": agreement.payment_recorded_at,
        "currency": agreement.currency, "pickup_address": agreement.pickup_address,
        "instructions": agreement.instructions, "revision": agreement.revision,
        "accepted_revision": agreement.accepted_revision, "stage": agreement.stage,
        "accepted_at": agreement.accepted_at,
        "seller_id": order.assigned_seller_id,
        "farmer_name": seller.full_name if seller else None,
        "farmer_contact": seller.email if seller else None,
        "produce_inventory_id": agreement.produce_inventory_id,
        "menurithm_inventory_item_id": agreement.menurithm_inventory_item_id,
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


@router.get("/produce/available")
def available_produce_for_menurithm(
    produce_type: str | None = Query(default=None, max_length=100),
    location: str | None = Query(default=None, max_length=100),
    max_price: float | None = Query(default=None, ge=0),
    _identity: str = Depends(customer_identity),
    db: Session = Depends(get_db),
):
    query = db.query(ProduceInventory).filter(
        ProduceInventory.is_available.is_(True),
        ProduceInventory.quantity_available > 0,
    ).options(joinedload(ProduceInventory.seller))
    if produce_type:
        query = query.filter(ProduceInventory.produce_type.ilike(f"%{produce_type}%"))
    if location:
        query = query.filter(ProduceInventory.location.ilike(f"%{location}%"))
    if max_price is not None:
        query = query.filter(ProduceInventory.price_per_unit <= max_price)
    listings = query.order_by(ProduceInventory.id.desc()).limit(50).all()
    return [
        {
            "id": listing.id,
            "seller_id": listing.seller_id,
            "seller_name": listing.seller.full_name,
            "seller_contact": listing.seller.email,
            "produce_type": listing.produce_type,
            "variety": listing.variety,
            "quantity_available": listing.quantity_available,
            "unit": listing.unit,
            "price_per_unit": listing.price_per_unit,
            "location": listing.location,
            "organic": listing.organic,
            "description": listing.description,
            "expiry_date": listing.expiry_date,
        }
        for listing in listings
    ]


@router.post("/orders")
def create_order(data: OrderInput, identity: str = Depends(customer_identity), db: Session = Depends(get_db)):
    local_user = None
    if identity.startswith("croprithm:"):
        local_user = db.query(User).filter(User.firebase_uid == identity.split(":", 1)[1]).first()
    listing = None
    if data.produce_inventory_id is not None:
        listing = db.query(ProduceInventory).filter(
            ProduceInventory.id == data.produce_inventory_id,
            ProduceInventory.is_available.is_(True),
        ).with_for_update().first()
        if (
            listing is None
            or listing.quantity_available < data.quantity_needed
            or listing.unit.casefold() != data.unit.strip().casefold()
            or listing.produce_type.casefold() != data.produce_type.strip().casefold()
        ):
            raise HTTPException(409, "Selected produce listing is unavailable or no longer matches this request")
        if identity.startswith("menurithm:") and data.menurithm_inventory_item_id is None:
            raise HTTPException(422, "Link this request to a kitchen ingredient for receipt tracking")
    order = ProduceRequest(
        restaurant_id=local_user.id if local_user else None,
        restaurant_name=data.restaurant_name.strip(), produce_type=data.produce_type.strip(),
        quantity_needed=data.quantity_needed, unit=data.unit.strip(),
        delivery_address=data.delivery_address.strip(),
        delivery_window_start=data.delivery_window_start, delivery_window_end=data.delivery_window_end,
        special_requirements=data.special_requirements, status="pending",
        assigned_seller_id=listing.seller_id if listing else None,
    )
    db.add(order)
    db.flush()
    agreement = FulfillmentAgreement(
        request_id=order.id, customer_identity=identity, method=data.method,
        customer_contact=local_user.email if local_user else data.customer_contact,
        produce_inventory_id=listing.id if listing else None,
        menurithm_inventory_item_id=data.menurithm_inventory_item_id,
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
        (ProduceRequest.assigned_seller_id == user.id)
        | (ProduceRequest.assigned_seller_id.is_(None) & (FulfillmentAgreement.stage == "requested"))
    ).order_by(FulfillmentAgreement.id.desc()).all()
    return [serialize(agreement, order) for agreement, order in rows]


@router.get("/produce/available")
def available_produce_for_menurithm(
    produce_type: str | None = Query(default=None, max_length=100),
    location: str | None = Query(default=None, max_length=100),
    max_price: float | None = Query(default=None, ge=0),
    _identity: str = Depends(customer_identity),
    db: Session = Depends(get_db),
):
    query = db.query(ProduceInventory).filter(
        ProduceInventory.is_available.is_(True),
        ProduceInventory.quantity_available > 0,
    ).options(joinedload(ProduceInventory.seller))
    if produce_type:
        query = query.filter(ProduceInventory.produce_type.ilike(f"%{produce_type}%"))
    if location:
        query = query.filter(ProduceInventory.location.ilike(f"%{location}%"))
    if max_price is not None:
        query = query.filter(ProduceInventory.price_per_unit <= max_price)
    listings = query.order_by(ProduceInventory.id.desc()).limit(50).all()
    return [
        {
            "id": listing.id,
            "seller_id": listing.seller_id,
            "seller_name": listing.seller.full_name,
            "seller_contact": listing.seller.email,
            "produce_type": listing.produce_type,
            "variety": listing.variety,
            "quantity_available": listing.quantity_available,
            "unit": listing.unit,
            "price_per_unit": listing.price_per_unit,
            "location": listing.location,
            "organic": listing.organic,
            "description": listing.description,
            "expiry_date": listing.expiry_date,
        }
        for listing in listings
    ]


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
    listing_id = agreement.produce_inventory_id or data.produce_inventory_id
    if listing_id is None:
        raise HTTPException(422, "Select a stock listing before sending this quote.")
    if data.produce_inventory_id is not None and data.produce_inventory_id != listing_id:
        raise HTTPException(409, "This request is already linked to a different listing.")
    matching_listing(db, listing_id, order, user.id, for_sale=True)
    order.assigned_seller_id = user.id
    agreement.produce_inventory_id = listing_id
    agreement.produce_total = data.produce_total
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
    if agreement.stage == "canceled":
        raise HTTPException(409, "This order was canceled.")
    if agreement.accepted_revision == data.revision:
        return serialize(agreement, order)
    if agreement.stage != "quoted" or agreement.fee is None:
        raise HTTPException(409, "A farmer must provide a quote first")
    reserve_stock(db, agreement, order)
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
    advance_handover(db, agreement, order, data.stage, user.id)
    db.commit()
    return serialize(agreement, order)


@router.post("/orders/{identifier}/cancel")
def cancel_customer_order(identifier: int, identity: str = Depends(customer_identity), db: Session = Depends(get_db)):
    agreement, order = customer_order(db, identity, identifier)
    cancel_agreement(db, agreement, order)
    db.commit()
    return serialize(agreement, order)


def seller_order(db: Session, identifier: int, seller_id: int):
    agreement = db.query(FulfillmentAgreement).filter_by(id=identifier).with_for_update().first()
    if agreement is None:
        raise HTTPException(404, "Order not found")
    order = db.get(ProduceRequest, agreement.request_id)
    if order.assigned_seller_id != seller_id:
        raise HTTPException(404, "Order not found")
    return agreement, order


@router.post("/farmer/orders/{identifier}/cancel")
def cancel_farmer_order(identifier: int, user: User = Depends(farmer), db: Session = Depends(get_db)):
    agreement, order = seller_order(db, identifier, user.id)
    cancel_agreement(db, agreement, order)
    db.commit()
    return serialize(agreement, order)


@router.post("/farmer/orders/{identifier}/record-payment")
def record_payment(identifier: int, user: User = Depends(farmer), db: Session = Depends(get_db)):
    agreement, order = seller_order(db, identifier, user.id)
    if agreement.stage not in {"collected", "delivered"} or agreement.produce_total is None:
        raise HTTPException(409, "Complete handover of a priced order before recording payment.")
    if agreement.payment_recorded_at is None:
        agreement.payment_recorded_at = datetime.now(timezone.utc)
        db.commit()
    return serialize(agreement, order)
