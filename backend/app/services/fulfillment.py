from decimal import Decimal

from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.models.fulfillment import FulfillmentAgreement
from app.models.produce import ProduceInventory, ProduceRequest


def matching_listing(db: Session, listing_id: int, order: ProduceRequest, seller_id: int, *, for_sale: bool):
    listing = db.query(ProduceInventory).filter_by(id=listing_id, seller_id=seller_id).with_for_update().first()
    if (
        listing is None
        or listing.unit.strip().casefold() != order.unit.strip().casefold()
        or listing.produce_type.strip().casefold() != order.produce_type.strip().casefold()
        or (for_sale and not listing.is_available)
        or listing.quantity_available < order.quantity_needed
    ):
        raise HTTPException(409, "Choose matching produce with enough available stock.")
    return listing


def reserve_stock(db: Session, agreement: FulfillmentAgreement, order: ProduceRequest):
    if agreement.produce_inventory_id is None:
        return  # Historical quotes without a listing remain fulfillable.
    listing = matching_listing(db, agreement.produce_inventory_id, order, order.assigned_seller_id, for_sale=True)
    listing.quantity_available = float(Decimal(str(listing.quantity_available)) - Decimal(str(order.quantity_needed)))
    agreement.stock_reserved = True


def cancel_agreement(db: Session, agreement: FulfillmentAgreement, order: ProduceRequest):
    if agreement.stage in ("collected", "delivered") or agreement.payment_recorded_at is not None:
        raise HTTPException(409, "Completed or paid orders cannot be canceled here.")
    if agreement.stock_reserved:
        listing = db.query(ProduceInventory).filter_by(id=agreement.produce_inventory_id).with_for_update().one()
        listing.quantity_available = float(Decimal(str(listing.quantity_available)) + Decimal(str(order.quantity_needed)))
        agreement.stock_reserved = False
    agreement.stage = "canceled"
    order.status = "cancelled"


def advance_handover(db: Session, agreement: FulfillmentAgreement, order: ProduceRequest, stage: str, seller_id: int):
    if order.assigned_seller_id != seller_id:
        raise HTTPException(403, "Order belongs to another farmer")
    if agreement.revision < 1 or agreement.accepted_revision != agreement.revision:
        raise HTTPException(409, "The customer must accept the current quote before handover")
    if stage == agreement.stage:
        return
    next_stage = {"accepted": "ready", "ready": "collected" if agreement.method == "customer_pickup" else "delivered"}
    if next_stage.get(agreement.stage) != stage:
        raise HTTPException(409, "Accept the quote and follow ready → collected/delivered")
    agreement.stage = stage
    if stage in ["collected", "delivered"]:
        if agreement.produce_inventory_id is not None and not agreement.stock_reserved:
            # Orders accepted before reservations were introduced still need a deduction.
            listing = matching_listing(db, agreement.produce_inventory_id, order, seller_id, for_sale=False)
            listing.quantity_available = float(Decimal(str(listing.quantity_available)) - Decimal(str(order.quantity_needed)))
        agreement.stock_reserved = False
        order.status = "completed"
