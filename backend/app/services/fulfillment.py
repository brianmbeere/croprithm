from fastapi import HTTPException
from app.models.fulfillment import FulfillmentAgreement
from app.models.produce import ProduceRequest


def advance_handover(agreement: FulfillmentAgreement, order: ProduceRequest, stage: str, seller_id: int):
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
        order.status = "completed"
