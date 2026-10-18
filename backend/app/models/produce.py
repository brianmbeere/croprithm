from sqlalchemy import Column, DateTime, Integer, String, Float, ForeignKey, func, Text, Boolean
from sqlalchemy.orm import relationship
from app.db.database import Base

class ProduceInventory(Base):
    __tablename__ = "produce_inventory"

    id = Column(Integer, primary_key=True, index=True)
    seller_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    produce_type = Column(String, nullable=False)
    variety = Column(String, nullable=True)
    quantity_available = Column(Float, nullable=False)
    unit = Column(String, nullable=False)  # kg, lbs, tons, etc.
    price_per_unit = Column(Float, nullable=False)
    harvest_date = Column(DateTime(timezone=True), nullable=True)
    expiry_date = Column(DateTime(timezone=True), nullable=True)
    location = Column(String, nullable=False)  # Farm/warehouse location
    latitude = Column(Float, nullable=True)
    longitude = Column(Float, nullable=True)
    organic = Column(Boolean, default=False)
    description = Column(Text, nullable=True)
    is_available = Column(Boolean, default=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    # Relationship
    seller = relationship("User", back_populates="produce_inventory")

class ProduceRequest(Base):
    __tablename__ = "produce_requests"

    id = Column(Integer, primary_key=True, index=True)
    restaurant_id = Column(Integer, ForeignKey("users.id"), nullable=True)  # Nullable for Menurithm requests
    restaurant_name = Column(String, nullable=False)
    produce_type = Column(String, nullable=False)
    quantity_needed = Column(Float, nullable=False)
    unit = Column(String, nullable=False)
    max_price_per_unit = Column(Float, nullable=True)
    delivery_address = Column(String, nullable=False)
    delivery_latitude = Column(Float, nullable=True)
    delivery_longitude = Column(Float, nullable=True)
    delivery_window_start = Column(DateTime(timezone=True), nullable=False)
    delivery_window_end = Column(DateTime(timezone=True), nullable=False)
    special_requirements = Column(Text, nullable=True)
    status = Column(String, default="pending")  # pending, accepted, declined, completed
    assigned_seller_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    menurithm_request_id = Column(String, nullable=True)  # External ID from Menurithm
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    # Relationships
    restaurant = relationship("User", foreign_keys=[restaurant_id], back_populates="restaurant_requests")
    assigned_seller = relationship("User", foreign_keys=[assigned_seller_id], back_populates="assigned_requests")

class DeliveryRoute(Base):
    __tablename__ = "delivery_routes"

    id = Column(Integer, primary_key=True, index=True)
    seller_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    route_name = Column(String, nullable=False)
    pickup_location = Column(String, nullable=False)
    pickup_latitude = Column(Float, nullable=True)
    pickup_longitude = Column(Float, nullable=True)
    total_distance_miles = Column(Float, nullable=True)
    estimated_duration_minutes = Column(Integer, nullable=True)
    status = Column(String, default="planned")  # planned, active, completed, cancelled
    delivery_date = Column(DateTime(timezone=True), nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    # Relationships
    seller = relationship("User", back_populates="delivery_routes")
    stops = relationship("DeliveryStop", back_populates="route")

class DeliveryStop(Base):
    __tablename__ = "delivery_stops"

    id = Column(Integer, primary_key=True, index=True)
    route_id = Column(Integer, ForeignKey("delivery_routes.id"), nullable=False)
    request_id = Column(Integer, ForeignKey("produce_requests.id"), nullable=False)
    stop_order = Column(Integer, nullable=False)
    address = Column(String, nullable=False)
    latitude = Column(Float, nullable=True)
    longitude = Column(Float, nullable=True)
    estimated_arrival = Column(DateTime(timezone=True), nullable=True)
    actual_arrival = Column(DateTime(timezone=True), nullable=True)
    status = Column(String, default="pending")  # pending, en_route, arrived, delivered, skipped; legacy failed
    notes = Column(Text, nullable=True)

    # Relationships
    route = relationship("DeliveryRoute", back_populates="stops")
    request = relationship("ProduceRequest")
