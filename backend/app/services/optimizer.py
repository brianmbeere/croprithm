import os
from math import atan2, cos, radians, sin, sqrt
from typing import List, Tuple

import httpx

from app.services.geocode import geocode_address
from app.models.route import OptimizedStop, RouteRequest, RouteResponse

AVERAGE_SPEED_MPH = 32  # Conservative blended urban speed
STOP_BUFFER_MINUTES = 5  # Loading/unloading allowance per stop
MILES_PER_METER = 0.000621371
OSRM_BASE_URL = os.getenv("OSRM_BASE_URL", "https://router.project-osrm.org")

Coordinate = Tuple[float, float]


def haversine_miles(origin: Coordinate, destination: Coordinate) -> float:
    """Compute great-circle distance between two lng/lat coordinates."""
    lon1, lat1 = origin
    lon2, lat2 = destination

    rlon1, rlat1, rlon2, rlat2 = map(radians, [lon1, lat1, lon2, lat2])
    dlon = rlon2 - rlon1
    dlat = rlat2 - rlat1

    a = sin(dlat / 2) ** 2 + cos(rlat1) * cos(rlat2) * sin(dlon / 2) ** 2
    c = 2 * atan2(sqrt(a), sqrt(1 - a))
    earth_radius_miles = 3958.8
    return earth_radius_miles * c


def order_stops_by_distance(start: Coordinate, stops: List[dict]) -> List[dict]:
    """Nearest-neighbor fallback when OSRM data is unavailable."""
    remaining = stops.copy()
    ordered: List[dict] = []
    current = start

    while remaining:
        idx, next_stop = min(
            enumerate(remaining),
            key=lambda item: haversine_miles(current, item[1]["location"]),
        )
        ordered.append(next_stop)
        current = next_stop["location"]
        remaining.pop(idx)

    return ordered


def nearest_neighbor_indices(dist_matrix: List[List[float]]) -> List[int]:
    n = len(dist_matrix)
    unvisited = set(range(1, n))
    order: List[int] = []
    current = 0

    while unvisited:
        next_idx = min(
            unvisited,
            key=lambda idx: dist_matrix[current][idx]
            if dist_matrix[current][idx] is not None
            else float("inf"),
        )
        if dist_matrix[current][next_idx] is None:
            break
        order.append(next_idx)
        unvisited.remove(next_idx)
        current = next_idx

    if unvisited:
        raise ValueError("OSRM matrix could not connect all stops")

    return order


async def fetch_osrm_table(coordinates: List[Coordinate]) -> dict | None:
    if len(coordinates) < 2:
        return None

    coord_str = ";".join(f"{lng},{lat}" for lng, lat in coordinates)
    url = f"{OSRM_BASE_URL}/table/v1/driving/{coord_str}"
    params = {"annotations": "duration,distance"}

    async with httpx.AsyncClient(timeout=10) as client:
        try:
            response = await client.get(url, params=params)
            data = response.json()
            if response.status_code == 200 and data.get("code") == "Ok":
                distances = data.get("distances")
                durations = data.get("durations")
                if distances and durations:
                    return {"distances": distances, "durations": durations}
        except httpx.HTTPError:
            return None
    return None


def build_route_from_matrix(
    entries: List[dict],
    distances: List[List[float]],
    durations: List[List[float]],
) -> tuple[list[OptimizedStop], float, int]:
    indices = nearest_neighbor_indices(distances)
    optimized_stops: list[OptimizedStop] = [
        OptimizedStop(
            address=entries[0]["address"],
            location=entries[0]["location"],
            eta_minutes=0,
            distance_miles=0.0,
        )
    ]

    current_idx = 0
    total_distance = 0.0
    current_eta = 0

    for idx in indices:
        leg_distance_miles = (distances[current_idx][idx] or 0.0) * MILES_PER_METER
        travel_minutes = (durations[current_idx][idx] or 0.0) / 60
        current_eta += int(round(travel_minutes + STOP_BUFFER_MINUTES))
        total_distance += leg_distance_miles

        optimized_stops.append(
            OptimizedStop(
                address=entries[idx]["address"],
                location=entries[idx]["location"],
                eta_minutes=current_eta,
                distance_miles=round(leg_distance_miles, 2),
            )
        )
        current_idx = idx

    return optimized_stops, round(total_distance, 2), current_eta


async def optimize_route_real(request: RouteRequest) -> RouteResponse:
    pickup_coords = await geocode_address(request.pickup)
    if not pickup_coords:
        raise ValueError("Failed to geocode pickup location")

    geocoded_stops: list[dict] = []
    for stop in request.stops:
        coords = await geocode_address(stop.address)
        if coords:
            geocoded_stops.append({"address": stop.address, "location": coords})
        else:
            raise ValueError(f"Could not locate delivery address: {stop.address}")

    if not geocoded_stops:
        raise ValueError("No deliverable stops could be geocoded")

    entries = [{"address": request.pickup, "location": pickup_coords}] + geocoded_stops
    coordinates = [entry["location"] for entry in entries]

    osrm_table = await fetch_osrm_table(coordinates)
    if osrm_table and not any(
        val is None for row in osrm_table["distances"] for val in row
    ):
        optimized, total_distance, total_eta = build_route_from_matrix(
            entries,
            osrm_table["distances"],
            osrm_table["durations"],
        )
    else:
        ordered = order_stops_by_distance(pickup_coords, geocoded_stops)
        optimized = [
            OptimizedStop(
                address=request.pickup,
                location=pickup_coords,
                eta_minutes=0,
                distance_miles=0.0,
            )
        ]
        current_location = pickup_coords
        current_eta = 0
        total_distance = 0.0

        for stop in ordered:
            leg_distance = haversine_miles(current_location, stop["location"])
            travel_minutes = (leg_distance / AVERAGE_SPEED_MPH) * 60
            current_eta += int(round(travel_minutes + STOP_BUFFER_MINUTES))
            total_distance += leg_distance
            optimized.append(
                OptimizedStop(
                    address=stop["address"],
                    location=stop["location"],
                    eta_minutes=current_eta,
                    distance_miles=round(leg_distance, 2),
                )
            )
            current_location = stop["location"]

        total_eta = current_eta
        total_distance = round(total_distance, 2)

    return RouteResponse(
        stops=optimized,
        total_eta=total_eta,
        total_distance_miles=round(total_distance, 2),
        map_url=None,
    )
