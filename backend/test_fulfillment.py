import os
import unittest
from datetime import datetime, timezone
from unittest.mock import AsyncMock, patch

from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

os.environ.setdefault("DATABASE_URL", "postgresql://localhost/croprithm_test")
os.environ.setdefault("MENURITHM_API_KEY", "test-only")

from app.db.database import Base, get_db
from app.models.user import User
from app.models.produce import ProduceRequest, DeliveryRoute, DeliveryStop
from app.models.fulfillment import FulfillmentAgreement
from app.models.route import OptimizedStop, RouteResponse
with patch("firebase_admin.credentials.Certificate"), patch("firebase_admin.initialize_app"):
    from app.routes import fulfillment, delivery, requests, user
from app.utils.auth_dependency import verify_firebase_token


class FulfillmentTests(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
        Base.metadata.create_all(self.engine)
        self.sessions = sessionmaker(bind=self.engine)
        app = FastAPI()
        for router in [fulfillment.router, delivery.router, requests.router, user.router]:
            app.include_router(router)
        self.identity = "menurithm:customer-one"
        self.uid = "farmer"
        app.dependency_overrides[fulfillment.customer_identity] = lambda: self.identity
        app.dependency_overrides[verify_firebase_token] = lambda: {"uid": self.uid}

        def session():
            with self.sessions() as db:
                yield db
        app.dependency_overrides[get_db] = session
        app.dependency_overrides[user.get_db] = session
        self.app = app
        self.client = TestClient(app)
        with self.sessions() as db:
            for index, uid in enumerate(["farmer", "other"], 1):
                db.add(User(id=index, firebase_uid=uid, email=f"{uid}@example.com", full_name=uid,
                            organization="Farm", country="United States", role="farmer"))
            db.commit()
        self.payload = {
            "restaurant_name": "Kitchen", "produce_type": "Tomato", "quantity_needed": 3,
            "unit": "kg", "method": "farmer_delivery", "delivery_address": "Market",
            "delivery_window_start": "2026-11-01T10:00:00Z",
            "delivery_window_end": "2026-11-01T12:00:00Z",
        }

    def tearDown(self):
        self.client.close()
        self.engine.dispose()

    def create(self, **updates):
        result = self.client.post("/api/fulfillment/orders", json={**self.payload, **updates})
        self.assertEqual(result.status_code, 200, result.text)
        return result.json()

    def quote(self, order, **updates):
        return self.client.put(f"/api/fulfillment/farmer/orders/{order['id']}/quote", json={
            "method": order["method"], "fee": "6.25", "instructions": "Call on arrival; keep shaded",
            "expected_revision": order["revision"], **updates,
        })

    def accept(self, order, revision=1):
        return self.client.post(f"/api/fulfillment/orders/{order['id']}/accept", json={"revision": revision})

    def stage(self, order, stage):
        return self.client.put(f"/api/fulfillment/farmer/orders/{order['id']}/stage", json={"stage": stage})

    def test_delivery_requires_exact_customer_acceptance_and_preserves_fee(self):
        order = self.create()
        self.assertEqual(self.accept(order).status_code, 409)
        self.assertEqual(self.quote(order).status_code, 200)
        self.assertEqual(self.stage(order, "ready").status_code, 409)
        accepted = self.accept(order)
        self.assertEqual(accepted.status_code, 200, accepted.text)
        self.assertEqual(accepted.json()["fee"], "6.25")
        self.assertIsNotNone(accepted.json()["accepted_at"])
        self.assertEqual(self.accept(order).json()["accepted_at"], accepted.json()["accepted_at"])
        self.assertEqual(self.quote({**order, "revision": 1}, fee="20").status_code, 409)
        self.assertEqual(self.stage(order, "delivered").status_code, 409)
        self.assertEqual(self.stage(order, "ready").status_code, 200)
        self.assertEqual(self.stage(order, "collected").status_code, 409)
        self.assertEqual(self.stage(order, "delivered").status_code, 200)
        with self.sessions() as db:
            self.assertEqual(db.get(ProduceRequest, order["request_id"]).status, "completed")

    def test_revised_quote_rejects_stale_acceptance_and_stale_farmer_edit(self):
        order = self.create()
        self.quote(order)
        self.assertEqual(self.quote(order, fee="9.00").status_code, 409)
        revised = self.quote({**order, "revision": 1}, fee="9.00").json()
        self.assertEqual(revised["revision"], 2)
        self.assertEqual(self.accept(order, 1).status_code, 409)
        self.assertEqual(self.accept(order, 2).json()["fee"], "9.00")

    def test_pickup_has_no_delivery_fee_and_cannot_be_routed(self):
        order = self.create(method="customer_pickup", delivery_address="")
        self.assertEqual(self.quote(order, fee="1", pickup_address="Farm").status_code, 422)
        self.assertEqual(self.quote(order, fee="0", pickup_address="").status_code, 422)
        self.assertEqual(self.quote(order, fee="0", pickup_address="Farm").status_code, 200)
        self.assertEqual(self.accept(order).status_code, 200)
        with patch("app.routes.delivery.optimize_route_from_requests", new=AsyncMock()) as optimizer:
            result = self.client.post("/api/routes/from-requests", json={
                "route_name": "Test", "pickup_location": "Farm", "delivery_date": "2026-11-01T10:00:00Z",
                "request_ids": [order["request_id"]],
            })
            self.assertEqual(result.status_code, 409)
            optimizer.assert_not_called()
        self.assertEqual(self.client.get("/api/requests?status=accepted&delivery_only=true").json(), [])
        self.assertEqual(self.stage(order, "ready").status_code, 200)
        self.assertEqual(self.stage(order, "delivered").status_code, 409)
        self.assertEqual(self.stage(order, "collected").status_code, 200)

    def test_customer_isolation_and_farmer_ownership(self):
        order = self.create()
        self.quote(order)
        self.identity = "menurithm:customer-two"
        self.assertEqual(self.client.get("/api/fulfillment/orders").json(), [])
        self.assertEqual(self.accept(order).status_code, 404)
        self.uid = "other"
        self.assertEqual(self.client.get("/api/fulfillment/farmer/orders").json(), [])
        self.assertEqual(self.quote({**order, "revision": 1}).status_code, 403)
        self.assertEqual(self.stage(order, "ready").status_code, 403)

    def test_legacy_status_endpoints_cannot_bypass_new_agreements(self):
        order = self.create()
        endpoint = f"/api/requests/{order['request_id']}"
        self.assertEqual(self.client.put(f"{endpoint}/status", json={"status": "accepted"}).status_code, 409)
        self.quote(order)
        self.accept(order)
        self.assertEqual(self.client.put(f"{endpoint}/delivery-status?status=delivered").status_code, 409)
        self.assertEqual(self.client.get("/api/requests?legacy_only=true").json(), [])
        self.assertEqual(len(self.client.get("/api/requests?status=accepted&delivery_only=true").json()), 1)

    def test_approved_farmer_delivery_can_be_saved_without_completing_order(self):
        order = self.create()
        self.quote(order)
        self.accept(order)
        optimized = RouteResponse(stops=[
            OptimizedStop(address=address, location=(36.8, -1.2), eta_minutes=index * 10, distance_miles=1)
            for index, address in enumerate(["Farm", "Market"])
        ], total_eta=10, total_distance_miles=1)
        with patch("app.routes.delivery.optimize_route_from_requests", new=AsyncMock(return_value=optimized)):
            result = self.client.post("/api/routes/from-requests", json={
                "route_name": "Approved delivery", "pickup_location": "Farm",
                "delivery_date": "2026-11-01T10:00:00Z", "request_ids": [order["request_id"]],
            })
        self.assertEqual(result.status_code, 200, result.text)
        stops = self.client.get(f"/api/routes/{result.json()['id']}/stops").json()
        self.assertEqual([stop["request_id"] for stop in stops], [order["request_id"]])
        self.assertEqual(self.client.get("/api/fulfillment/orders").json()[0]["stage"], "accepted")

    def test_money_window_and_method_validation(self):
        for update in [
            {"quantity_needed": 0}, {"method": "third_party"}, {"delivery_address": ""},
            {"delivery_window_end": "2026-10-01T10:00:00Z"},
            {"delivery_window_start": "2026-11-01T10:00:00"},
            {"restaurant_name": " "},
        ]:
            self.assertEqual(self.client.post("/api/fulfillment/orders", json={**self.payload, **update}).status_code, 422)
        order = self.create()
        for fee in ["-0.01", "1.234", "NaN", "100000000.00"]:
            self.assertEqual(self.quote(order, fee=fee).status_code, 422)
        self.assertEqual(self.quote(order, currency="KES").status_code, 422)
        self.assertEqual(self.quote(order, instructions=" ").status_code, 422)

    def route_stop(self, order):
        with self.sessions() as db:
            route = DeliveryRoute(seller_id=1, route_name="Fixture", pickup_location="Farm",
                                  delivery_date=datetime.now(timezone.utc), status="planned")
            db.add(route)
            db.flush()
            stop = DeliveryStop(route_id=route.id, request_id=order["request_id"],
                                stop_order=1, address="Market", status="pending")
            db.add(stop)
            db.commit()
            return route.id, stop.id

    def test_route_handover_updates_order_and_stop_and_survives_reload(self):
        order = self.create()
        self.quote(order)
        self.accept(order)
        route_id, stop_id = self.route_stop(order)
        path = f"/api/routes/{route_id}/stops/{stop_id}"
        self.assertEqual(self.client.get(f"/api/routes/{route_id}/stops").json()[0]["fulfillment_stage"], "accepted")
        self.assertEqual(self.client.put(path + "/handover", json={"stage": "delivered"}).status_code, 409)
        ready = self.client.put(path + "/handover", json={"stage": "ready"})
        self.assertEqual(ready.status_code, 200, ready.text)
        self.assertEqual(ready.json()["status"], "pending")
        result = self.client.put(path + "/handover", json={"stage": "delivered"})
        self.assertEqual(result.status_code, 200, result.text)
        self.assertEqual(result.json()["status"], "delivered")
        self.assertEqual(result.json()["fulfillment_stage"], "delivered")
        repeated = self.client.put(path + "/handover", json={"stage": "delivered"})
        self.assertEqual(repeated.json()["actual_arrival"], result.json()["actual_arrival"])
        self.assertEqual(self.client.get("/api/fulfillment/orders").json()[0]["stage"], "delivered")
        self.assertEqual(self.client.get(f"/api/routes/{route_id}/stops").json()[0]["fulfillment_stage"], "delivered")
        self.assertEqual(self.client.put(path + "/status", json={"status": "pending"}).status_code, 409)
        with self.sessions() as db:
            self.assertEqual(db.get(ProduceRequest, order["request_id"]).status, "completed")
        self.assertEqual(self.client.put(f"/api/routes/{route_id}/status?status=completed").status_code, 200)

    def test_route_handover_guards_and_reconciliation_after_route_completion(self):
        order = self.create()
        self.quote(order)
        route_id, stop_id = self.route_stop(order)
        path = f"/api/routes/{route_id}/stops/{stop_id}/handover"
        self.assertEqual(self.client.put(path, json={"stage": "ready"}).status_code, 409)
        self.accept(order)
        self.uid = "other"
        self.assertEqual(self.client.put(path, json={"stage": "ready"}).status_code, 404)
        self.uid = "farmer"
        self.assertEqual(self.client.put(f"/api/routes/{route_id}/stops/999/handover", json={"stage": "ready"}).status_code, 404)
        with self.sessions() as db:
            db.get(DeliveryRoute, route_id).status = "cancelled"
            db.commit()
        self.assertEqual(self.client.put(path, json={"stage": "ready"}).status_code, 409)
        with self.sessions() as db:
            db.get(DeliveryRoute, route_id).status = "completed"
            db.get(DeliveryStop, stop_id).status = "delivered"
            db.commit()
        self.assertEqual(self.client.put(path, json={"stage": "ready"}).status_code, 200)
        self.assertEqual(self.client.put(path, json={"stage": "delivered"}).status_code, 200)
        with self.sessions() as db:
            self.assertEqual(db.get(DeliveryRoute, route_id).status, "completed")

    def test_route_handover_rejects_pickup_and_does_not_change_stop(self):
        order = self.create(method="customer_pickup", delivery_address="")
        self.quote(order, fee="0", pickup_address="Farm")
        self.accept(order)
        route_id, stop_id = self.route_stop(order)
        response = self.client.put(f"/api/routes/{route_id}/stops/{stop_id}/handover", json={"stage": "ready"})
        self.assertEqual(response.status_code, 409)
        with self.sessions() as db:
            self.assertEqual(db.get(DeliveryStop, stop_id).status, "pending")
            self.assertEqual(db.query(FulfillmentAgreement).one().stage, "accepted")

    def test_failed_route_handover_commit_rolls_back_all_three_records(self):
        order = self.create()
        self.quote(order)
        self.accept(order)
        self.stage(order, "ready")
        route_id, stop_id = self.route_stop(order)
        with patch("sqlalchemy.orm.Session.commit", side_effect=RuntimeError("Simulated commit failure")):
            with self.assertRaisesRegex(RuntimeError, "Simulated commit failure"):
                self.client.put(f"/api/routes/{route_id}/stops/{stop_id}/handover", json={"stage": "delivered"})
        with self.sessions() as db:
            self.assertEqual(db.get(DeliveryStop, stop_id).status, "pending")
            self.assertEqual(db.get(ProduceRequest, order["request_id"]).status, "accepted")
            self.assertEqual(db.query(FulfillmentAgreement).one().stage, "ready")

    def test_route_handover_rejects_stale_acceptance_and_legacy_orders(self):
        order = self.create()
        self.quote(order)
        self.accept(order)
        route_id, stop_id = self.route_stop(order)
        path = f"/api/routes/{route_id}/stops/{stop_id}/handover"
        with self.sessions() as db:
            db.query(FulfillmentAgreement).one().revision = 2
            db.commit()
        self.assertEqual(self.client.put(path, json={"stage": "ready"}).status_code, 409)
        with self.sessions() as db:
            self.assertEqual(db.get(DeliveryStop, stop_id).status, "pending")
            db.query(FulfillmentAgreement).delete()
            db.commit()
        self.assertEqual(self.client.put(path, json={"stage": "ready"}).status_code, 409)

    def test_bridge_requires_secret_and_scopes_identity(self):
        del self.app.dependency_overrides[fulfillment.customer_identity]
        with patch.dict(os.environ, {"FULFILLMENT_BRIDGE_KEY": "test-bridge"}):
            headers = {"Authorization": "Bearer test-bridge", "X-Customer-Id": "one"}
            self.assertEqual(self.client.post("/api/fulfillment/orders", json=self.payload, headers=headers).status_code, 200)
            self.assertEqual(len(self.client.get("/api/fulfillment/orders", headers=headers).json()), 1)
            headers["X-Customer-Id"] = "two"
            self.assertEqual(self.client.get("/api/fulfillment/orders", headers=headers).json(), [])
            headers.pop("X-Customer-Id")
            self.assertEqual(self.client.get("/api/fulfillment/orders", headers=headers).status_code, 400)
            with patch("app.routes.fulfillment.verify_firebase_token", side_effect=fulfillment.HTTPException(403, "Invalid token")):
                self.assertEqual(self.client.get("/api/fulfillment/orders", headers={"Authorization": "Bearer wrong"}).status_code, 403)
        self.assertEqual(self.client.get("/api/fulfillment/orders").status_code, 422)

    def test_native_restaurant_ownership_is_separate_from_bridge(self):
        del self.app.dependency_overrides[fulfillment.customer_identity]
        with self.sessions() as db:
            db.add(User(firebase_uid="restaurant", email="r@example.com", full_name="R",
                        organization="Kitchen", country="United States", role="restaurant"))
            db.commit()
        with patch("app.routes.fulfillment.verify_firebase_token", return_value={"uid": "restaurant"}):
            response = self.client.post("/api/fulfillment/orders", json=self.payload, headers={"Authorization": "Bearer native"})
            self.assertEqual(response.status_code, 200, response.text)
            with self.sessions() as db:
                agreement = db.query(FulfillmentAgreement).one()
                self.assertEqual(agreement.customer_identity, "croprithm:restaurant")
                self.assertIsNotNone(db.get(ProduceRequest, agreement.request_id).restaurant_id)

    def test_farmer_registration_persists_role_and_correct_model_fields(self):
        self.uid = "new-farmer"
        result = self.client.post("/users/", json={
            "firebase_uid": "new-farmer", "email": "new@example.com", "fullName": "New Farmer",
            "organization": "Farm", "country": "United States", "role": "farmer",
        })
        self.assertEqual(result.status_code, 200, result.text)
        self.assertEqual(result.json()["role"], "farmer")
        self.assertEqual(self.client.get("/api/fulfillment/farmer/orders").status_code, 200)


if __name__ == "__main__":
    unittest.main()
