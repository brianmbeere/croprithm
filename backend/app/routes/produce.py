from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import func
from typing import List, Optional
from app.db.database import get_db
from app.models.produce import ProduceInventory, ProduceRequest
from app.models.fulfillment import FulfillmentAgreement
from app.models.user import User
from app.schemas.produce import (
    ProduceInventoryCreate, 
    ProduceInventoryUpdate, 
    ProduceInventoryResponse
)
from app.utils.auth_dependency import verify_firebase_token
from app.services.menurithm_api import menurithm_client

router = APIRouter(prefix="/api/produce", tags=["produce"])


def inventory_with_commitments(db: Session):
    committed = db.query(func.coalesce(func.sum(ProduceRequest.quantity_needed), 0)).select_from(
        FulfillmentAgreement
    ).join(ProduceRequest, ProduceRequest.id == FulfillmentAgreement.request_id).filter(
        FulfillmentAgreement.stock_reserved.is_(True),
        FulfillmentAgreement.produce_inventory_id == ProduceInventory.id,
    ).correlate(ProduceInventory).scalar_subquery()
    return db.query(ProduceInventory, committed)


def inventory_response(item: ProduceInventory, committed: float):
    return ProduceInventoryResponse.model_validate(item).model_copy(update={"quantity_committed": committed})


@router.post("/inventory", response_model=ProduceInventoryResponse)
async def create_produce_inventory(
    inventory: ProduceInventoryCreate,
    db: Session = Depends(get_db),
    firebase_user: dict = Depends(verify_firebase_token)
):
    """Add new produce items to seller's inventory"""
    # Get seller from firebase_uid
    seller = db.query(User).filter(User.firebase_uid == firebase_user["uid"]).first()
    if not seller:
        raise HTTPException(status_code=404, detail="User not found")
    
    if seller.role != "farmer":
        raise HTTPException(status_code=403, detail="Only farmers can add produce inventory")

    new_inventory = ProduceInventory(
        seller_id=seller.id,
        **inventory.model_dump()
    )
    db.add(new_inventory)
    db.commit()
    db.refresh(new_inventory)
    return new_inventory

@router.get("/inventory", response_model=List[ProduceInventoryResponse])
async def get_seller_inventory(
    db: Session = Depends(get_db),
    firebase_user: dict = Depends(verify_firebase_token)
):
    """Get seller's produce inventory"""
    seller = db.query(User).filter(User.firebase_uid == firebase_user["uid"]).first()
    if not seller:
        raise HTTPException(status_code=404, detail="User not found")

    inventory = inventory_with_commitments(db).filter(
        ProduceInventory.seller_id == seller.id
    ).all()
    return [inventory_response(item, committed) for item, committed in inventory]

@router.put("/inventory/{inventory_id}", response_model=ProduceInventoryResponse)
async def update_produce_inventory(
    inventory_id: int,
    updates: ProduceInventoryUpdate,
    db: Session = Depends(get_db),
    firebase_user: dict = Depends(verify_firebase_token)
):
    """Update produce inventory item"""
    seller = db.query(User).filter(User.firebase_uid == firebase_user["uid"]).first()
    if not seller:
        raise HTTPException(status_code=404, detail="User not found")

    inventory = db.query(ProduceInventory).filter(
        ProduceInventory.id == inventory_id,
        ProduceInventory.seller_id == seller.id
    ).with_for_update().first()
    
    if not inventory:
        raise HTTPException(status_code=404, detail="Inventory item not found")

    # Update only provided fields
    fields = updates.model_dump(exclude_unset=True, exclude={"expected_quantity_available"})
    for field in {"quantity_available", "price_per_unit", "unit", "produce_type", "location", "is_available"} & fields.keys():
        if fields[field] is None or (isinstance(fields[field], str) and not fields[field].strip()):
            raise HTTPException(422, f"{field} cannot be blank.")
    if "quantity_available" in fields and updates.expected_quantity_available != inventory.quantity_available:
        raise HTTPException(409, "Stock changed or the previous count is missing. Refresh inventory and retry.")
    if any(field in fields and fields[field] != getattr(inventory, field) for field in ("unit", "produce_type")):
        if db.query(FulfillmentAgreement.id).filter(
            FulfillmentAgreement.produce_inventory_id == inventory.id,
            FulfillmentAgreement.stage.in_(["requested", "quoted", "accepted", "ready"]),
        ).first():
            raise HTTPException(409, "Cannot change the crop or unit while orders reference this listing.")
    for field, value in fields.items():
        setattr(inventory, field, value)

    db.flush()
    item, committed = inventory_with_commitments(db).filter(ProduceInventory.id == inventory_id).one()
    response = inventory_response(item, committed)
    db.commit()
    return response

@router.delete("/inventory/{inventory_id}")
async def delete_produce_inventory(
    inventory_id: int,
    db: Session = Depends(get_db),
    firebase_user: dict = Depends(verify_firebase_token)
):
    """Remove produce inventory item"""
    seller = db.query(User).filter(User.firebase_uid == firebase_user["uid"]).first()
    if not seller:
        raise HTTPException(status_code=404, detail="User not found")

    inventory = db.query(ProduceInventory).filter(
        ProduceInventory.id == inventory_id,
        ProduceInventory.seller_id == seller.id
    ).with_for_update().first()
    
    if not inventory:
        raise HTTPException(status_code=404, detail="Inventory item not found")

    if db.query(FulfillmentAgreement.id).filter_by(produce_inventory_id=inventory.id).first():
        raise HTTPException(409, "This listing has order history. Pause it instead of deleting it.")
    db.delete(inventory)
    db.commit()
    return {"message": "Inventory item deleted successfully"}

@router.get("/available", response_model=List[ProduceInventoryResponse])
async def get_available_produce(
    produce_type: Optional[str] = Query(None),
    location: Optional[str] = Query(None),
    organic_only: bool = Query(False),
    max_price: Optional[float] = Query(None),
    skip: int = Query(0),
    limit: int = Query(50),
    db: Session = Depends(get_db)
):
    """Get all available produce (public endpoint)"""
    query = db.query(ProduceInventory).filter(
        ProduceInventory.is_available == True,
        ProduceInventory.quantity_available > 0
    ).options(joinedload(ProduceInventory.seller))

    if produce_type:
        query = query.filter(ProduceInventory.produce_type.ilike(f"%{produce_type}%"))
    
    if location:
        query = query.filter(ProduceInventory.location.ilike(f"%{location}%"))
    
    if organic_only:
        query = query.filter(ProduceInventory.organic == True)
    
    if max_price:
        query = query.filter(ProduceInventory.price_per_unit <= max_price)

    listings = query.offset(skip).limit(limit).all()
    return [
        {
            **ProduceInventoryResponse.model_validate(listing).model_dump(),
            "seller_name": listing.seller.full_name,
            "seller_contact": listing.seller.email,
        }
        for listing in listings
    ]

@router.get("/search", response_model=List[ProduceInventoryResponse])
async def search_produce(
    q: str = Query(..., description="Search query"),
    db: Session = Depends(get_db)
):
    """Search produce by type, variety, or description"""
    query = db.query(ProduceInventory).filter(
        ProduceInventory.is_available == True,
        ProduceInventory.quantity_available > 0
    ).filter(
        ProduceInventory.produce_type.ilike(f"%{q}%") |
        ProduceInventory.variety.ilike(f"%{q}%") |
        ProduceInventory.description.ilike(f"%{q}%")
    )
    
    return query.all()

@router.get("/seller/{seller_id}", response_model=List[ProduceInventoryResponse])
async def get_seller_produce(
    seller_id: int,
    db: Session = Depends(get_db)
):
    """Get specific seller's available produce"""
    seller = db.query(User).filter(User.id == seller_id).first()
    if not seller:
        raise HTTPException(status_code=404, detail="Seller not found")

    inventory = db.query(ProduceInventory).filter(
        ProduceInventory.seller_id == seller_id,
        ProduceInventory.is_available == True,
        ProduceInventory.quantity_available > 0
    ).all()
    
    return inventory

# Menurithm Integration Endpoints

@router.post("/menurithm/register-supplier")
async def register_with_menurithm(
    db: Session = Depends(get_db),
    firebase_user: dict = Depends(verify_firebase_token)
):
    """Register current user as a supplier with Menurithm"""
    seller = db.query(User).filter(User.firebase_uid == firebase_user["uid"]).first()
    if not seller:
        raise HTTPException(status_code=404, detail="User not found")
    
    if seller.role != "farmer":
        raise HTTPException(status_code=403, detail="Only farmers can register as suppliers")

    try:
        supplier_data = {
            "name": seller.full_name,
            "email": seller.email,
            "phone": getattr(seller, 'phone', ''),
            "address": seller.organization,  # Using organization as address for now
            "latitude": None,  # Could be added to user model later
            "longitude": None,
            "categories": ["fresh_produce"],
            "delivery_radius": 50
        }
        
        result = await menurithm_client.register_supplier(supplier_data)
        
        # Store Menurithm supplier ID in user record if we add that field
        # seller.menurithm_supplier_id = result.get("supplier_id")
        # db.commit()
        
        return {
            "message": "Successfully registered with Menurithm",
            "supplier_data": result
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to register with Menurithm: {str(e)}")

@router.post("/menurithm/sync-inventory")
async def sync_inventory_with_menurithm(
    db: Session = Depends(get_db),
    firebase_user: dict = Depends(verify_firebase_token)
):
    """Sync current inventory with Menurithm"""
    seller = db.query(User).filter(User.firebase_uid == firebase_user["uid"]).first()
    if not seller:
        raise HTTPException(status_code=404, detail="User not found")
    
    if seller.role != "farmer":
        raise HTTPException(status_code=403, detail="Only farmers can sync inventory")

    # Get seller's inventory
    inventory = db.query(ProduceInventory).filter(
        ProduceInventory.seller_id == seller.id,
        ProduceInventory.is_available == True
    ).all()

    if not inventory:
        return {"message": "No inventory to sync", "synced_items": 0}

    try:
        # Convert inventory to Menurithm format
        inventory_items = []
        for item in inventory:
            inventory_items.append({
                "id": item.id,
                "produce_type": item.produce_type,
                "variety": item.variety,
                "quantity_available": item.quantity_available,
                "unit": item.unit,
                "price_per_unit": item.price_per_unit,
                "organic": item.organic,
                "harvest_date": item.harvest_date.isoformat() if item.harvest_date else None,
                "expiry_date": item.expiry_date.isoformat() if item.expiry_date else None,
                "description": item.description,
                "is_available": item.is_available
            })
        
        # Use seller's email as supplier_id for now (could be improved with actual supplier_id)
        supplier_id = seller.email
        result = await menurithm_client.update_inventory(supplier_id, inventory_items)
        
        return {
            "message": "Inventory successfully synced with Menurithm",
            "synced_items": len(inventory_items),
            "menurithm_response": result
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to sync with Menurithm: {str(e)}")

@router.get("/menurithm/requests")
async def get_menurithm_requests(
    db: Session = Depends(get_db),
    firebase_user: dict = Depends(verify_firebase_token)
):
    """Get produce requests from Menurithm for this supplier"""
    seller = db.query(User).filter(User.firebase_uid == firebase_user["uid"]).first()
    if not seller:
        raise HTTPException(status_code=404, detail="User not found")
    
    if seller.role != "farmer":
        raise HTTPException(status_code=403, detail="Only farmers can view Menurithm requests")

    try:
        supplier_id = seller.email  # Using email as supplier_id
        requests = await menurithm_client.get_produce_requests(supplier_id)
        
        return {
            "menurithm_requests": requests,
            "count": len(requests)
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to fetch Menurithm requests: {str(e)}")
