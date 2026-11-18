import hashlib
import hmac
import os
from datetime import datetime, timezone
from decimal import Decimal, ROUND_HALF_UP
from typing import Literal
from uuid import UUID

from fastapi import APIRouter, Depends, Header, HTTPException, Query
from pydantic import BaseModel, Field, model_validator
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, joinedload
from app.db.database import get_db
from app.models.user import User
from app.models.produce import ProduceInventory, ProduceRequest
from app.models.fulfillment import FulfillmentAgreement, PickupCheckout, PickupWindow
from app.schemas.produce_illustrations import ILLUSTRATIONS
from app.utils.auth_dependency import verify_firebase_token
from app.services.fulfillment import advance_handover, cancel_agreement, matching_listing, reserve_stock

router = APIRouter(prefix="/api/fulfillment", tags=["fulfillment"])
Method = Literal["customer_pickup", "farmer_delivery"]


class CartLine(BaseModel):
    listing_id: int = Field(gt=0)
    quantity: Decimal = Field(gt=0, max_digits=12, decimal_places=3)


class CartPreview(BaseModel):
    lines: list[CartLine] = Field(min_length=1, max_length=50)


def build_cart_preview(data: CartPreview, db: Session, *, lock: bool = False):
    quantities = {line.listing_id: line.quantity for line in data.lines}
    if len(quantities) != len(data.lines):
        raise HTTPException(422, "Each listing can appear only once.")
    query = db.query(ProduceInventory).filter(
        ProduceInventory.id.in_(quantities), ProduceInventory.is_available.is_(True)
    ).order_by(ProduceInventory.id)
    if lock:
        query = query.with_for_update()
    listings = query.all()
    if len(listings) != len(quantities):
        raise HTTPException(409, "A listing is no longer available. Update your cart.")
    if len({listing.seller_id for listing in listings}) != 1:
        raise HTTPException(422, "Check out with one farm at a time.")
    lines = []
    subtotal = Decimal("0.00")
    for listing in listings:
        stock = Decimal(str(listing.quantity_available))
        price = Decimal(str(listing.price_per_unit))
        quantity = quantities[listing.id]
        if not stock.is_finite() or stock < quantity:
            raise HTTPException(409, f"Not enough {listing.produce_type} is available. Update your cart.")
        if not price.is_finite() or not 0 <= price <= Decimal("99999999.99"):
            raise HTTPException(409, f"{listing.produce_type} has no valid posted price.")
        amount = (quantity * price).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
        if amount > Decimal("99999999.99"):
            raise HTTPException(422, "A cart line exceeds the maximum order amount.")
        subtotal += amount
        lines.append({
            "listing_id": listing.id, "produce_type": listing.produce_type,
            "quantity": str(quantity), "unit": listing.unit,
            "unit_price": str(price), "line_total": str(amount),
        })
    return {
        "seller_id": listings[0].seller_id, "seller_name": listings[0].seller.full_name, "currency": "USD",
        "lines": lines, "produce_subtotal": str(subtotal),
        "payment_provider": "stripe_connect", "payment_status": "not_configured",
    }


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


class PickupWindowInput(BaseModel):
    address: str = Field(min_length=1, max_length=500)
    starts_at: datetime
    ends_at: datetime

    @model_validator(mode="after")
    def validate_window(self):
        self.address = self.address.strip()
        if not self.address or self.starts_at.utcoffset() is None or self.ends_at.utcoffset() is None:
            raise ValueError("Provide a pickup address and timezone-aware times.")
        if not datetime.now(timezone.utc) < self.starts_at < self.ends_at:
            raise ValueError("Pickup must start in the future and end after it starts.")
        return self


class PickupCheckoutInput(CartPreview):
    window_id: int = Field(gt=0)
    attempt_key: UUID
    expected_subtotal: Decimal = Field(ge=0, max_digits=14, decimal_places=2)
    restaurant_name: str = Field(min_length=1, max_length=200)
    customer_contact: str | None = Field(default=None, max_length=320)


def utc(value: datetime) -> datetime:
    return value.replace(tzinfo=timezone.utc) if value.tzinfo is None else value.astimezone(timezone.utc)


def window_view(window: PickupWindow):
    return {"id": window.id, "address": window.address, "starts_at": utc(window.starts_at),
            "ends_at": utc(window.ends_at), "active": window.active}


@router.get("/marketplace/farmer/pickup-windows")
def seller_pickup_windows(user: User = Depends(farmer), db: Session = Depends(get_db)):
    windows = db.query(PickupWindow).filter(
        PickupWindow.seller_id == user.id, PickupWindow.ends_at > datetime.now(timezone.utc),
    ).order_by(PickupWindow.starts_at).all()
    return [window_view(window) for window in windows]


@router.post("/marketplace/farmer/pickup-windows", status_code=201)
def post_pickup_window(data: PickupWindowInput, user: User = Depends(farmer), db: Session = Depends(get_db)):
    window = PickupWindow(seller_id=user.id, address=data.address, starts_at=utc(data.starts_at),
                          ends_at=utc(data.ends_at), active=True)
    db.add(window)
    db.flush()
    result = window_view(window)
    db.commit()
    return result


@router.post("/marketplace/farmer/pickup-windows/{identifier}/pause")
def pause_pickup_window(identifier: int, user: User = Depends(farmer), db: Session = Depends(get_db)):
    window = db.query(PickupWindow).filter_by(id=identifier, seller_id=user.id).with_for_update().first()
    if window is None:
        raise HTTPException(404, "Pickup window not found.")
    window.active = False
    db.commit()
    return window_view(window)


def checkout_view(checkout: PickupCheckout):
    return {"id": checkout.id, "state": checkout.state, "produce_subtotal": str(checkout.subtotal),
            "currency": "USD", "payment_method": "pay_at_pickup"}


def checkout_agreements(db: Session, checkout: PickupCheckout):
    return db.query(FulfillmentAgreement).filter_by(pickup_checkout_id=checkout.id).order_by(
        FulfillmentAgreement.produce_inventory_id
    ).with_for_update().all()


def cancel_pickup_checkout(db: Session, checkout: PickupCheckout, *, seller: bool):
    if checkout.state == "canceled":
        return
    agreements = checkout_agreements(db, checkout)
    cancellable = {"accepted", "ready"} if seller else {"accepted"}
    if any(agreement.stage not in cancellable or agreement.payment_recorded_at is not None
           for agreement in agreements):
        raise HTTPException(409, "This pickup order can no longer be canceled here. Contact the other party.")
    for agreement in agreements:
        cancel_agreement(db, agreement, db.get(ProduceRequest, agreement.request_id))
    checkout.state = "canceled"


@router.post("/marketplace/pickup-checkouts")
def start_pickup_checkout(data: PickupCheckoutInput, identity: str = Depends(customer_identity),
                          db: Session = Depends(get_db)):
    name = data.restaurant_name.strip()
    if not name:
        raise HTTPException(422, "Enter the restaurant name.")
    fingerprint = hashlib.sha256(repr((
        data.window_id, str(data.expected_subtotal.normalize()), name,
        sorted((line.listing_id, str(line.quantity.normalize())) for line in data.lines),
    )).encode()).hexdigest()
    attempt = {"customer_identity": identity, "attempt_key": str(data.attempt_key)}
    existing = db.query(PickupCheckout).filter_by(**attempt).first()
    if existing is not None:
        if existing.fingerprint != fingerprint:
            raise HTTPException(409, "This checkout attempt belongs to a different cart.")
        return checkout_view(existing)
    window = db.query(PickupWindow).filter_by(id=data.window_id).with_for_update().first()
    if window is None or not window.active or utc(window.starts_at) <= datetime.now(timezone.utc):
        raise HTTPException(409, "Choose an available pickup window.")
    # Claim the attempt before locking stock, so a concurrent retry cannot reserve a second time.
    checkout = PickupCheckout(**attempt, fingerprint=fingerprint, window_id=window.id,
                              subtotal=data.expected_subtotal, state="placed")
    db.add(checkout)
    try:
        db.flush()
    except IntegrityError:
        db.rollback()
        existing = db.query(PickupCheckout).filter_by(**attempt).one_or_none()
        if existing is None:
            raise
        if existing.fingerprint != fingerprint:
            raise HTTPException(409, "This checkout attempt belongs to a different cart.")
        return checkout_view(existing)
    cart = build_cart_preview(data, db, lock=True)
    if cart["seller_id"] != window.seller_id:
        raise HTTPException(409, "Choose a pickup window from the farm in your cart.")
    if Decimal(cart["produce_subtotal"]) != data.expected_subtotal:
        raise HTTPException(409, "The produce subtotal changed. Review your cart again.")
    now = datetime.now(timezone.utc)
    if utc(window.starts_at) <= now:
        raise HTTPException(409, "Choose an available pickup window.")
    local_user = db.query(User).filter_by(firebase_uid=identity.removeprefix("croprithm:")).first() if identity.startswith("croprithm:") else None
    for line in cart["lines"]:
        order = ProduceRequest(
            restaurant_id=local_user.id if local_user else None,
            restaurant_name=name, produce_type=line["produce_type"], unit=line["unit"],
            quantity_needed=float(line["quantity"]), delivery_address="",
            delivery_window_start=window.starts_at, delivery_window_end=window.ends_at,
            status="accepted", assigned_seller_id=window.seller_id,
        )
        db.add(order)
        db.flush()
        agreement = FulfillmentAgreement(
            request_id=order.id, pickup_checkout_id=checkout.id, customer_identity=identity,
            customer_contact=local_user.email if local_user else data.customer_contact,
            method="customer_pickup", pickup_address=window.address, fee=Decimal(0),
            produce_total=Decimal(line["line_total"]), currency="USD", revision=1, stage="accepted",
            accepted_revision=1, accepted_at=now,
            produce_inventory_id=line["listing_id"],
        )
        reserve_stock(db, agreement, order)
        db.add(agreement)
    result = checkout_view(checkout)
    db.commit()
    return result


@router.post("/marketplace/pickup-checkouts/{identifier}/cancel")
def cancel_customer_pickup(identifier: int, identity: str = Depends(customer_identity), db: Session = Depends(get_db)):
    checkout = db.query(PickupCheckout).filter_by(
        id=identifier, customer_identity=identity,
    ).with_for_update().first()
    if checkout is None:
        raise HTTPException(404, "Checkout not found.")
    cancel_pickup_checkout(db, checkout, seller=False)
    result = checkout_view(checkout)
    db.commit()
    return result


@router.post("/marketplace/farmer/pickup-checkouts/{identifier}/cancel")
def cancel_farmer_pickup(identifier: int, user: User = Depends(farmer), db: Session = Depends(get_db)):
    checkout = db.query(PickupCheckout).filter(
        PickupCheckout.id == identifier,
        PickupCheckout.window_id.in_(db.query(PickupWindow.id).filter_by(seller_id=user.id)),
    ).with_for_update().first()
    if checkout is None:
        raise HTTPException(404, "Pickup order not found.")
    cancel_pickup_checkout(db, checkout, seller=True)
    result = checkout_view(checkout)
    db.commit()
    return result


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
        "pickup_checkout_id": agreement.pickup_checkout_id,
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


@router.post("/marketplace/checkout-preview")
def preview_checkout(data: CartPreview, _identity: str = Depends(customer_identity), db: Session = Depends(get_db)):
    cart = build_cart_preview(data, db)
    windows = db.query(PickupWindow).filter(
        PickupWindow.seller_id == cart["seller_id"], PickupWindow.active.is_(True),
        PickupWindow.starts_at > datetime.now(timezone.utc),
    ).order_by(PickupWindow.starts_at).limit(50).all()
    cart.update(payment_method="pay_at_pickup", pickup_windows=[window_view(window) for window in windows])
    return cart


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
            "illustration": ILLUSTRATIONS.get(listing.illustration_id),
            "harvest_date": listing.harvest_date,
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
            "illustration": ILLUSTRATIONS.get(listing.illustration_id),
            "harvest_date": listing.harvest_date,
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
    if agreement.pickup_checkout_id is not None:
        raise HTTPException(409, "Cancel the entire pickup order instead.")
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
    if agreement.pickup_checkout_id is not None:
        raise HTTPException(409, "Cancel the entire pickup order instead.")
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
