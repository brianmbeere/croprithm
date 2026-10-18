# Croprithm API - Produce Management Endpoints

## Overview
This document describes the new API endpoints added to Croprithm for produce management and Menurithm integration.

## Authentication
All endpoints (except webhooks and public produce listings) require Firebase authentication. Include the Firebase ID token in the Authorization header:
```
Authorization: Bearer <firebase_id_token>
```

## API Endpoints

### Pickup and farmer delivery agreements

Run `python migrate_fulfillment.py` before deploying this workflow.
All routes below are rooted at `/api/fulfillment`.

| Method | Path | Access / behavior |
| --- | --- | --- |
| POST | `/orders` | Customer: create request with method `customer_pickup` or `farmer_delivery`, quantity/unit, customer name, timezone-aware window start/end, optional requirements, delivery address when delivering |
| GET | `/orders` | Customer's own orders and current agreement terms only |
| POST | `/orders/{id}/accept` | Customer: `{"revision": 1}` accepts exact quote; stale revision returns 409 |
| GET | `/farmer/orders` | Farmer: unassigned and own orders |
| PUT | `/farmer/orders/{id}/quote` | Farmer: method, decimal-string `fee`, `currency: "USD"`, pickup address, instructions, `expected_revision` |
| PUT | `/farmer/orders/{id}/stage` | Assigned farmer: `{"stage": "ready"}`, then `collected` for pickup or `delivered` for delivery |

`id` in these routes is the **agreement ID**, not `request_id`. Both are
returned. Terms include `revision`, `accepted_revision`, `accepted_at`,
farmer/customer contact, fee as a decimal string, method and handover stage.
No produce price or payment collection is implied by a delivery quote.
Fees reject negatives, non-finite values and more than two decimal places.
Pickup requires an address and zero fee. Accepted terms cannot be edited.

Native customers use Croprithm restaurant Firebase tokens. Menurithm's backend
uses `Authorization: Bearer <FULFILLMENT_BRIDGE_KEY>` with a server-derived
`X-Customer-Id`. Its users are namespaced and never require cross-project token
trust. Only server-to-server code may possess the shared key. Unconfigured
bridge access does not bypass Firebase authentication.

`GET /api/requests?delivery_only=true` excludes new pickup/unapproved agreements.
`legacy_only=true` returns historical orders for the legacy request feed.
Legacy status/delivery updates reject agreement orders with 409. Route creation
independently enforces approved farmer-delivery eligibility.

### Mobile delivery pilot: saved progress

`GET /api/routes/{route_id}/stops` returns saved delivery stops in `stop_order`.
Pickup is not a delivery stop. Access is restricted to the route owner.
Each stop includes nullable `fulfillment_stage` and `fulfillment_method`;
both are null for historical requests without an agreement.

```http
PUT /api/routes/{route_id}/stops/{stop_id}/status
Content-Type: application/json
Authorization: Bearer <Firebase ID token>

{"status": "arrived"}
```

Allowed statuses: `pending`, `en_route`, `arrived`, `delivered`, `skipped`.
The response is the updated `DeliveryStopResponse`. Arrival time is recorded on
the first arrived/delivered update and retained on repeated updates. Resetting
to pending/en_route or skipping clears that arrival time. Non-pending progress
activates the route. Closed routes reject updates with HTTP 409; missing or
other-owner routes/stops return 404; invalid status values return 422.

`PUT /api/routes/{route_id}/status?status=completed` returns 409 until every stop
is delivered; skipped stops are unresolved. Re-optimization is only allowed on
planned routes with all stops pending. Creation from requests is atomic, requires
accepted assigned orders, rejects duplicate scheduling on non-cancelled routes,
and fails with 422 if any delivery address cannot be geocoded.

Navigation is a client-side Google/Apple Maps link, not a tracking endpoint.
Opening it never changes route/stop state and requires no navigation API key.
Ordinary stop status updates do not complete produce requests. Once an agreement
has confirmed delivery, its stop cannot be reset to another status.

#### Explicit order handover from a saved itinerary

`PUT /api/routes/{route_id}/stops/{stop_id}/handover` accepts
`{"stage": "ready"}` followed by `{"stage": "delivered"}`. Only the assigned
farmer owning the route may act. The agreement must be an approved, current
farmer-delivery quote; pickup and historical requests return 409.

Delivery confirmation updates agreement stage, request status (`completed`),
stop status (`delivered`) and first arrival timestamp in one transaction. The
response is the enriched `DeliveryStopResponse`. Repeated delivery is idempotent.
Premature delivery and cancelled routes return 409; foreign/missing routes or
stops return 404. Completed routes may reconcile an outstanding handover without
reopening the route. Other non-completed routes become active on handover.

The shared itinerary exposes a physical-handover confirmation dialog, not an
automatic Maps/GPS action. Menurithm sees the order update on refresh through
the existing bridge; no callback, payment or customer receipt proof is implied.
No schema migration is required for this endpoint.

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
