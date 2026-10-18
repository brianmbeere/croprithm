from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List
from datetime import datetime, timezone
import logging
from app.db.database import get_db
from app.models.produce import DeliveryRoute, DeliveryStop, ProduceRequest
from app.models.user import User
from app.models.fulfillment import FulfillmentAgreement
from app.schemas.produce import (
    DeliveryRouteCreate, 
    DeliveryRouteResponse,
    DeliveryStopResponse,
    DeliveryStopUpdate,
    RouteHandoverUpdate,
)
from app.utils.auth_dependency import verify_firebase_token
from app.services.route_optimizer import optimize_route_from_requests
from app.services.fulfillment import advance_handover

router = APIRouter(prefix="/api/routes", tags=["routes"])
logger = logging.getLogger(__name__)

def stop_response(stop: DeliveryStop, agreement: FulfillmentAgreement | None):
    result = DeliveryStopResponse.model_validate(stop)
    if agreement:
        result.fulfillment_stage = agreement.stage
        result.fulfillment_method = agreement.method
    return result

@router.post("/from-requests", response_model=DeliveryRouteResponse)
async def create_route_from_requests(
    route_data: DeliveryRouteCreate,
    db: Session = Depends(get_db),
    firebase_user: dict = Depends(verify_firebase_token)
):
    """Generate route from selected produce requests"""
    seller = db.query(User).filter(User.firebase_uid == firebase_user["uid"]).first()
    if not seller:
        raise HTTPException(status_code=404, detail="User not found")
    
    if seller.role != "farmer":
        raise HTTPException(status_code=403, detail="Only farmers can create delivery routes")

    if len(set(route_data.request_ids)) != len(route_data.request_ids):
        raise HTTPException(status_code=400, detail="Request IDs must be unique")
    if not route_data.route_name.strip() or not route_data.pickup_location.strip():
        raise HTTPException(status_code=400, detail="Route name and pickup are required")

    # Lock assigned requests so concurrent saves cannot schedule them twice.
    requests = db.query(ProduceRequest).filter(
        ProduceRequest.id.in_(route_data.request_ids),
        ProduceRequest.assigned_seller_id == seller.id,
        ProduceRequest.status == "accepted",
    ).order_by(ProduceRequest.id).with_for_update().all()
    
    if len(requests) != len(route_data.request_ids):
        raise HTTPException(status_code=400, detail="All requests must be accepted and assigned to you")

    agreements = db.query(FulfillmentAgreement).filter(
        FulfillmentAgreement.request_id.in_(route_data.request_ids)
    ).all()
    if any(
        item.method != "farmer_delivery" or item.accepted_revision != item.revision
        or item.stage not in ["accepted", "ready"]
        for item in agreements
    ):
        raise HTTPException(409, "Only customer-approved farmer delivery orders can be scheduled")

    scheduled = db.query(DeliveryStop).join(DeliveryRoute).filter(
        DeliveryStop.request_id.in_(route_data.request_ids),
        DeliveryRoute.status != "cancelled",
    ).first()
    if scheduled:
        raise HTTPException(status_code=409, detail="A selected request already has a saved route; open Saved Routes to resume it")

    # Create delivery route
    new_route = DeliveryRoute(
        seller_id=seller.id,
        route_name=route_data.route_name,
        pickup_location=route_data.pickup_location,
        pickup_latitude=route_data.pickup_latitude,
        pickup_longitude=route_data.pickup_longitude,
        delivery_date=route_data.delivery_date
    )
    try:
        db.add(new_route)
        db.flush()
        await create_optimized_stops(new_route, requests, db)
        db.commit()
    except Exception:
        db.rollback()
        logger.exception("Could not save delivery route")
        raise
    db.refresh(new_route)

    return new_route

async def create_optimized_stops(route: DeliveryRoute, requests: List[ProduceRequest], db: Session):
    """Create and optimize delivery stops for a route"""
    # Use the existing route optimizer
    from app.models.route import RouteRequest, Stop
    
    stops_data = [Stop(address=req.delivery_address) for req in requests]
    route_request = RouteRequest(pickup=route.pickup_location, stops=stops_data)
    
    # Get optimized route
    try:
        optimized = await optimize_route_from_requests(route_request)
    except ValueError as exc:
        logger.warning("Delivery route optimization failed: %s", exc)
        raise HTTPException(status_code=422, detail=str(exc)) from exc

    # Optimizer responses include pickup first; duplicate addresses still refer
    # to distinct orders and must consume separate matches.
    remaining = list(requests)
    deliveries = optimized.stops[1:]
    if len(deliveries) != len(requests):
        raise HTTPException(status_code=422, detail="Every delivery address must be geocoded; correct the addresses and retry")
    
    # Create delivery stops in optimized order
    for i, optimized_stop in enumerate(deliveries):
        # Find matching request by address
        matching_request = next(
            (req for req in remaining if req.delivery_address == optimized_stop.address),
            None
        )
        
        if matching_request is None:
            raise HTTPException(status_code=422, detail="Optimized stops do not match the selected orders")
        else:
            remaining.remove(matching_request)
            stop = DeliveryStop(
                route_id=route.id,
                request_id=matching_request.id,
                stop_order=i + 1,
                address=optimized_stop.address,
                latitude=optimized_stop.location[1],
                longitude=optimized_stop.location[0],
                estimated_arrival=None  # Could calculate based on route timing
            )
            db.add(stop)
    
    # Update route with optimization results
    route.total_distance_miles = optimized.total_distance_miles
    route.estimated_duration_minutes = optimized.total_eta
    
@router.get("/active", response_model=List[DeliveryRouteResponse])
async def get_active_routes(
    db: Session = Depends(get_db),
    firebase_user: dict = Depends(verify_firebase_token)
):
    """Get active delivery routes for seller"""
    seller = db.query(User).filter(User.firebase_uid == firebase_user["uid"]).first()
    if not seller:
        raise HTTPException(status_code=404, detail="User not found")

    routes = db.query(DeliveryRoute).filter(
        DeliveryRoute.seller_id == seller.id,
        DeliveryRoute.status.in_(["planned", "active"])
    ).all()
    
    return routes

@router.get("/all", response_model=List[DeliveryRouteResponse])
async def get_all_routes(
    db: Session = Depends(get_db),
    firebase_user: dict = Depends(verify_firebase_token)
):
    """Get all delivery routes for seller (including completed)"""
    seller = db.query(User).filter(User.firebase_uid == firebase_user["uid"]).first()
    if not seller:
        raise HTTPException(status_code=404, detail="User not found")

    routes = db.query(DeliveryRoute).filter(
        DeliveryRoute.seller_id == seller.id
    ).order_by(DeliveryRoute.created_at.desc()).all()
    
    return routes

@router.post("/{route_id}/optimize")
async def re_optimize_route(
    route_id: int,
    db: Session = Depends(get_db),
    firebase_user: dict = Depends(verify_firebase_token)
):
    """Re-optimize existing route"""
    seller = db.query(User).filter(User.firebase_uid == firebase_user["uid"]).first()
    if not seller:
        raise HTTPException(status_code=404, detail="User not found")

    route = db.query(DeliveryRoute).filter(
        DeliveryRoute.id == route_id,
        DeliveryRoute.seller_id == seller.id
    ).with_for_update().first()
    
    if not route:
        raise HTTPException(status_code=404, detail="Route not found")

    if route.status != "planned":
        raise HTTPException(status_code=409, detail="Only unstarted planned routes can be re-optimized")

    # Get current stops and requests
    stops = db.query(DeliveryStop).filter(DeliveryStop.route_id == route_id).all()
    if any(stop.status != "pending" for stop in stops):
        raise HTTPException(status_code=409, detail="Cannot replace stops after delivery progress has been recorded")
    request_ids = [stop.request_id for stop in stops]
    requests = db.query(ProduceRequest).filter(ProduceRequest.id.in_(request_ids)).all()

    try:
        for stop in stops:
            db.delete(stop)
        await create_optimized_stops(route, requests, db)
        db.commit()
    except Exception:
        db.rollback()
        logger.exception("Could not re-optimize delivery route %s", route_id)
        raise
    
    return {"message": "Route re-optimized successfully"}

@router.put("/{route_id}/status")
async def update_route_status(
    route_id: int,
    status: str,
    db: Session = Depends(get_db),
    firebase_user: dict = Depends(verify_firebase_token)
):
    """Update delivery route status"""
    seller = db.query(User).filter(User.firebase_uid == firebase_user["uid"]).first()
    if not seller:
        raise HTTPException(status_code=404, detail="User not found")

    route = db.query(DeliveryRoute).filter(
        DeliveryRoute.id == route_id,
        DeliveryRoute.seller_id == seller.id
    ).with_for_update().first()
    
    if not route:
        raise HTTPException(status_code=404, detail="Route not found")

    if status not in ["planned", "active", "completed", "cancelled"]:
        raise HTTPException(status_code=400, detail="Invalid status")

    if status == "completed":
        stops = db.query(DeliveryStop).filter(DeliveryStop.route_id == route_id).all()
        if not stops or any(stop.status != "delivered" for stop in stops):
            raise HTTPException(status_code=409, detail="Mark every stop delivered before completing the route; resolve skipped stops first")

    route.status = status
    db.commit()
    
    return {"message": f"Route status updated to {status}"}

@router.get("/{route_id}/stops", response_model=List[DeliveryStopResponse])
async def get_route_stops(
    route_id: int,
    db: Session = Depends(get_db),
    firebase_user: dict = Depends(verify_firebase_token)
):
    """Get stops for a specific route"""
    seller = db.query(User).filter(User.firebase_uid == firebase_user["uid"]).first()
    if not seller:
        raise HTTPException(status_code=404, detail="User not found")

    route = db.query(DeliveryRoute).filter(
        DeliveryRoute.id == route_id,
        DeliveryRoute.seller_id == seller.id
    ).first()
    
    if not route:
        raise HTTPException(status_code=404, detail="Route not found")

    stops = db.query(DeliveryStop).filter(
        DeliveryStop.route_id == route_id
    ).order_by(DeliveryStop.stop_order).all()
    
    agreements = {
        item.request_id: item for item in db.query(FulfillmentAgreement).filter(
            FulfillmentAgreement.request_id.in_([stop.request_id for stop in stops])
        ).all()
    }
    return [stop_response(stop, agreements.get(stop.request_id)) for stop in stops]


@router.put("/{route_id}/stops/{stop_id}/status", response_model=DeliveryStopResponse)
async def update_stop_status(
    route_id: int,
    stop_id: int,
    updates: DeliveryStopUpdate,
    db: Session = Depends(get_db),
    firebase_user: dict = Depends(verify_firebase_token),
):
    seller = db.query(User).filter(User.firebase_uid == firebase_user["uid"]).first()
    if not seller:
        raise HTTPException(status_code=404, detail="User not found")
    route = db.query(DeliveryRoute).filter(
        DeliveryRoute.id == route_id, DeliveryRoute.seller_id == seller.id
    ).with_for_update().first()
    if not route:
        raise HTTPException(status_code=404, detail="Route not found")
    if route.status not in ["planned", "active"]:
        raise HTTPException(status_code=409, detail="Reopen the route before updating delivery progress")
    stop = db.query(DeliveryStop).filter(
        DeliveryStop.id == stop_id, DeliveryStop.route_id == route_id
    ).first()
    if not stop:
        raise HTTPException(status_code=404, detail="Stop not found")
    agreement = db.query(FulfillmentAgreement).filter(
        FulfillmentAgreement.request_id == stop.request_id
    ).with_for_update().first()
    if agreement and agreement.stage == "delivered" and updates.status != "delivered":
        raise HTTPException(409, "This order is confirmed delivered; its route stop cannot be reset")
    if updates.status in ["arrived", "delivered"]:
        if stop.actual_arrival is None:
            stop.actual_arrival = datetime.now(timezone.utc)
    else:
        stop.actual_arrival = None
    stop.status = updates.status
    if updates.status != "pending":
        route.status = "active"
    db.commit()
    db.refresh(stop)
    return stop_response(stop, agreement)


@router.put("/{route_id}/stops/{stop_id}/handover", response_model=DeliveryStopResponse)
async def update_stop_handover(
    route_id: int,
    stop_id: int,
    updates: RouteHandoverUpdate,
    db: Session = Depends(get_db),
    firebase_user: dict = Depends(verify_firebase_token),
):
    seller = db.query(User).filter(User.firebase_uid == firebase_user["uid"]).first()
    if not seller or seller.role != "farmer":
        raise HTTPException(403, "Farmer account required")
    route = db.query(DeliveryRoute).filter(
        DeliveryRoute.id == route_id, DeliveryRoute.seller_id == seller.id
    ).with_for_update().first()
    if not route:
        raise HTTPException(404, "Route not found")
    stop = db.query(DeliveryStop).filter(
        DeliveryStop.id == stop_id, DeliveryStop.route_id == route_id
    ).first()
    if not stop:
        raise HTTPException(404, "Stop not found")
    if route.status == "cancelled":
        raise HTTPException(409, "Cancelled routes cannot confirm order handover")
    agreement = db.query(FulfillmentAgreement).filter(
        FulfillmentAgreement.request_id == stop.request_id
    ).with_for_update().first()
    if not agreement:
        raise HTTPException(409, "This historical order does not use fulfillment agreements")
    if agreement.method != "farmer_delivery":
        raise HTTPException(409, "Pickup orders cannot be completed from a delivery route")
    order = db.query(ProduceRequest).filter(ProduceRequest.id == stop.request_id).with_for_update().one()
    advance_handover(agreement, order, updates.stage, seller.id)
    if route.status == "planned":
        route.status = "active"
    if updates.stage == "delivered":
        stop.status = "delivered"
        if stop.actual_arrival is None:
            stop.actual_arrival = datetime.now(timezone.utc)
    db.commit()
    db.refresh(stop)
    return stop_response(stop, agreement)
