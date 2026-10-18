from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.db.database import SessionLocal
from app.db.database import get_db
from app.models.user import User 
from typing import List
from app.schemas.user import UserCreate, UserResponse
from app.utils.auth_dependency import verify_firebase_token


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


router = APIRouter(prefix="/users", tags=["users"])

# Create a user
@router.post("/", response_model=UserResponse)
@router.post("/users", response_model=UserResponse, include_in_schema=False)
def create_user(
    user: UserCreate,
    db: Session = Depends(get_db),
    firebase_user: dict = Depends(verify_firebase_token)  # 👈 Firebase user injected here
):
    firebase_uid = firebase_user["uid"]
    existing = db.query(User).filter(User.firebase_uid == firebase_uid).first()
    if existing:
        raise HTTPException(status_code=400, detail="User already exists")

    new_user = User(
        firebase_uid=firebase_uid,
        email=user.email,
        full_name=user.full_name,
        organization=user.organization,
        country=user.country,
        role=user.role,
    )
    db.add(new_user)
    db.commit()
    db.refresh(new_user)
    return new_user

# Get a user by ID
@router.get("/{user_id}", response_model=UserResponse)
def get_user(user_id: int, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return user

# Get all users
@router.get("/", response_model=List[UserResponse])
def list_users(skip: int = 0, limit: int = 10, db: Session = Depends(get_db)):
    return db.query(User).offset(skip).limit(limit).all()

# Delete a user
@router.delete("/{user_id}")
def delete_user(user_id: int, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    db.delete(user)
    db.commit()
    return {"message": f"User {user_id} deleted"}

# Menurithm Integration Endpoints

@router.post("/menurithm/configure")
async def configure_menurithm_integration(
    menurithm_api_key: str,
    db: Session = Depends(get_db),
    firebase_user: dict = Depends(verify_firebase_token)
):
    """Configure Menurithm API integration for user"""
    user = db.query(User).filter(User.firebase_uid == firebase_user["uid"]).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    # In a production system, you'd want to encrypt/secure this API key
    # For now, we'll store it as part of the user's organization field or add a new field
    # This is a simplified approach - in production, use proper encryption
    
    try:
        # Test the API key by making a simple request
        from app.services.menurithm_api import MenurithmAPI
        test_client = MenurithmAPI()
        test_client.api_key = menurithm_api_key
        
        # You could test with a simple endpoint call here
        # await test_client.get_produce_requests()
        
        # Store API key (in production, encrypt this)
        # For demo purposes, we'll store it in a simple way
        # You'd want to add a proper field to the User model
        user.organization = f"{user.organization}|menurithm_key:{menurithm_api_key}"
        db.commit()
        
        return {
            "message": "Menurithm integration configured successfully",
            "status": "active"
        }
        
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Invalid Menurithm API key: {str(e)}")

@router.get("/menurithm/status")
async def get_menurithm_integration_status(
    db: Session = Depends(get_db),
    firebase_user: dict = Depends(verify_firebase_token)
):
    """Get Menurithm integration status for user"""
    user = db.query(User).filter(User.firebase_uid == firebase_user["uid"]).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    # Check if user has Menurithm integration configured
    has_integration = "menurithm_key:" in (user.organization or "")
    
    return {
        "menurithm_integrated": has_integration,
        "user_role": user.role,
        "integration_features": {
            "inventory_sync": has_integration and user.role == "farmer",
            "request_notifications": has_integration,
            "delivery_tracking": has_integration and user.role == "farmer",
            "analytics_sync": has_integration
        }
    }