import { useState, useEffect } from "preact/hooks";
import {
  Box,
  Typography,
  Card,
  CardContent,
  Button,
  Chip,
  CircularProgress,
  Alert,
  IconButton,
  Menu,
  MenuItem,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Divider,
  Stack,
  LinearProgress,
  Paper,
  Grid,
} from "@mui/material";
import { MoreVertIcon, DeleteIcon } from "./SVGIcons";
import { deliveryRouteApi, type DeliveryRoute } from "../api/produceApi";

interface RouteMetrics {
  totalRoutes: number;
  completedRoutes: number;
  totalMilesSaved: number;
  avgDeliveryTime: number;
  co2Saved: number;
  fuelSaved: number;
}

const SavedRoutes = () => {
  const [routes, setRoutes] = useState<DeliveryRoute[]>([]);
  const [allRoutes, setAllRoutes] = useState<DeliveryRoute[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [menuAnchor, setMenuAnchor] = useState<HTMLElement | null>(null);
  const [selectedRoute, setSelectedRoute] = useState<DeliveryRoute | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [filter, setFilter] = useState<"all" | "active" | "completed">("all");

  // Calculate metrics from routes
  const metrics: RouteMetrics = {
    totalRoutes: allRoutes.length,
    completedRoutes: allRoutes.filter((r) => r.status === "completed").length,
    totalMilesSaved: allRoutes.reduce((sum, r) => sum + (r.total_distance_miles || 0) * 0.15, 0), // ~15% savings from optimization
    avgDeliveryTime: allRoutes.length > 0 
      ? allRoutes.reduce((sum, r) => sum + (r.estimated_duration_minutes || 0), 0) / allRoutes.length 
      : 0,
    co2Saved: allRoutes.reduce((sum, r) => sum + (r.total_distance_miles || 0) * 0.15 * 0.404, 0), // kg CO2 per mile
    fuelSaved: allRoutes.reduce((sum, r) => sum + (r.total_distance_miles || 0) * 0.15 / 25, 0), // gallons at 25mpg
  };

  useEffect(() => {
    loadRoutes();
  }, []);

  useEffect(() => {
    if (filter === "all") {
      setRoutes(allRoutes);
    } else if (filter === "active") {
      setRoutes(allRoutes.filter((r) => r.status === "planned" || r.status === "active"));
    } else {
      setRoutes(allRoutes.filter((r) => r.status === "completed"));
    }
  }, [filter, allRoutes]);

  const loadRoutes = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await deliveryRouteApi.getAllRoutes();
      setAllRoutes(data);
      setRoutes(data);
    } catch (err) {
      console.error("Failed to load routes:", err);
      setError("Failed to load saved routes. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleStatusChange = async (routeId: number, newStatus: string) => {
    try {
      await deliveryRouteApi.updateStatus(routeId, newStatus);
      await loadRoutes();
      handleCloseMenu();
    } catch (err) {
      console.error("Failed to update status:", err);
      setError("Failed to update route status.");
    }
  };

  const handleMenuOpen = (event: Event, route: DeliveryRoute) => {
    setMenuAnchor(event.currentTarget as HTMLElement);
    setSelectedRoute(route);
  };

  const handleCloseMenu = () => {
    setMenuAnchor(null);
    setSelectedRoute(null);
  };

  const handleViewDetails = (route: DeliveryRoute) => {
    setSelectedRoute(route);
    setDetailsOpen(true);
    handleCloseMenu();
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString("en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "completed":
        return "success";
      case "active":
        return "primary";
      case "planned":
        return "info";
      case "cancelled":
        return "error";
      default:
        return "default";
    }
  };

  const exportMetricsReport = () => {
    const report = {
      generatedAt: new Date().toISOString(),
      platform: "Croprithm - Weather-Aware Route Optimization",
      summary: {
        totalRoutesOptimized: metrics.totalRoutes,
        completedDeliveries: metrics.completedRoutes,
        completionRate: metrics.totalRoutes > 0 
          ? ((metrics.completedRoutes / metrics.totalRoutes) * 100).toFixed(1) + "%" 
          : "N/A",
      },
      environmentalImpact: {
        estimatedMilesSaved: metrics.totalMilesSaved.toFixed(1),
        co2EmissionsReduced_kg: metrics.co2Saved.toFixed(2),
        fuelSaved_gallons: metrics.fuelSaved.toFixed(2),
      },
      operationalEfficiency: {
        averageDeliveryTime_minutes: metrics.avgDeliveryTime.toFixed(0),
        optimizationAlgorithm: "OSRM-backed nearest-neighbor with weather adjustments",
      },
      routes: allRoutes.map((r) => ({
        id: r.id,
        name: r.route_name,
        status: r.status,
        distance_miles: r.total_distance_miles,
        duration_minutes: r.estimated_duration_minutes,
        deliveryDate: r.delivery_date,
        createdAt: r.created_at,
      })),
    };

    const blob = new Blob([JSON.stringify(report, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `croprithm-metrics-${new Date().toISOString().split("T")[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (loading) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight={200}>
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box>
      <Box display="flex" justifyContent="space-between" alignItems="center" mb={3}>
        <Typography variant="h5">Saved Routes & Delivery History</Typography>
        <Stack direction="row" spacing={1}>
          <Button onClick={loadRoutes} variant="outlined" size="small">
            Refresh
          </Button>
          <Button onClick={exportMetricsReport} variant="contained" size="small" color="secondary">
            Export Report
          </Button>
        </Stack>
      </Box>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}

      {/* Metrics Dashboard */}
      <Paper elevation={2} sx={{ p: 3, mb: 4, bgcolor: "background.paper" }}>
        <Typography variant="h6" gutterBottom>
          Route Optimization Metrics
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          Real-time analytics demonstrating operational efficiency and environmental impact
        </Typography>
        <Grid container spacing={3}>
          <Grid size={{ xs: 6, md: 2 }}>
            <Box textAlign="center">
              <Typography variant="h4" color="primary">
                {metrics.totalRoutes}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Total Routes
              </Typography>
            </Box>
          </Grid>
          <Grid size={{ xs: 6, md: 2 }}>
            <Box textAlign="center">
              <Typography variant="h4" color="success.main">
                {metrics.completedRoutes}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Completed
              </Typography>
            </Box>
          </Grid>
          <Grid size={{ xs: 6, md: 2 }}>
            <Box textAlign="center">
              <Typography variant="h4" color="info.main">
                {metrics.totalMilesSaved.toFixed(1)}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Miles Saved
              </Typography>
            </Box>
          </Grid>
          <Grid size={{ xs: 6, md: 2 }}>
            <Box textAlign="center">
              <Typography variant="h4" color="warning.main">
                {metrics.avgDeliveryTime.toFixed(0)}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Avg Time (min)
              </Typography>
            </Box>
          </Grid>
          <Grid size={{ xs: 6, md: 2 }}>
            <Box textAlign="center">
              <Typography variant="h4" color="success.dark">
                {metrics.co2Saved.toFixed(1)}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                kg CO₂ Saved
              </Typography>
            </Box>
          </Grid>
          <Grid size={{ xs: 6, md: 2 }}>
            <Box textAlign="center">
              <Typography variant="h4" color="secondary.main">
                {metrics.fuelSaved.toFixed(1)}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Gallons Saved
              </Typography>
            </Box>
          </Grid>
        </Grid>

        {metrics.totalRoutes > 0 && (
          <Box sx={{ mt: 3 }}>
            <Typography variant="body2" color="text.secondary" gutterBottom>
              Completion Rate
            </Typography>
            <LinearProgress
              variant="determinate"
              value={(metrics.completedRoutes / metrics.totalRoutes) * 100}
              sx={{ height: 8, borderRadius: 4 }}
            />
            <Typography variant="caption" color="text.secondary">
              {((metrics.completedRoutes / metrics.totalRoutes) * 100).toFixed(1)}% of routes completed
            </Typography>
          </Box>
        )}
      </Paper>

      {/* Filter Tabs */}
      <Stack direction="row" spacing={1} sx={{ mb: 2 }}>
        <Chip
          label="All"
          onClick={() => setFilter("all")}
          color={filter === "all" ? "primary" : "default"}
          variant={filter === "all" ? "filled" : "outlined"}
        />
        <Chip
          label="Active"
          onClick={() => setFilter("active")}
          color={filter === "active" ? "primary" : "default"}
          variant={filter === "active" ? "filled" : "outlined"}
        />
        <Chip
          label="Completed"
          onClick={() => setFilter("completed")}
          color={filter === "completed" ? "primary" : "default"}
          variant={filter === "completed" ? "filled" : "outlined"}
        />
      </Stack>

      {/* Routes List */}
      {routes.length === 0 ? (
        <Card>
          <CardContent sx={{ textAlign: "center", py: 4 }}>
            <Typography variant="h6" color="text.secondary" gutterBottom>
              No saved routes yet
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Accept produce requests and create optimized delivery routes to see them here.
            </Typography>
          </CardContent>
        </Card>
      ) : (
        <Grid container spacing={2}>
          {routes.map((route) => (
            <Grid size={{ xs: 12, md: 6, lg: 4 }} key={route.id}>
              <Card>
                <CardContent>
                  <Box display="flex" justifyContent="space-between" alignItems="flex-start">
                    <Box flex={1}>
                      <Typography variant="h6" gutterBottom>
                        {route.route_name}
                      </Typography>
                    </Box>
                    <Stack direction="row" alignItems="center" spacing={1}>
                      <Chip
                        label={route.status}
                        color={getStatusColor(route.status) as any}
                        size="small"
                      />
                      <IconButton size="small" onClick={(e) => handleMenuOpen(e, route)}>
                        <MoreVertIcon />
                      </IconButton>
                    </Stack>
                  </Box>

                  <Typography variant="body2" color="text.secondary" gutterBottom>
                    📍 {route.pickup_location}
                  </Typography>

                  <Divider sx={{ my: 1.5 }} />

                  <Grid container spacing={1}>
                    <Grid size={{ xs: 6 }}>
                      <Typography variant="caption" color="text.secondary">
                        Distance
                      </Typography>
                      <Typography variant="body2" fontWeight="bold">
                        {route.total_distance_miles?.toFixed(1) || "—"} mi
                      </Typography>
                    </Grid>
                    <Grid size={{ xs: 6 }}>
                      <Typography variant="caption" color="text.secondary">
                        Duration
                      </Typography>
                      <Typography variant="body2" fontWeight="bold">
                        {route.estimated_duration_minutes || "—"} min
                      </Typography>
                    </Grid>
                    <Grid size={{ xs: 6 }}>
                      <Typography variant="caption" color="text.secondary">
                        Delivery Date
                      </Typography>
                      <Typography variant="body2">
                        {formatDate(route.delivery_date)}
                      </Typography>
                    </Grid>
                    <Grid size={{ xs: 6 }}>
                      <Typography variant="caption" color="text.secondary">
                        Created
                      </Typography>
                      <Typography variant="body2">
                        {formatDate(route.created_at)}
                      </Typography>
                    </Grid>
                  </Grid>

                  <Box sx={{ mt: 2 }}>
                    <Button
                      variant="outlined"
                      size="small"
                      fullWidth
                      onClick={() => handleViewDetails(route)}
                    >
                      View Details
                    </Button>
                  </Box>
                </CardContent>
              </Card>
            </Grid>
          ))}
        </Grid>
      )}

      {/* Context Menu */}
      <Menu anchorEl={menuAnchor} open={Boolean(menuAnchor)} onClose={handleCloseMenu}>
        <MenuItem onClick={() => selectedRoute && handleViewDetails(selectedRoute)}>
          View Details
        </MenuItem>
        {selectedRoute?.status === "planned" && (
          <MenuItem onClick={() => selectedRoute && handleStatusChange(selectedRoute.id, "active")}>
            Start Route
          </MenuItem>
        )}
        {selectedRoute?.status === "active" && (
          <MenuItem onClick={() => selectedRoute && handleStatusChange(selectedRoute.id, "completed")}>
            Mark Completed
          </MenuItem>
        )}
        <MenuItem
          onClick={() => selectedRoute && handleStatusChange(selectedRoute.id, "cancelled")}
          sx={{ color: "error.main" }}
        >
          <DeleteIcon style={{ marginRight: 8 }} />
          Cancel Route
        </MenuItem>
      </Menu>

      {/* Route Details Dialog */}
      <Dialog open={detailsOpen} onClose={() => setDetailsOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>
          Route Details
          {selectedRoute && (
            <Chip
              label={selectedRoute.status}
              color={getStatusColor(selectedRoute.status) as any}
              size="small"
              sx={{ ml: 2 }}
            />
          )}
        </DialogTitle>
        <DialogContent>
          {selectedRoute && (
            <Stack spacing={2} sx={{ mt: 1 }}>
              <Box>
                <Typography variant="subtitle2" color="text.secondary">
                  Route Name
                </Typography>
                <Typography variant="body1">{selectedRoute.route_name}</Typography>
              </Box>

              <Box>
                <Typography variant="subtitle2" color="text.secondary">
                  Pickup Location
                </Typography>
                <Typography variant="body1">{selectedRoute.pickup_location}</Typography>
              </Box>

              <Divider />

              <Grid container spacing={2}>
                <Grid size={{ xs: 6 }}>
                  <Typography variant="subtitle2" color="text.secondary">
                    Total Distance
                  </Typography>
                  <Typography variant="h6">
                    {selectedRoute.total_distance_miles?.toFixed(2) || "—"} miles
                  </Typography>
                </Grid>
                <Grid size={{ xs: 6 }}>
                  <Typography variant="subtitle2" color="text.secondary">
                    Est. Duration
                  </Typography>
                  <Typography variant="h6">
                    {selectedRoute.estimated_duration_minutes || "—"} min
                  </Typography>
                </Grid>
              </Grid>

              <Divider />

              <Box>
                <Typography variant="subtitle2" color="text.secondary">
                  Delivery Date
                </Typography>
                <Typography variant="body1">{formatDate(selectedRoute.delivery_date)}</Typography>
              </Box>

              <Box>
                <Typography variant="subtitle2" color="text.secondary">
                  Created
                </Typography>
                <Typography variant="body1">{formatDate(selectedRoute.created_at)}</Typography>
              </Box>

              {selectedRoute.total_distance_miles && (
                <Paper variant="outlined" sx={{ p: 2, bgcolor: "success.light" }}>
                  <Typography variant="subtitle2" gutterBottom>
                    Environmental Impact Estimate
                  </Typography>
                  <Typography variant="body2">
                    🌱 CO₂ Saved: {(selectedRoute.total_distance_miles * 0.15 * 0.404).toFixed(2)} kg
                  </Typography>
                  <Typography variant="body2">
                    ⛽ Fuel Saved: {(selectedRoute.total_distance_miles * 0.15 / 25).toFixed(2)} gallons
                  </Typography>
                </Paper>
              )}
            </Stack>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDetailsOpen(false)}>Close</Button>
          {selectedRoute?.status === "planned" && (
            <Button
              variant="contained"
              onClick={() => {
                handleStatusChange(selectedRoute.id, "active");
                setDetailsOpen(false);
              }}
            >
              Start Route
            </Button>
          )}
          {selectedRoute?.status === "active" && (
            <Button
              variant="contained"
              color="success"
              onClick={() => {
                handleStatusChange(selectedRoute.id, "completed");
                setDetailsOpen(false);
              }}
            >
              Mark Completed
            </Button>
          )}
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default SavedRoutes;
