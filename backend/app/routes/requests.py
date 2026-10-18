from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from typing import List, Optional
from datetime import datetime
from app.db.database import get_db
from app.models.produce import ProduceRequest
from app.models.fulfillment import FulfillmentAgreement
from app.models.user import User
from app.schemas.produce import (
    ProduceRequestCreate, 
    ProduceRequestUpdate, 
    ProduceRequestResponse
)
from app.utils.auth_dependency import verify_firebase_token
from app.services.menurithm_api import menurithm_client

router = APIRouter(prefix="/api/requests", tags=["requests"])

@router.get("/health")
async def health_check():
    """Simple health check endpoint without authentication"""
    return {"status": "healthy", "message": "Produce requests API is running"}

@router.get("/test-auth")
async def test_auth_check(
    db: Session = Depends(get_db),
    firebase_user: dict = Depends(verify_firebase_token)
):
    """Test endpoint to check authentication and auto-user creation"""
    firebase_uid = firebase_user["uid"]
    user = db.query(User).filter(User.firebase_uid == firebase_uid).first()
    
    if not user:
        # Auto-create user
        email = firebase_user.get("email", f"{firebase_uid}@example.com")
        name = firebase_user.get("name", "Unknown User")
        
        user = User(
            firebase_uid=firebase_uid,
            email=email,
            full_name=name,
            role="farmer",
            organization="Auto-Generated",
            country="Unknown"
        )
        db.add(user)
        db.commit()
        db.refresh(user)
    
    return {
        "firebase_uid": firebase_uid,
        "user_id": user.id,
        "email": user.email,
        "role": user.role,
        "message": "Authentication successful"
    }

@router.post("", response_model=ProduceRequestResponse)
async def create_produce_request(
    request: ProduceRequestCreate,
    db: Session = Depends(get_db),
    firebase_user: dict = Depends(verify_firebase_token)
):
    """Create new produce request (for restaurants)"""
    restaurant = db.query(User).filter(User.firebase_uid == firebase_user["uid"]).first()
    if not restaurant:
        raise HTTPException(status_code=404, detail="User not found")
    
    if restaurant.role != "restaurant":
        raise HTTPException(status_code=403, detail="Only restaurants can create produce requests")

    new_request = ProduceRequest(
        restaurant_id=restaurant.id,
        **request.model_dump()
    )
    db.add(new_request)
    db.commit()
    db.refresh(new_request)
    return new_request

@router.get("/debug", response_model=List[ProduceRequestResponse])
async def debug_get_produce_requests(
    status: Optional[str] = Query(None),
    produce_type: Optional[str] = Query(None),
    skip: int = Query(0),
    limit: int = Query(50),
    db: Session = Depends(get_db)
):
    """Debug endpoint - get requests without authentication"""
    try:
        query = db.query(ProduceRequest)

        if status:
            query = query.filter(ProduceRequest.status == status)
        
        if produce_type:
            query = query.filter(ProduceRequest.produce_type.ilike(f"%{produce_type}%"))

        requests = query.offset(skip).limit(limit).all()
        print(f"📊 Found {len(requests)} requests")
        return requests
    except Exception as e:
        print(f"❌ Error in debug endpoint: {e}")
        raise HTTPException(status_code=500, detail=f"Debug error: {str(e)}")

@router.get("", response_model=List[ProduceRequestResponse])
async def get_produce_requests(
    status: Optional[str] = Query(None),
    produce_type: Optional[str] = Query(None),
    delivery_only: bool = Query(False),
    legacy_only: bool = Query(False),
    skip: int = Query(0),
    limit: int = Query(50),
    db: Session = Depends(get_db),
    firebase_user: dict = Depends(verify_firebase_token)
):
    """List produce requests with filters"""
    try:
        firebase_uid = firebase_user["uid"]
        print(f"🔍 Looking for user with Firebase UID: {firebase_uid}")
        
        user = db.query(User).filter(User.firebase_uid == firebase_uid).first()
        
        if not user:
            print(f"❌ User not found in database for Firebase UID: {firebase_uid}")
            # Let's check how many users are in the database
            total_users = db.query(User).count()
            print(f"📊 Total users in database: {total_users}")
            
            # Let's see what users exist
            all_users = db.query(User.firebase_uid, User.email, User.role).limit(5).all()
            print(f"📋 Sample users: {all_users}")
            
            # Auto-create a basic user record for this Firebase user
            email = firebase_user.get("email", f"{firebase_uid}@example.com")
            name = firebase_user.get("name", "Unknown User")
            
            print(f"🔧 Auto-creating user with email: {email}")
            
            user = User(
                firebase_uid=firebase_uid,
                email=email,
                full_name=name,
                role="farmer",  # Default to farmer, can be changed later
                organization="Auto-Generated",
                country="Unknown"
            )
            db.add(user)
            db.commit()
            db.refresh(user)
            
            print(f"✅ Created new user: {user.email} (ID: {user.id})")
        
        print(f"✅ Found/Created user: {user.email} (role: {user.role})")

        query = db.query(ProduceRequest)

        # Filter based on user role
        if user.role == "restaurant":
            query = query.filter(ProduceRequest.restaurant_id == user.id)
        elif user.role == "farmer":
            # Farmers see unassigned requests or requests assigned to them
            query = query.filter(
                (ProduceRequest.assigned_seller_id == None) |
                (ProduceRequest.assigned_seller_id == user.id)
            )

        if status:
            query = query.filter(ProduceRequest.status == status)

        if delivery_only:
            query = query.outerjoin(FulfillmentAgreement, FulfillmentAgreement.request_id == ProduceRequest.id).filter(
                (FulfillmentAgreement.id.is_(None)) |
                ((FulfillmentAgreement.method == "farmer_delivery") &
                 (FulfillmentAgreement.accepted_revision == FulfillmentAgreement.revision) &
                 (FulfillmentAgreement.stage.in_(["accepted", "ready"])))
            )
        elif legacy_only:
            query = query.outerjoin(FulfillmentAgreement, FulfillmentAgreement.request_id == ProduceRequest.id).filter(
                FulfillmentAgreement.id.is_(None)
            )

        if produce_type:
            query = query.filter(ProduceRequest.produce_type.ilike(f"%{produce_type}%"))

        requests = query.offset(skip).limit(limit).all()
        print(f"📦 Found {len(requests)} requests for user")
        return requests
    except HTTPException:
        raise
    except Exception as e:
        print(f"❌ Error in get_produce_requests: {e}")
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")

@router.get("/seller/{seller_id}", response_model=List[ProduceRequestResponse])
async def get_requests_for_seller(
    seller_id: int,
    db: Session = Depends(get_db),
    firebase_user: dict = Depends(verify_firebase_token)
):
    """Get requests assigned to specific seller"""
    user = db.query(User).filter(User.firebase_uid == firebase_user["uid"]).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    # Only allow sellers to see their own requests or admin users
    if user.id != seller_id and user.role != "admin":
        raise HTTPException(status_code=403, detail="Access denied")

    requests = db.query(ProduceRequest).filter(
        ProduceRequest.assigned_seller_id == seller_id
    ).all()
    
    return requests

@router.put("/{request_id}/status", response_model=ProduceRequestResponse)
async def update_request_status(
    request_id: int,
    updates: ProduceRequestUpdate,
    db: Session = Depends(get_db),
    firebase_user: dict = Depends(verify_firebase_token)
):
    """Update request status (accept/decline) and notify Menurithm"""
    user = db.query(User).filter(User.firebase_uid == firebase_user["uid"]).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    request = db.query(ProduceRequest).filter(ProduceRequest.id == request_id).first()
    if not request:
        raise HTTPException(status_code=404, detail="Request not found")

    if db.query(FulfillmentAgreement).filter(FulfillmentAgreement.request_id == request_id).first():
        raise HTTPException(409, "Use the fulfillment workspace to quote, accept and complete this order")

    # Only farmers can accept/decline requests, restaurants can update their own
    if user.role == "farmer" and updates.status in ["accepted", "declined", "pending"]:
        old_status = request.status
        
        # If setting back to pending (un-accepting), clear the assigned seller
        if updates.status == "pending":
            request.assigned_seller_id = None
        elif updates.status == "accepted":
            request.assigned_seller_id = user.id
        else:  # declined
            request.assigned_seller_id = None
            
        request.status = updates.status
        
        # Notify Menurithm if this was a Menurithm request
        if request.menurithm_request_id:
            try:
                response_data = {
                    "status": updates.status,
                    "supplier_id": user.email,
                    "message": updates.special_requirements or f"Request {updates.status} by {user.full_name}",
                    "estimated_delivery_date": None,  # Could be added to updates schema
                    "price_quote": None  # Could be added to updates schema
                }
                
                await menurithm_client.respond_to_request(
                    request.menurithm_request_id, 
                    response_data
                )
                print(f"✅ Notified Menurithm of status change: {old_status} -> {updates.status}")
                
            except Exception as e:
                print(f"❌ Failed to notify Menurithm: {e}")
                # Don't fail the whole request if Menurithm notification fails
        
    elif user.role == "restaurant" and request.restaurant_id == user.id:
        # Restaurants can update their own requests
        for field, value in updates.model_dump(exclude_unset=True).items():
            setattr(request, field, value)
    else:
        raise HTTPException(status_code=403, detail="Access denied")

    db.commit()
    db.refresh(request)
    return request

@router.get("/{request_id}", response_model=ProduceRequestResponse)
async def get_produce_request(
    request_id: int,
    db: Session = Depends(get_db),
    firebase_user: dict = Depends(verify_firebase_token)
):
    """Get specific produce request"""
    user = db.query(User).filter(User.firebase_uid == firebase_user["uid"]).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    request = db.query(ProduceRequest).filter(ProduceRequest.id == request_id).first()
    if not request:
        raise HTTPException(status_code=404, detail="Request not found")

    # Check access permissions
    if (user.role == "restaurant" and request.restaurant_id != user.id) or \
       (user.role == "farmer" and request.assigned_seller_id != user.id and request.assigned_seller_id is not None):
        raise HTTPException(status_code=403, detail="Access denied")

    return request

# Menurithm Integration Endpoints

@router.post("/menurithm/sync")
async def sync_requests_with_menurithm(
    db: Session = Depends(get_db),
    firebase_user: dict = Depends(verify_firebase_token)
):
    """Pull latest requests from Menurithm for this supplier"""
    user = db.query(User).filter(User.firebase_uid == firebase_user["uid"]).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    if user.role != "farmer":
        raise HTTPException(status_code=403, detail="Only farmers can sync Menurithm requests")

    try:
        supplier_id = user.email
        menurithm_requests = await menurithm_client.get_produce_requests(supplier_id)
        
        synced_count = 0
        for m_request in menurithm_requests:
            # Check if request already exists
            existing = db.query(ProduceRequest).filter(
                ProduceRequest.menurithm_request_id == m_request.get("request_id")
            ).first()
            
            if not existing:
                # Create new request from Menurithm data
                new_request = ProduceRequest(
                    restaurant_id=None,
                    restaurant_name=m_request.get("restaurant_name", "Menurithm Restaurant"),
                    produce_type=m_request.get("produce_type"),
                    quantity_needed=float(m_request.get("quantity", 0)),
                    unit=m_request.get("unit", "kg"),
                    max_price_per_unit=m_request.get("max_price"),
                    delivery_address=m_request.get("delivery_address"),
                    delivery_window_start=datetime.fromisoformat(m_request.get("delivery_window_start")),
                    delivery_window_end=datetime.fromisoformat(m_request.get("delivery_window_end")),
                    special_requirements=m_request.get("special_requirements"),
                    menurithm_request_id=m_request.get("request_id"),
                    status="pending"
                )
                db.add(new_request)
                synced_count += 1
        
        db.commit()
        
        return {
            "message": f"Synced {synced_count} new requests from Menurithm",
            "synced_count": synced_count,
            "total_menurithm_requests": len(menurithm_requests)
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to sync with Menurithm: {str(e)}")

@router.put("/{request_id}/delivery-status")
async def update_delivery_status(
    request_id: int,
    status: str,
    delivery_notes: Optional[str] = None,
    db: Session = Depends(get_db),
    firebase_user: dict = Depends(verify_firebase_token)
):
    """Update delivery status and notify Menurithm"""
    user = db.query(User).filter(User.firebase_uid == firebase_user["uid"]).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    request = db.query(ProduceRequest).filter(ProduceRequest.id == request_id).first()
    if not request:
        raise HTTPException(status_code=404, detail="Request not found")
    
    if user.role != "farmer" or request.assigned_seller_id != user.id:
        raise HTTPException(status_code=403, detail="Only assigned farmers can update delivery status")

    if db.query(FulfillmentAgreement).filter(FulfillmentAgreement.request_id == request_id).first():
        raise HTTPException(409, "Use the fulfillment workspace to complete this order")

    valid_statuses = ["in_transit", "delivered", "failed"]
    if status not in valid_statuses:
        raise HTTPException(status_code=400, detail=f"Invalid status. Must be one of: {valid_statuses}")

    # Update local status
    request.status = "completed" if status == "delivered" else "active"
    
    # Notify Menurithm if this was a Menurithm request
    if request.menurithm_request_id:
        try:
            status_data = {
                "status": status,
                "delivery_notes": delivery_notes,
                "actual_delivery_time": datetime.now().isoformat() if status == "delivered" else None
            }
            
            await menurithm_client.update_delivery_status(
                request.menurithm_request_id,
                status_data
            )
            print(f"✅ Updated Menurithm delivery status: {status}")
            
        except Exception as e:
            print(f"❌ Failed to update Menurithm delivery status: {e}")
            # Don't fail the whole request if Menurithm notification fails
    
    db.commit()
    db.refresh(request)
    
    return {
        "message": f"Delivery status updated to {status}",
        "request": request
    }
