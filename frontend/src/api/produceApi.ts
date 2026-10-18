// API service for produce management endpoints
import { auth } from "../hooks/initializeFirebase";
import { BASE_URL as API_BASE_URL } from "../utils";

// Types matching backend schemas
export interface ProduceInventory {
  id: number;
  seller_id: number;
  produce_type: string;
  variety?: string;
  quantity_available: number;
  unit: string;
  price_per_unit: number;
  harvest_date?: string;
  expiry_date?: string;
  location: string;
  latitude?: number;
  longitude?: number;
  organic: boolean;
  description?: string;
  is_available: boolean;
  created_at: string;
  updated_at: string;
}

export interface ProduceRequest {
  id: number;
  restaurant_id?: number;  // Optional for Menurithm requests
  restaurant_name: string;
  produce_type: string;
  quantity_needed: number;
  unit: string;
  max_price_per_unit?: number;
  delivery_address: string;
  delivery_latitude?: number;
  delivery_longitude?: number;
  delivery_window_start: string;
  delivery_window_end: string;
  special_requirements?: string;
  status: string;
  assigned_seller_id?: number;
  menurithm_request_id?: string;
  created_at: string;
  updated_at: string;
}

export interface DeliveryRoute {
  id: number;
  seller_id: number;
  route_name: string;
  pickup_location: string;
  pickup_latitude?: number;
  pickup_longitude?: number;
  total_distance_miles?: number;
  estimated_duration_minutes?: number;
  status: string;
  delivery_date: string;
  created_at: string;
  updated_at: string;
}

export interface CreateProduceRequest {
  restaurant_name: string;
  produce_type: string;
  quantity_needed: number;
  unit: string;
  max_price_per_unit?: number;
  delivery_address: string;
  delivery_latitude?: number;
  delivery_longitude?: number;
  delivery_window_start: string;
  delivery_window_end: string;
  special_requirements?: string;
}

export interface CreateDeliveryRoute {
  route_name: string;
  pickup_location: string;
  pickup_latitude?: number;
  pickup_longitude?: number;
  delivery_date: string;
  request_ids: number[];
}

// Helper function to get auth headers
async function getAuthHeaders(): Promise<HeadersInit> {
  const user = auth.currentUser;
  if (!user) {
    throw new Error('User not authenticated');
  }
  
  const token = await user.getIdToken();
  return {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`
  };
}

// Produce Inventory API
export const produceInventoryApi = {
  async create(inventory: Omit<ProduceInventory, 'id' | 'seller_id' | 'created_at' | 'updated_at' | 'is_available'>): Promise<ProduceInventory> {
    const headers = await getAuthHeaders();
    const response = await fetch(`${API_BASE_URL}/api/produce/inventory`, {
      method: 'POST',
      headers,
      body: JSON.stringify(inventory)
    });
    
    if (!response.ok) {
      throw new Error(`Failed to create inventory: ${response.statusText}`);
    }
    
    return response.json();
  },

  async getSellerInventory(): Promise<ProduceInventory[]> {
    const headers = await getAuthHeaders();
    const response = await fetch(`${API_BASE_URL}/api/produce/inventory`, {
      method: 'GET',
      headers
    });
    
    if (!response.ok) {
      throw new Error(`Failed to get inventory: ${response.statusText}`);
    }
    
    return response.json();
  },

  async update(id: number, updates: Partial<ProduceInventory>): Promise<ProduceInventory> {
    const headers = await getAuthHeaders();
    const response = await fetch(`${API_BASE_URL}/api/produce/inventory/${id}`, {
      method: 'PUT',
      headers,
      body: JSON.stringify(updates)
    });
    
    if (!response.ok) {
      throw new Error(`Failed to update inventory: ${response.statusText}`);
    }
    
    return response.json();
  },

  async delete(id: number): Promise<void> {
    const headers = await getAuthHeaders();
    const response = await fetch(`${API_BASE_URL}/api/produce/inventory/${id}`, {
      method: 'DELETE',
      headers
    });
    
    if (!response.ok) {
      throw new Error(`Failed to delete inventory: ${response.statusText}`);
    }
  }
};

// Public Produce API
export const publicProduceApi = {
  async getAvailable(params?: {
    produce_type?: string;
    location?: string;
    organic_only?: boolean;
    max_price?: number;
    skip?: number;
    limit?: number;
  }): Promise<ProduceInventory[]> {
    const searchParams = new URLSearchParams();
    if (params) {
      Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined) {
          searchParams.append(key, value.toString());
        }
      });
    }
    
    const response = await fetch(`${API_BASE_URL}/api/produce/available?${searchParams}`, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' }
    });
    
    if (!response.ok) {
      throw new Error(`Failed to get available produce: ${response.statusText}`);
    }
    
    return response.json();
  },

  async search(query: string): Promise<ProduceInventory[]> {
    const response = await fetch(`${API_BASE_URL}/api/produce/search?q=${encodeURIComponent(query)}`, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' }
    });
    
    if (!response.ok) {
      throw new Error(`Failed to search produce: ${response.statusText}`);
    }
    
    return response.json();
  }
};

// Produce Requests API
export const produceRequestApi = {
  async create(request: CreateProduceRequest): Promise<ProduceRequest> {
    const headers = await getAuthHeaders();
    const response = await fetch(`${API_BASE_URL}/api/requests`, {
      method: 'POST',
      headers,
      body: JSON.stringify(request)
    });
    
    if (!response.ok) {
      throw new Error(`Failed to create request: ${response.statusText}`);
    }
    
    return response.json();
  },

  async getRequests(params?: {
    status?: string;
    produce_type?: string;
    skip?: number;
    limit?: number;
  }): Promise<ProduceRequest[]> {
    const headers = await getAuthHeaders();
    const searchParams = new URLSearchParams();
    if (params) {
      Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined) {
          searchParams.append(key, value.toString());
        }
      });
    }
    
    const response = await fetch(`${API_BASE_URL}/api/requests?${searchParams}`, {
      method: 'GET',
      headers
    });
    
    if (!response.ok) {
      throw new Error(`Failed to get requests: ${response.statusText}`);
    }
    
    return response.json();
  },

  async updateStatus(id: number, status: string, assignedSellerId?: number): Promise<ProduceRequest> {
    const headers = await getAuthHeaders();
    const body: any = { status };
    if (assignedSellerId) {
      body.assigned_seller_id = assignedSellerId;
    }
    
    const response = await fetch(`${API_BASE_URL}/api/requests/${id}/status`, {
      method: 'PUT',
      headers,
      body: JSON.stringify(body)
    });
    
    if (!response.ok) {
      throw new Error(`Failed to update request status: ${response.statusText}`);
    }
    
    return response.json();
  }
};

// Delivery Routes API
export const deliveryRouteApi = {
  async createFromRequests(route: CreateDeliveryRoute): Promise<DeliveryRoute> {
    const headers = await getAuthHeaders();
    const response = await fetch(`${API_BASE_URL}/api/routes/from-requests`, {
      method: 'POST',
      headers,
      body: JSON.stringify(route)
    });
    
    if (!response.ok) {
      throw new Error(`Failed to create route: ${response.statusText}`);
    }
    
    return response.json();
  },

  async getActiveRoutes(): Promise<DeliveryRoute[]> {
    const headers = await getAuthHeaders();
    const response = await fetch(`${API_BASE_URL}/api/routes/active`, {
      method: 'GET',
      headers
    });
    
    if (!response.ok) {
      throw new Error(`Failed to get active routes: ${response.statusText}`);
    }
    
    return response.json();
  },

  async updateStatus(id: number, status: string): Promise<void> {
    const headers = await getAuthHeaders();
    const response = await fetch(`${API_BASE_URL}/api/routes/${id}/status?status=${encodeURIComponent(status)}`, {
      method: 'PUT',
      headers
    });
    
    if (!response.ok) {
      throw new Error(`Failed to update route status: ${response.statusText}`);
    }
  },

  async getAllRoutes(): Promise<DeliveryRoute[]> {
    const headers = await getAuthHeaders();
    const response = await fetch(`${API_BASE_URL}/api/routes/all`, {
      method: 'GET',
      headers
    });
    
    if (!response.ok) {
      // Fallback to active routes if /all endpoint doesn't exist
      return this.getActiveRoutes();
    }
    
    return response.json();
  }
};

// Analytics API
export const analyticsApi = {
  async getDemandAnalytics(days: number = 30) {
    const headers = await getAuthHeaders();
    const response = await fetch(`${API_BASE_URL}/api/analytics/demand?days=${days}`, {
      method: 'GET',
      headers
    });
    
    if (!response.ok) {
      throw new Error(`Failed to get demand analytics: ${response.statusText}`);
    }
    
    return response.json();
  },

  async getSellerPerformance() {
    const headers = await getAuthHeaders();
    const response = await fetch(`${API_BASE_URL}/api/analytics/seller/performance`, {
      method: 'GET',
      headers
    });
    
    if (!response.ok) {
      throw new Error(`Failed to get seller performance: ${response.statusText}`);
    }
    
    return response.json();
  },

  async getMarketInsights() {
    const headers = await getAuthHeaders();
    const response = await fetch(`${API_BASE_URL}/api/analytics/market/insights`, {
      method: 'GET',
      headers
    });
    
    if (!response.ok) {
      throw new Error(`Failed to get market insights: ${response.statusText}`);
    }
    
    return response.json();
  }
};
