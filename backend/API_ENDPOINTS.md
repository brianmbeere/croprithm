# Croprithm API - Produce Management Endpoints

## Overview
This document describes the new API endpoints added to Croprithm for produce management and Menurithm integration.

## Authentication
All endpoints (except webhooks and public produce listings) require Firebase authentication. Include the Firebase ID token in the Authorization header:
```
Authorization: Bearer <firebase_id_token>
```

## API Endpoints

### 📦 Produce Inventory Management

#### Create Produce Inventory
```http
POST /api/produce/inventory
```
**Description**: Add new produce items to seller's inventory (farmers only)

**Request Body**:
```json
{
  "produce_type": "Tomatoes",
  "variety": "Heirloom",
  "quantity_available": 100.0,
  "unit": "kg",
  "price_per_unit": 5.50,
  "harvest_date": "2025-07-28T10:00:00Z",
  "expiry_date": "2025-08-05T10:00:00Z",
  "location": "Grand Rapids, MI",
  "latitude": 42.9634,
  "longitude": -85.6681,
  "organic": true,
  "description": "Fresh heirloom tomatoes from local farm"
}
```

#### Get Seller's Inventory
```http
GET /api/produce/inventory
```
**Description**: List all inventory items for authenticated seller

#### Update Inventory Item
```http
PUT /api/produce/inventory/{inventory_id}
```
**Description**: Update specific inventory item (seller only)

#### Delete Inventory Item
```http
DELETE /api/produce/inventory/{inventory_id}
```
**Description**: Remove inventory item (seller only)

### 🏪 Public Produce Listings

#### Get Available Produce
```http
GET /api/produce/available?produce_type=Tomatoes&location=Grand Rapids&organic_only=true&max_price=6.0&skip=0&limit=50
```
**Description**: Get all available produce (public endpoint)

**Query Parameters**:
- `produce_type`: Filter by produce type
- `location`: Filter by location
- `organic_only`: Show only organic produce
- `max_price`: Maximum price per unit
- `skip`: Pagination offset
- `limit`: Maximum results

#### Search Produce
```http
GET /api/produce/search?q=tomato
```
**Description**: Search produce by type, variety, or description

#### Get Seller's Produce
```http
GET /api/produce/seller/{seller_id}
```
**Description**: Get specific seller's available produce

### 📋 Produce Request Management

#### Create Produce Request
```http
POST /api/requests
```
**Description**: Create new produce request (restaurants only)

**Request Body**:
```json
{
  "restaurant_name": "The Green Well",
  "produce_type": "Tomatoes",
  "quantity_needed": 20.0,
  "unit": "kg",
  "max_price_per_unit": 6.0,
  "delivery_address": "924 Cherry Street Southeast, Grand Rapids, MI",
  "delivery_latitude": 42.9561,
  "delivery_longitude": -85.6366,
  "delivery_window_start": "2025-07-28T10:00:00Z",
  "delivery_window_end": "2025-07-28T12:00:00Z",
  "special_requirements": "Organic tomatoes preferred"
}
```

#### List Produce Requests
```http
GET /api/requests?status=pending&produce_type=Tomatoes&skip=0&limit=50
```
**Description**: List requests (filtered by user role)

#### Update Request Status
```http
PUT /api/requests/{request_id}/status
```
**Description**: Accept/decline requests (farmers) or update own requests (restaurants)

**Request Body**:
```json
{
  "status": "accepted",
  "assigned_seller_id": 123
}
```

#### Get Requests for Seller
```http
GET /api/requests/seller/{seller_id}
```
**Description**: Get requests assigned to specific seller

### 🚚 Delivery Route Management

#### Create Route from Requests
```http
POST /api/routes/from-requests
```
**Description**: Generate optimized delivery route from selected requests

**Request Body**:
```json
{
  "route_name": "Monday Morning Deliveries",
  "pickup_location": "123 Farm Road, Grand Rapids, MI",
  "pickup_latitude": 42.9634,
  "pickup_longitude": -85.6681,
  "delivery_date": "2025-07-28T08:00:00Z",
  "request_ids": [1, 2, 3]
}
```

#### Get Active Routes
```http
GET /api/routes/active
```
**Description**: Get active delivery routes for authenticated seller

#### Re-optimize Route
```http
POST /api/routes/{route_id}/optimize
```
**Description**: Re-optimize existing route

#### Update Route Status
```http
PUT /api/routes/{route_id}/status
```
**Description**: Update delivery route status

**Request Body**:
```json
{
  "status": "active"
}
```

#### Get Route Stops
```http
GET /api/routes/{route_id}/stops
```
**Description**: Get stops for specific route in optimized order

### 🔗 Menurithm Integration (Webhooks)

#### Receive Menurithm Request
```http
POST /api/webhooks/menurithm/request
```
**Description**: Webhook endpoint for receiving new requests from Menurithm

**Request Body**:
```json
{
  "request_id": "menurithm_123",
  "restaurant_name": "The Green Well",
  "produce_type": "Tomatoes",
  "quantity": "20kg",
  "delivery_address": "924 Cherry Street Southeast, Grand Rapids, MI",
  "delivery_window": "Today, 10am-12pm",
  "special_requirements": "Organic preferred"
}
```

#### Receive Menurithm Update
```http
POST /api/webhooks/menurithm/update
```
**Description**: Webhook endpoint for request updates from Menurithm

#### Check Integration Status
```http
GET /api/webhooks/menurithm/status
```
**Description**: Health check for Menurithm integration

### 📊 Analytics & Insights

#### Get Demand Analytics
```http
GET /api/analytics/demand?days=30
```
**Description**: Get produce demand trends and analytics

#### Get Route Efficiency
```http
GET /api/analytics/routes/efficiency
```
**Description**: Get route efficiency metrics for authenticated seller

#### Get Seller Performance
```http
GET /api/analytics/seller/performance
```
**Description**: Get performance analytics for authenticated farmer

#### Get Market Insights
```http
GET /api/analytics/market/insights
```
**Description**: Get market insights and supply/demand data

## Status Codes

### Produce Request Status
- `pending`: New request awaiting farmer acceptance
- `accepted`: Farmer has accepted the request
- `declined`: Farmer has declined the request
- `completed`: Request has been fulfilled and delivered

### Delivery Route Status
- `planned`: Route created but not started
- `active`: Route is currently being executed
- `completed`: All deliveries completed
- `cancelled`: Route cancelled

### Delivery Stop Status
- `pending`: Stop not yet reached
- `en_route`: Currently traveling to stop
- `delivered`: Successfully delivered
- `failed`: Delivery failed

## Error Responses

All endpoints return standard HTTP status codes:

- `200`: Success
- `201`: Created
- `400`: Bad Request
- `401`: Unauthorized
- `403`: Forbidden
- `404`: Not Found
- `500`: Internal Server Error

Error response format:
```json
{
  "detail": "Error description"
}
```

## Database Migration

To add the new tables to your database, run:

```bash
cd backend
python migrate_db.py
```

## Integration with Frontend

The frontend can now:
1. Display produce requests from Menurithm in the ProduceRequestFeed
2. Allow farmers to accept/decline requests
3. Generate optimized delivery routes from selected requests
4. View analytics and performance metrics

## Next Steps

1. **Authentication**: Ensure Firebase authentication is properly configured
2. **Database**: Run the migration to create new tables
3. **Testing**: Use the provided sample data to test endpoints
4. **Webhooks**: Configure Menurithm to send webhooks to your endpoints
5. **Notifications**: Implement farmer notifications for new requests
6. **Mobile**: Consider mobile app for delivery drivers
