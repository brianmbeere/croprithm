from pydantic import BaseModel, Field
from typing import Optional, List, Literal
from datetime import datetime

# Produce Inventory Schemas
class ProduceInventoryCreate(BaseModel):
    produce_type: str
    variety: Optional[str] = None
    quantity_available: float
    unit: str
    price_per_unit: float
    harvest_date: Optional[datetime] = None
    expiry_date: Optional[datetime] = None
    location: str
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    organic: bool = False
    description: Optional[str] = None

class ProduceInventoryUpdate(BaseModel):
    produce_type: Optional[str] = None
    variety: Optional[str] = None
    quantity_available: Optional[float] = None
    unit: Optional[str] = None
    price_per_unit: Optional[float] = None
    harvest_date: Optional[datetime] = None
    expiry_date: Optional[datetime] = None
    location: Optional[str] = None
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    organic: Optional[bool] = None
    description: Optional[str] = None
    is_available: Optional[bool] = None

class ProduceInventoryResponse(BaseModel):
    id: int
    seller_id: int
    produce_type: str
    variety: Optional[str]
    quantity_available: float
    unit: str
    price_per_unit: float
    harvest_date: Optional[datetime]
    expiry_date: Optional[datetime]
    location: str
    latitude: Optional[float]
    longitude: Optional[float]
    organic: bool
    description: Optional[str]
    is_available: bool
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}

# Produce Request Schemas
class ProduceRequestCreate(BaseModel):
    restaurant_name: str
    produce_type: str
    quantity_needed: float
    unit: str
    max_price_per_unit: Optional[float] = None
    delivery_address: str
    delivery_latitude: Optional[float] = None
    delivery_longitude: Optional[float] = None
    delivery_window_start: datetime
    delivery_window_end: datetime
    special_requirements: Optional[str] = None
    menurithm_request_id: Optional[str] = None

class ProduceRequestUpdate(BaseModel):
    status: Optional[str] = None
    assigned_seller_id: Optional[int] = None
    special_requirements: Optional[str] = None

class ProduceRequestResponse(BaseModel):
    id: int
    restaurant_id: Optional[int]  # Nullable for Menurithm requests
    restaurant_name: str
    produce_type: str
    quantity_needed: float
    unit: str
    max_price_per_unit: Optional[float]
    delivery_address: str
    delivery_latitude: Optional[float]
    delivery_longitude: Optional[float]
    delivery_window_start: datetime
    delivery_window_end: datetime
    special_requirements: Optional[str]
    status: str
    assigned_seller_id: Optional[int]
    menurithm_request_id: Optional[str]
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}

# Delivery Route Schemas
class DeliveryRouteCreate(BaseModel):
    route_name: str = Field(min_length=1, max_length=200)
    pickup_location: str = Field(min_length=1)
    pickup_latitude: Optional[float] = None
    pickup_longitude: Optional[float] = None
    delivery_date: datetime
    request_ids: List[int] = Field(min_length=1)

class DeliveryRouteResponse(BaseModel):
    id: int
    seller_id: int
    route_name: str
    pickup_location: str
    pickup_latitude: Optional[float]
    pickup_longitude: Optional[float]
    total_distance_miles: Optional[float]
    estimated_duration_minutes: Optional[int]
    status: str
    delivery_date: datetime
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}

class DeliveryStopResponse(BaseModel):
    id: int
    route_id: int
    request_id: int
    stop_order: int
    address: str
    latitude: Optional[float]
    longitude: Optional[float]
    estimated_arrival: Optional[datetime]
    actual_arrival: Optional[datetime]
    status: str
    notes: Optional[str]

    model_config = {"from_attributes": True}


class DeliveryStopUpdate(BaseModel):
    status: Literal["pending", "en_route", "arrived", "delivered", "skipped"]

# Menurithm Integration Schemas
class MenurithmWebhookRequest(BaseModel):
    request_id: str
    restaurant_name: str
    produce_type: str
    quantity: str
    delivery_address: str
    delivery_window: str
    special_requirements: Optional[str] = None

class MenurithmWebhookUpdate(BaseModel):
    request_id: str
    status: str
    updates: dict

# Analytics Schemas
class DemandAnalytics(BaseModel):
    produce_type: str
    total_requests: int
    average_quantity: float
    average_price: float
    trend_direction: str  # increasing, decreasing, stable

class SellerPerformanceAnalytics(BaseModel):
    seller_id: int
    total_deliveries: int
    on_time_rate: float
    average_rating: float
    revenue_this_month: float
