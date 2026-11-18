from sqlalchemy import Boolean, Column, Integer, String, ForeignKey, Numeric, DateTime, false, func
from app.db.database import Base


class FulfillmentAgreement(Base):
    __tablename__ = "fulfillment_agreements"

    id = Column(Integer, primary_key=True)
    request_id = Column(Integer, ForeignKey("produce_requests.id"), nullable=False, unique=True)
    customer_identity = Column(String, nullable=False, index=True)
    customer_contact = Column(String, nullable=True)
    produce_inventory_id = Column(Integer, ForeignKey("produce_inventory.id"), nullable=True)
    menurithm_inventory_item_id = Column(Integer, nullable=True)
    method = Column(String, nullable=False)
    fee = Column(Numeric(10, 2), nullable=True)
    produce_total = Column(Numeric(10, 2), nullable=True)
    stock_reserved = Column(Boolean, nullable=False, default=False, server_default=false())
    payment_recorded_at = Column(DateTime(timezone=True), nullable=True)
    currency = Column(String(3), nullable=False, default="USD")
    pickup_address = Column(String, nullable=True)
    instructions = Column(String, nullable=True)
    revision = Column(Integer, nullable=False, default=0)
    accepted_revision = Column(Integer, nullable=True)
    accepted_at = Column(DateTime(timezone=True), nullable=True)
    stage = Column(String, nullable=False, default="requested")
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
