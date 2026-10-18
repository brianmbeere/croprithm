import { render } from "preact";
import { deliveryRouteApi, produceRequestApi, type DeliveryRoute, type DeliveryStop } from "../src/api/produceApi";
import SavedRoutes from "../src/components/SavedRoutes";
import RoutePlanner from "../src/pages/RoutePlanner";

const route: DeliveryRoute = {
  id: 1, seller_id: 1, route_name: "Pilot fixture (not real deliveries)",
  pickup_location: "Nairobi farm", status: "planned", delivery_date: "2026-10-18T12:00:00Z",
  created_at: "2026-10-18T12:00:00Z", updated_at: "2026-10-18T12:00:00Z",
  total_distance_miles: 12, estimated_duration_minutes: 45,
};
const stops: DeliveryStop[] = [1, 2].map(id => ({
  id, route_id: 1, request_id: id, stop_order: id, address: `Restaurant ${id}, Nairobi`,
  latitude: -1.28, longitude: 36.82, status: "pending", actual_arrival: null,
}));
deliveryRouteApi.getAllRoutes = async () => [{ ...route }];
produceRequestApi.getRequests = async () => [1, 2].map(id => ({
  id, restaurant_name: `Restaurant ${id}`, produce_type: "Tomato", quantity_needed: 2,
  unit: "kg", delivery_address: `Restaurant ${id}, Nairobi`,
  delivery_window_start: route.delivery_date, delivery_window_end: route.delivery_date,
  status: "accepted", assigned_seller_id: 1,
  created_at: route.created_at, updated_at: route.updated_at,
}));
deliveryRouteApi.createFromRequests = async input => {
  if (input.request_ids.join(",") !== "1,2" || !input.pickup_location.trim()) {
    throw new Error("Fixture received incorrect selected orders or pickup");
  }
  route.route_name = input.route_name;
  route.pickup_location = input.pickup_location;
  return { ...route };
};
deliveryRouteApi.getStops = async () => stops.map(stop => ({ ...stop }));
deliveryRouteApi.updateStopStatus = async (_routeId, stopId, status) => {
  const stop = stops.find(item => item.id === stopId);
  if (!stop) throw new Error("Stop not found");
  stop.status = status;
  route.status = "active";
  return { ...stop };
};
deliveryRouteApi.updateStatus = async (_routeId, status) => {
  if (status === "completed" && stops.some(stop => stop.status !== "delivered")) {
    throw new Error("Mark every stop delivered before completing the route; resolve skipped stops first");
  }
  route.status = status;
};
const root = document.getElementById("fixture");
if (!root) throw new Error("Fixture root is missing");
render(new URLSearchParams(location.search).has("planner") ? <RoutePlanner /> : <SavedRoutes />, root);
