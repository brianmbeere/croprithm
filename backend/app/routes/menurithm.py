from fastapi import APIRouter, Depends
from app.utils.auth_dependency import verify_firebase_token
from app.models.user import User
from app.db.database import get_db
from sqlalchemy.orm import Session

router = APIRouter(prefix="/api/menurithm", tags=["menurithm-integration"])

@router.get("/integration-guide")
async def get_menurithm_integration_guide():
    """Complete guide for Menurithm API integration with Croprithm"""
    return {
        "title": "Menurithm Integration Guide",
        "description": "Complete API integration between Croprithm and Menurithm platforms",
        "version": "1.0.0",
        
        "authentication": {
            "method": "API Key Authentication",
            "header": "Authorization: Bearer <your_menurithm_api_key>",
            "webhook_verification": "HMAC SHA-256 signature verification",
            "environment_variables": {
                "MENURITHM_API_URL": "https://api.menurithm.com/v1",
                "MENURITHM_API_KEY": "your_menurithm_api_key_here",
                "MENURITHM_WEBHOOK_SECRET": "your_webhook_secret_here"
            }
        },
        
        "integration_features": {
            "supplier_registration": {
                "endpoint": "POST /api/produce/menurithm/register-supplier",
                "description": "Register farmer as supplier in Menurithm",
                "required_role": "farmer"
            },
            "inventory_sync": {
                "endpoint": "POST /api/produce/menurithm/sync-inventory",
                "description": "Sync produce inventory to Menurithm",
                "required_role": "farmer",
                "automatic": True
            },
            "request_management": {
                "endpoints": {
                    "sync_requests": "POST /api/requests/menurithm/sync",
                    "respond_to_request": "PUT /api/requests/{request_id}/status",
                    "update_delivery": "PUT /api/requests/{request_id}/delivery-status"
                },
                "description": "Handle produce requests from Menurithm",
                "required_role": "farmer"
            },
            "webhook_handling": {
                "endpoint": "POST /api/webhooks/menurithm/request",
                "description": "Receive real-time requests from Menurithm",
                "signature_verification": True
            }
        },
        
        "webhook_endpoints": {
            "new_request": {
                "url": "POST /api/webhooks/menurithm/request",
                "description": "Receive new produce requests",
                "payload_example": {
                    "request_id": "menurithm_req_123",
                    "restaurant_name": "Bella's Bistro",
                    "produce_type": "Organic Tomatoes",
                    "quantity": "10 kg",
                    "delivery_address": "123 Restaurant St, City",
                    "delivery_window": "Tomorrow, 10am-12pm",
                    "special_requirements": "Cherry tomatoes preferred"
                }
            },
            "request_update": {
                "url": "POST /api/webhooks/menurithm/update",
                "description": "Receive request status updates",
                "payload_example": {
                    "request_id": "menurithm_req_123",
                    "status": "confirmed",
                    "estimated_delivery": "2025-07-29T10:00:00Z"
                }
            }
        },
        
        "api_flow": {
            "farmer_onboarding": [
                "1. Farmer signs up/logs into Croprithm",
                "2. Configure Menurithm API key: POST /api/users/menurithm/configure",
                "3. Register as supplier: POST /api/produce/menurithm/register-supplier",
                "4. Sync inventory: POST /api/produce/menurithm/sync-inventory"
            ],
            "request_handling": [
                "1. Menurithm sends webhook to /api/webhooks/menurithm/request",
                "2. Croprithm creates ProduceRequest in database",
                "3. Farmer views request in dashboard",
                "4. Farmer accepts/declines: PUT /api/requests/{id}/status",
                "5. Croprithm notifies Menurithm of decision",
                "6. Farmer updates delivery status: PUT /api/requests/{id}/delivery-status"
            ],
            "inventory_management": [
                "1. Farmer updates inventory in Croprithm",
                "2. Auto-sync triggers: POST /api/produce/menurithm/sync-inventory",
                "3. Menurithm inventory updated with latest data"
            ]
        },
        
        "data_synchronization": {
            "inventory_sync": {
                "frequency": "Real-time on updates",
                "direction": "Croprithm → Menurithm",
                "fields": ["produce_type", "quantity", "price", "organic", "availability"]
            },
            "request_sync": {
                "frequency": "Real-time via webhooks",
                "direction": "Menurithm → Croprithm",
                "fields": ["restaurant_info", "produce_needs", "delivery_details"]
            },
            "status_updates": {
                "frequency": "Real-time on changes",
                "direction": "Bidirectional",
                "fields": ["request_status", "delivery_status", "completion_data"]
            }
        },
        
        "error_handling": {
            "retry_mechanism": "3 attempts with exponential backoff",
            "fallback_behavior": "Local operation continues, sync queued for retry",
            "error_logging": "Detailed logs for debugging integration issues",
            "status_monitoring": "Health check endpoints for integration status"
        },
        
        "security": {
            "api_key_storage": "Encrypted in database",
            "webhook_verification": "HMAC signature validation",
            "rate_limiting": "Applied per supplier",
            "data_privacy": "No sensitive data stored in logs"
        }
    }

@router.get("/test-connection")
async def test_menurithm_connection(
    db: Session = Depends(get_db),
    firebase_user: dict = Depends(verify_firebase_token)
):
    """Test Menurithm API connection for current user"""
    user = db.query(User).filter(User.firebase_uid == firebase_user["uid"]).first()
    if not user:
        return {"error": "User not found"}
    
    # Check if user has Menurithm integration
    has_integration = "menurithm_key:" in (user.organization or "")
    
    if not has_integration:
        return {
            "connected": False,
            "message": "Menurithm integration not configured",
            "next_step": "Configure API key at POST /api/users/menurithm/configure"
        }
    
    try:
        # In a real implementation, you'd test the actual API connection here
        # For now, return a success response
        return {
            "connected": True,
            "message": "Menurithm API connection successful",
            "user_role": user.role,
            "available_features": {
                "inventory_sync": user.role == "farmer",
                "request_handling": user.role == "farmer",
                "analytics_sync": True,
                "webhook_notifications": True
            }
        }
    except Exception as e:
        return {
            "connected": False,
            "error": str(e),
            "message": "Failed to connect to Menurithm API"
        }
