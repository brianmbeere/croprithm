import os
import httpx
from typing import Dict, List, Optional
from datetime import datetime
import json

class MenurithmAPI:
    """Client for interacting with Menurithm API"""
    
    def __init__(self):
        self.base_url = os.getenv("MENURITHM_API_URL", "https://api.menurithm.com/v1")
        self.api_key = os.getenv("MENURITHM_API_KEY")
        self.webhook_secret = os.getenv("MENURITHM_WEBHOOK_SECRET")
        
        if not self.api_key:
            raise ValueError("MENURITHM_API_KEY environment variable is required")
    
    def _get_headers(self) -> Dict[str, str]:
        """Get headers for API requests"""
        return {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
            "User-Agent": "Croprithm-Backend/1.0"
        }
    
    async def register_supplier(self, supplier_data: Dict) -> Dict:
        """Register a new supplier with Menurithm"""
        async with httpx.AsyncClient() as client:
            response = await client.post(
                f"{self.base_url}/suppliers",
                headers=self._get_headers(),
                json={
                    "name": supplier_data.get("name"),
                    "email": supplier_data.get("email"),
                    "phone": supplier_data.get("phone"),
                    "address": supplier_data.get("address"),
                    "location": {
                        "latitude": supplier_data.get("latitude"),
                        "longitude": supplier_data.get("longitude")
                    },
                    "categories": supplier_data.get("categories", ["fresh_produce"]),
                    "delivery_radius_km": supplier_data.get("delivery_radius", 50),
                    "webhook_url": f"{os.getenv('BACKEND_URL', 'http://localhost:8000')}/api/webhooks/menurithm"
                }
            )
            response.raise_for_status()
            return response.json()
    
    async def update_inventory(self, supplier_id: str, inventory_items: List[Dict]) -> Dict:
        """Update supplier inventory on Menurithm"""
        async with httpx.AsyncClient() as client:
            response = await client.put(
                f"{self.base_url}/suppliers/{supplier_id}/inventory",
                headers=self._get_headers(),
                json={
                    "items": [
                        {
                            "sku": item.get("sku", f"produce_{item['id']}"),
                            "name": item["produce_type"],
                            "category": "fresh_produce",
                            "variety": item.get("variety"),
                            "quantity_available": item["quantity_available"],
                            "unit": item["unit"],
                            "price_per_unit": item["price_per_unit"],
                            "organic": item.get("organic", False),
                            "harvest_date": item.get("harvest_date"),
                            "expiry_date": item.get("expiry_date"),
                            "description": item.get("description"),
                            "available": item.get("is_available", True)
                        }
                        for item in inventory_items
                    ]
                }
            )
            response.raise_for_status()
            return response.json()
    
    async def get_produce_requests(self, supplier_id: Optional[str] = None) -> List[Dict]:
        """Get produce requests from Menurithm"""
        params = {}
        if supplier_id:
            params["supplier_id"] = supplier_id
        
        async with httpx.AsyncClient() as client:
            response = await client.get(
                f"{self.base_url}/requests",
                headers=self._get_headers(),
                params=params
            )
            response.raise_for_status()
            return response.json().get("requests", [])
    
    async def respond_to_request(self, request_id: str, response_data: Dict) -> Dict:
        """Respond to a produce request (accept/decline)"""
        async with httpx.AsyncClient() as client:
            response = await client.post(
                f"{self.base_url}/requests/{request_id}/respond",
                headers=self._get_headers(),
                json={
                    "status": response_data["status"],  # "accepted" or "declined"
                    "supplier_id": response_data["supplier_id"],
                    "estimated_delivery_date": response_data.get("estimated_delivery_date"),
                    "message": response_data.get("message"),
                    "price_quote": response_data.get("price_quote")
                }
            )
            response.raise_for_status()
            return response.json()
    
    async def update_delivery_status(self, request_id: str, status_data: Dict) -> Dict:
        """Update delivery status for a request"""
        async with httpx.AsyncClient() as client:
            response = await client.put(
                f"{self.base_url}/requests/{request_id}/delivery",
                headers=self._get_headers(),
                json={
                    "status": status_data["status"],  # "in_transit", "delivered", "failed"
                    "estimated_arrival": status_data.get("estimated_arrival"),
                    "actual_delivery_time": status_data.get("actual_delivery_time"),
                    "delivery_notes": status_data.get("delivery_notes"),
                    "location": status_data.get("location")
                }
            )
            response.raise_for_status()
            return response.json()
    
    async def sync_analytics(self, analytics_data: Dict) -> Dict:
        """Sync analytics data with Menurithm"""
        async with httpx.AsyncClient() as client:
            response = await client.post(
                f"{self.base_url}/analytics/sync",
                headers=self._get_headers(),
                json=analytics_data
            )
            response.raise_for_status()
            return response.json()

# Global instance
menurithm_client = MenurithmAPI()
