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
from app.models.produce import DeliveryRoute, DeliveryStop, ProduceRequest
from app.models.route import OptimizedStop, RouteResponse
with patch("firebase_admin.credentials.Certificate"), patch("firebase_admin.initialize_app"):
    from app.routes.delivery import router
from app.routes.route import router as planning_router
from app.utils.auth_dependency import verify_firebase_token
from app.services.optimizer import optimize_route_real
from app.models.route import RouteRequest, Stop


class DeliveryWorkflowTests(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine(
            "sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool
        )
        Base.metadata.create_all(self.engine)
        self.sessions = sessionmaker(bind=self.engine)
        self.uid = "farmer"
        app = FastAPI()
        app.include_router(router)
        app.include_router(planning_router)

        def session():
            with self.sessions() as db:
                yield db

        app.dependency_overrides[get_db] = session
        app.dependency_overrides[verify_firebase_token] = lambda: {"uid": self.uid}
        self.client = TestClient(app)
        with self.sessions() as db:
            for index, uid in enumerate(["farmer", "other"], 1):
                db.add(User(id=index, firebase_uid=uid, email=f"{uid}@example.com",
                            full_name=uid, organization="Farm", country="Kenya", role="farmer"))
            now = datetime.now(timezone.utc)
            for index in [1, 2]:
                db.add(ProduceRequest(
                    id=index, assigned_seller_id=1, restaurant_name=f"Restaurant {index}",
                    produce_type="Tomato", quantity_needed=2, unit="kg",
                    delivery_address="Market", delivery_window_start=now,
                    delivery_window_end=now, status="accepted",
                ))
            db.commit()
        self.payload = {
            "route_name": "Pilot", "pickup_location": "Farm",
            "delivery_date": datetime.now(timezone.utc).isoformat(), "request_ids": [1, 2],
        }
        self.optimized = RouteResponse(
            stops=[
                OptimizedStop(address=address, location=(36.8, -1.2), eta_minutes=i * 10, distance_miles=1)
                for i, address in enumerate(["Farm", "Market", "Market"])
            ], total_eta=20, total_distance_miles=2,
        )

    def tearDown(self):
        self.client.close()
        self.engine.dispose()

    def create_route(self):
        with patch("app.routes.delivery.optimize_route_from_requests", new=AsyncMock(return_value=self.optimized)):
            response = self.client.post("/api/routes/from-requests", json=self.payload)
        self.assertEqual(response.status_code, 200, response.text)
        return response.json()["id"]

    def test_duplicate_addresses_preserve_each_order_and_omit_pickup(self):
        route_id = self.create_route()
        stops = self.client.get(f"/api/routes/{route_id}/stops").json()
        self.assertEqual([stop["request_id"] for stop in stops], [1, 2])
        self.assertEqual([stop["stop_order"] for stop in stops], [1, 2])
        self.assertTrue(all(stop["status"] == "pending" for stop in stops))
        self.assertEqual(len(self.client.get("/api/routes/all").json()), 1)

    def test_progress_survives_reload_and_only_explicit_delivery_allows_completion(self):
        route_id = self.create_route()
        stops = self.client.get(f"/api/routes/{route_id}/stops").json()
        endpoint = f"/api/routes/{route_id}/stops/{stops[0]['id']}/status"
        self.assertEqual(self.client.put(endpoint, json={"status": "en_route"}).status_code, 200)
        arrived = self.client.put(endpoint, json={"status": "arrived"}).json()
        self.assertIsNotNone(arrived["actual_arrival"])
        delivered = self.client.put(endpoint, json={"status": "delivered"}).json()
        self.assertEqual(delivered["actual_arrival"], arrived["actual_arrival"])
        repeated = self.client.put(endpoint, json={"status": "delivered"}).json()
        self.assertEqual(repeated["actual_arrival"], delivered["actual_arrival"])
        self.assertEqual(self.client.get(f"/api/routes/{route_id}/stops").json()[0]["status"], "delivered")
        finish = f"/api/routes/{route_id}/status?status=completed"
        self.assertEqual(self.client.put(finish).status_code, 409)
        other = f"/api/routes/{route_id}/stops/{stops[1]['id']}/status"
        self.client.put(other, json={"status": "skipped"})
        self.assertEqual(self.client.put(finish).status_code, 409)
        self.client.put(other, json={"status": "delivered"})
        self.assertEqual(self.client.put(finish).status_code, 200)
        self.assertEqual(self.client.post("/api/routes/from-requests", json=self.payload).status_code, 409)
        self.assertEqual(self.client.put(endpoint, json={"status": "pending"}).status_code, 409)

    def test_cross_user_and_wrong_route_stop_are_not_accessible(self):
        route_id = self.create_route()
        stop = self.client.get(f"/api/routes/{route_id}/stops").json()[0]
        self.uid = "other"
        self.assertEqual(self.client.get(f"/api/routes/{route_id}/stops").status_code, 404)
        self.assertEqual(self.client.put(f"/api/routes/{route_id}/stops/{stop['id']}/status",
                                         json={"status": "delivered"}).status_code, 404)
        self.uid = "farmer"
        self.assertEqual(self.client.put(f"/api/routes/{route_id}/stops/99999/status",
                                         json={"status": "delivered"}).status_code, 404)

    def test_validation_and_no_double_scheduling(self):
        route_id = self.create_route()
        self.assertEqual(self.client.post("/api/routes/from-requests", json=self.payload).status_code, 409)
        stop = self.client.get(f"/api/routes/{route_id}/stops").json()[0]
        self.assertEqual(self.client.put(f"/api/routes/{route_id}/stops/{stop['id']}/status",
                                         json={"status": "automatically_delivered"}).status_code, 422)
        self.assertEqual(self.client.post("/api/routes/from-requests",
                                         json={**self.payload, "request_ids": []}).status_code, 422)
        self.assertEqual(self.client.post("/api/routes/from-requests",
                                         json={**self.payload, "request_ids": [1, 1]}).status_code, 400)

    def test_partial_geocoding_rolls_back_entire_route(self):
        self.optimized.stops.pop()
        with patch("app.routes.delivery.optimize_route_from_requests", new=AsyncMock(return_value=self.optimized)):
            response = self.client.post("/api/routes/from-requests", json=self.payload)
        self.assertEqual(response.status_code, 422)
        with self.sessions() as db:
            self.assertEqual(db.query(DeliveryRoute).count(), 0)
            self.assertEqual(db.query(DeliveryStop).count(), 0)

    def test_failed_reoptimization_preserves_original_stops(self):
        route_id = self.create_route()
        before = self.client.get(f"/api/routes/{route_id}/stops").json()
        with patch("app.routes.delivery.optimize_route_from_requests",
                   new=AsyncMock(side_effect=ValueError("Unable to locate address"))):
            response = self.client.post(f"/api/routes/{route_id}/optimize")
        self.assertEqual(response.status_code, 422)
        self.assertEqual(self.client.get(f"/api/routes/{route_id}/stops").json(), before)

    def test_cancelled_routes_reject_progress(self):
        route_id = self.create_route()
        stop = self.client.get(f"/api/routes/{route_id}/stops").json()[0]
        self.assertEqual(self.client.put(f"/api/routes/{route_id}/status?status=cancelled").status_code, 200)
        self.assertEqual(self.client.put(f"/api/routes/{route_id}/stops/{stop['id']}/status",
                                         json={"status": "delivered"}).status_code, 409)

    def test_only_accepted_assigned_orders_can_be_saved(self):
        with self.sessions() as db:
            db.get(ProduceRequest, 1).status = "pending"
            db.commit()
        self.assertEqual(self.client.post("/api/routes/from-requests", json=self.payload).status_code, 400)
        self.uid = "other"
        self.assertEqual(self.client.post("/api/routes/from-requests", json=self.payload).status_code, 400)

    def test_reoptimization_does_not_destroy_recorded_progress(self):
        route_id = self.create_route()
        stop = self.client.get(f"/api/routes/{route_id}/stops").json()[0]
        self.client.put(f"/api/routes/{route_id}/stops/{stop['id']}/status", json={"status": "arrived"})
        self.assertEqual(self.client.post(f"/api/routes/{route_id}/optimize").status_code, 409)
        self.assertEqual(self.client.get(f"/api/routes/{route_id}/stops").json()[0]["status"], "arrived")

    def test_optimizer_does_not_silently_drop_unlocatable_stops(self):
        with patch("app.services.optimizer.geocode_address", new=AsyncMock(side_effect=[(36, -1), None])):
            import asyncio
            with self.assertRaisesRegex(ValueError, "Could not locate delivery address"):
                asyncio.run(optimize_route_real(RouteRequest(pickup="Farm", stops=[Stop(address="Unknown")])))

    def test_geocoding_errors_are_actionable_in_preview(self):
        with patch("app.routes.route.optimize_route_real", new=AsyncMock(side_effect=ValueError("Correct the address"))):
            response = self.client.post("/api/optimize-route", json={"pickup": "Farm", "stops": [{"address": "Bad"}]})
        self.assertEqual(response.status_code, 422)
        self.assertEqual(response.json()["detail"], "Correct the address")


if __name__ == "__main__":
    unittest.main()
