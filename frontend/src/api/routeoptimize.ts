import { type OptimizedStop } from "../types/route";
import { BASE_URL as API_BASE_URL } from "../utils";

export type OptimizeRouteRequest = {
  pickup: string;
  stops: { address: string }[];
};

export type OptimizeRouteResponse = {
  stops: OptimizedStop[];
  total_eta: number;
  total_distance_miles: number;
  map_url?: string;
};


export async function optimizeRoute(
  payload: OptimizeRouteRequest
): Promise<OptimizeRouteResponse> {
  const response = await fetch(`${API_BASE_URL}/api/optimize-route`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error(`Failed to optimize route: ${response.statusText}`);
  }

  return await response.json();
}
