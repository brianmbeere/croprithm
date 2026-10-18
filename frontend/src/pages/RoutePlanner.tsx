import { useState, useContext, useEffect } from "preact/hooks";
import { SelectedRequestsContext } from "../context/SelectedRequestsContext";
import {
  Container,
  Button,
  Typography,
  Box,
  Paper,
  IconButton,
  Tooltip,
  Alert,
  Chip,
  Stack,
  Checkbox,
  CircularProgress,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogContentText,
  DialogActions,
  TextField,
} from "@mui/material";
import { type FunctionalComponent } from "preact";
import {
  optimizeRoute,
  type OptimizeRouteRequest,
  type OptimizeRouteResponse,
} from "../api/routeoptimize";
import { produceRequestApi, deliveryRouteApi, type DeliveryRoute, type ProduceRequest as BackendProduceRequest } from "../api/produceApi";
import StopInputList from "../components/route/StopInputList";
import MapboxRouteMap from "../components/route/MapboxRouteMap";
import AutocompleteTextField from "../components/route/AutoCompleteTextField";
import { DeleteIcon } from '../components/SVGIcons';
import NavigationButtons from "../components/route/NavigationButtons";
import DeliveryItinerary from "../components/route/DeliveryItinerary";

const RoutePlanner: FunctionalComponent = () => {
  const ctx = useContext(SelectedRequestsContext);
  const [pickup, setPickup] = useState("");
  // If there are selected requests, use their addresses as stops; otherwise, default to one empty stop
  const [stops, setStops] = useState<{ address: string }[]>(
    ctx?.selectedRequests && ctx.selectedRequests.length > 0
      ? ctx.selectedRequests.map(req => ({ address: req.location.address }))
      : [{ address: "" }]
  );
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<OptimizeRouteResponse | null>(null);
  const [routeError, setRouteError] = useState<string | null>(null);
  const [routeName, setRouteName] = useState("Today's deliveries");
  const [savedRoute, setSavedRoute] = useState<DeliveryRoute | null>(null);

  // Accepted orders from backend
  const [acceptedOrders, setAcceptedOrders] = useState<BackendProduceRequest[]>([]);
  const [loadingOrders, setLoadingOrders] = useState(false);
  const [selectedOrderIds, setSelectedOrderIds] = useState<Set<number>>(new Set());
  const [ordersError, setOrdersError] = useState<string | null>(null);
  const [removingOrderId, setRemovingOrderId] = useState<number | null>(null);
  const [confirmRemoveDialogOpen, setConfirmRemoveDialogOpen] = useState(false);
  const [orderToRemove, setOrderToRemove] = useState<BackendProduceRequest | null>(null);

  // Load accepted orders on mount
  useEffect(() => {
    loadAcceptedOrders();
  }, []);

  useEffect(() => {
    setResult(null);
  }, [pickup, stops]);

  const loadAcceptedOrders = async () => {
    try {
      setLoadingOrders(true);
      setOrdersError(null);
      const orders = await produceRequestApi.getRequests({ status: "accepted" });
      setAcceptedOrders(orders);
      // Auto-select all accepted orders by default
      setSelectedOrderIds(new Set(orders.map(o => o.id)));
    } catch (err) {
      console.error("Failed to load accepted orders:", err);
      setOrdersError("Failed to load accepted orders");
    } finally {
      setLoadingOrders(false);
    }
  };

  // Toggle order selection
  const toggleOrderSelection = (orderId: number) => {
    setSelectedOrderIds(prev => {
      const newSet = new Set(prev);
      if (newSet.has(orderId)) {
        newSet.delete(orderId);
      } else {
        newSet.add(orderId);
      }
      return newSet;
    });
  };

  // Apply selected orders as stops
  const applySelectedOrdersAsStops = () => {
    const selectedOrders = acceptedOrders.filter(o => selectedOrderIds.has(o.id));
    if (selectedOrders.length === 0) return;
    
    const newStops = selectedOrders.map(order => ({
      address: order.delivery_address
    }));
    setStops(newStops);
  };

  // Open confirmation dialog to remove an accepted order
  const handleRemoveOrderClick = (e: Event, order: BackendProduceRequest) => {
    e.stopPropagation();
    setOrderToRemove(order);
    setConfirmRemoveDialogOpen(true);
  };

  // Close the confirmation dialog
  const handleCloseRemoveDialog = () => {
    setConfirmRemoveDialogOpen(false);
    setOrderToRemove(null);
  };

  // Remove an accepted order (set status back to pending)
  const handleConfirmRemoveOrder = async () => {
    if (!orderToRemove) return;
    
    try {
      setRemovingOrderId(orderToRemove.id);
      await produceRequestApi.updateStatus(orderToRemove.id, "pending");
      
      // Remove from local state
      setAcceptedOrders(prev => prev.filter(o => o.id !== orderToRemove.id));
      setSelectedOrderIds(prev => {
        const newSet = new Set(prev);
        newSet.delete(orderToRemove.id);
        return newSet;
      });
      
      handleCloseRemoveDialog();
    } catch (err) {
      console.error("Failed to remove order:", err);
      setOrdersError("Failed to remove order. Please try again.");
    } finally {
      setRemovingOrderId(null);
    }
  };

  // If selectedRequests changes, update stops accordingly (but only if not already matching)
  useEffect(() => {
    if (ctx?.selectedRequests && ctx.selectedRequests.length > 0) {
      const selectedAddresses = ctx.selectedRequests.map(req => req.location.address);
      // Only update stops if they don't match the selected addresses
      if (
        stops.length !== selectedAddresses.length ||
        stops.some((stop, i) => stop.address !== selectedAddresses[i])
      ) {
        setStops(selectedAddresses.map(address => ({ address })));
      }
    }
  }, [ctx?.selectedRequests]);

  const handleStopChange = (index: number, value: string) => {
    const updated = [...stops];
    updated[index].address = value;
    setStops(updated);
  };

  const addStop = () => {
    setStops([...stops, { address: "" }]);
  };

  const removeStop = (index: number) => {
    if (stops.length === 1) return;
    setStops(stops.filter((_, i) => i !== index));
  };

  const handleSubmit = async () => {
    const payload: OptimizeRouteRequest = { pickup, stops };
    setRouteError(null);
    setResult(null);
    if (!pickup.trim() || stops.some(stop => !stop.address.trim())) {
      setRouteError("Enter a pickup location and an address for every delivery stop.");
      return;
    }
    setLoading(true);
    try {
      const data = await optimizeRoute(payload);
      setResult(data);
    } catch (error) {
      console.error("Route optimization failed:", error);
      setRouteError(error instanceof Error ? error.message : "Could not generate the route.");
    } finally {
      setLoading(false);
    }
  };

  const saveSelectedRoute = async () => {
    setRouteError(null);
    const orders = acceptedOrders.filter(order => selectedOrderIds.has(order.id));
    if (!routeName.trim() || !pickup.trim() || !orders.length ||
        stops.length !== orders.length || stops.some((stop, i) => stop.address !== orders[i].delivery_address)) {
      setRouteError("Enter a route name and pickup, then use selected accepted orders as stops before saving.");
      return;
    }
    setLoading(true);
    try {
      const route = await deliveryRouteApi.createFromRequests({
        route_name: routeName.trim(), pickup_location: pickup.trim(),
        delivery_date: new Date().toISOString(), request_ids: orders.map(order => order.id),
      });
      setSavedRoute(route);
      setResult(null);
    } catch (err) {
      console.error("Could not save route", err);
      setRouteError(err instanceof Error ? err.message : "Could not save the route.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Container maxWidth="lg" sx={{ py: { xs: 2, md: 6 }, px: { xs: 1, sm: 3 } }}>
      <Typography variant="h4" fontWeight="bold" gutterBottom>
        Plan Your Delivery Route
      </Typography>
      <Alert severity="info" sx={{ mb: 3 }}>
        Plan the stop order here, then open Google Maps or Apple Maps for directions.
        Maps chooses the roads; distances and arrival times here are planning estimates.
      </Alert>
      {routeError && <Alert severity="error" sx={{ mb: 2 }}>{routeError}</Alert>}
      {savedRoute && (
        <Paper sx={{ p: { xs: 2, sm: 3 }, mb: 3 }}>
          <Typography variant="h6">{savedRoute.route_name} — saved</Typography>
          <Typography sx={{ mb: 2 }}>Resume this itinerary later from Saved Routes.</Typography>
          <DeliveryItinerary routeId={savedRoute.id} editable onProgress={() => {}} />
          <Button onClick={() => setSavedRoute(null)} sx={{ mt: 2 }}>Plan another route</Button>
        </Paper>
      )}

      {/* Accepted Orders Panel */}
      <Paper elevation={2} sx={{ p: 3, mb: 3 }}>
        <Box display="flex" flexDirection={{ xs: "column", sm: "row" }} gap={2} justifyContent="space-between" alignItems={{ xs: "stretch", sm: "center" }} mb={2}>
          <Typography variant="h6">
            Accepted Orders
          </Typography>
          <Stack direction={{ xs: "column", sm: "row" }} spacing={1}>
            <Button 
              variant="outlined" 
              size="small" 
              onClick={loadAcceptedOrders}
              disabled={loadingOrders}
            >
              {loadingOrders ? "Loading..." : "Refresh"}
            </Button>
            <Button 
              variant="contained" 
              size="small" 
              onClick={applySelectedOrdersAsStops}
              disabled={selectedOrderIds.size === 0}
            >
              Use Selected as Stops ({selectedOrderIds.size})
            </Button>
          </Stack>
        </Box>

        {ordersError && (
          <Alert severity="error" sx={{ mb: 2 }}>{ordersError}</Alert>
        )}

        {loadingOrders ? (
          <Box display="flex" justifyContent="center" py={2}>
            <CircularProgress size={24} />
          </Box>
        ) : acceptedOrders.length === 0 ? (
          <Alert severity="info">
            No accepted orders found. Accept produce requests from the Request Feed to see them here.
          </Alert>
        ) : (
          <Box sx={{ maxHeight: 200, overflowY: "auto" }}>
            {acceptedOrders.map((order) => (
              <Box 
                key={order.id} 
                sx={{ 
                  display: "flex", 
                  alignItems: "center", 
                  p: 1,
                  borderRadius: 1,
                  mb: 1,
                  bgcolor: selectedOrderIds.has(order.id) ? "action.selected" : "background.paper",
                  border: 1,
                  borderColor: selectedOrderIds.has(order.id) ? "primary.main" : "divider",
                  cursor: "pointer",
                  "&:hover": { bgcolor: "action.hover" }
                }}
                onClick={() => toggleOrderSelection(order.id)}
              >
                <Checkbox 
                  checked={selectedOrderIds.has(order.id)} 
                  size="small"
                  sx={{ mr: 1 }}
                />
                <Box flex={1}>
                  <Stack direction="row" spacing={1} alignItems="center">
                    <Typography variant="subtitle2" fontWeight="bold">
                      {order.restaurant_name}
                    </Typography>
                    <Chip 
                      label={order.produce_type} 
                      size="small" 
                      color="primary" 
                      variant="outlined" 
                    />
                    <Chip 
                      label={`${order.quantity_needed} ${order.unit}`} 
                      size="small" 
                      variant="outlined" 
                    />
                  </Stack>
                  <Typography variant="body2" color="text.secondary">
                    📍 {order.delivery_address}
                  </Typography>
                </Box>
                <Tooltip title="Remove from accepted orders">
                  <IconButton
                    size="small"
                    color="error"
                    onClick={(e) => handleRemoveOrderClick(e, order)}
                    disabled={removingOrderId === order.id}
                    sx={{ ml: 1 }}
                  >
                    {removingOrderId === order.id ? (
                      <CircularProgress size={18} color="inherit" />
                    ) : (
                      <DeleteIcon />
                    )}
                  </IconButton>
                </Tooltip>
              </Box>
            ))}
          </Box>
        )}
      </Paper>

      {/* Show selected produce requests as stops, if any */}
      {ctx?.selectedRequests && ctx.selectedRequests.length > 0 && (
        <Paper elevation={2} sx={{ p: 2, mb: 3, bgcolor: '#f5f5f5' }}>
          <Typography variant="subtitle1" fontWeight="bold" gutterBottom>
            Selected Produce Requests:
          </Typography>
          {ctx.selectedRequests.map((req) => (
            <Box key={req.id} sx={{ mb: 1 }}>
              <strong>{req.restaurantName}</strong> — {req.produce} — {req.location.address}
            </Box>
          ))}
        </Paper>
      )}

      <Paper elevation={3} sx={{ p: 3, mb: 4 }}>
        <Box
          sx={{
            display: 'flex',
            flexDirection: { xs: 'column', md: 'row' },
            gap: 3,
            alignItems: 'flex-start',
          }}
        >
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <AutocompleteTextField
              label="Pickup Location"
              value={pickup}
              onSelect={setPickup}
            />
            <StopInputList
              stops={stops}
              onChange={handleStopChange}
              onAdd={addStop}
              onRemove={removeStop}
              inputFullWidth
            />
            <Button
              variant="contained"
              size="large"
              onClick={handleSubmit}
              disabled={loading}
              sx={{ mt: 2, width: '100%' }}
            >
              {loading ? "Optimizing..." : "Generate Route"}
            </Button>
            <TextField fullWidth label="Route name" value={routeName}
              onChange={event => setRouteName(event.currentTarget.value)} sx={{ mt: 2 }} />
            <Button fullWidth variant="outlined" disabled={loading || Boolean(savedRoute)}
              onClick={saveSelectedRoute} sx={{ mt: 2, minHeight: 44 }}>
              Save selected orders for delivery
            </Button>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
              Saving optimizes the selected accepted orders for today and stores progress online.
              Manual-address previews below are not saved. Resume existing orders in Saved Routes instead of saving them twice.
            </Typography>
          </Box>
          {result && (
            <Box sx={{ flex: 1, minWidth: 0, width: '100%' }}>
              <Typography variant="h6" gutterBottom>
                Optimized Route
              </Typography>
              <MapboxRouteMap stops={result.stops} />
              <Typography sx={{ mb: 2 }}>
                Estimated {result.total_distance_miles.toFixed(1)} miles · {result.total_eta} minutes
              </Typography>
              <Alert severity="warning" sx={{ mb: 2 }}>Preview only. Save accepted orders above to retain delivery progress.</Alert>
              <Stack spacing={2}>
                {result.stops.map((stop, index) => (
                  <Paper variant="outlined" key={index} sx={{ p: 2, overflowWrap: "anywhere" }}>
                    <Typography fontWeight="bold" sx={{ mb: 1 }}>
                      {index === 0 ? "Pickup" : `Stop ${index}`}: {stop.address}
                    </Typography>
                    <NavigationButtons destination={{
                      address: stop.address, longitude: stop.location[0], latitude: stop.location[1],
                    }} />
                  </Paper>
                ))}
              </Stack>
            </Box>
          )}
        </Box>
      </Paper>

      {/* Confirmation Dialog for Removing Accepted Order */}
      <Dialog
        open={confirmRemoveDialogOpen}
        onClose={handleCloseRemoveDialog}
        aria-labelledby="remove-order-dialog-title"
        aria-describedby="remove-order-dialog-description"
      >
        <DialogTitle id="remove-order-dialog-title">
          Remove Accepted Order?
        </DialogTitle>
        <DialogContent>
          <DialogContentText id="remove-order-dialog-description">
            Are you sure you want to remove the order from <strong>{orderToRemove?.restaurant_name}</strong> for{" "}
            <strong>{orderToRemove?.quantity_needed} {orderToRemove?.unit}</strong> of{" "}
            <strong>{orderToRemove?.produce_type}</strong>?
            <br /><br />
            This will set the order status back to pending and it will appear in the request feed again.
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCloseRemoveDialog} color="inherit">
            Cancel
          </Button>
          <Button 
            onClick={handleConfirmRemoveOrder} 
            color="error" 
            variant="contained"
            disabled={removingOrderId !== null}
          >
            {removingOrderId !== null ? "Removing..." : "Remove Order"}
          </Button>
        </DialogActions>
      </Dialog>
    </Container>
  );
};

export default RoutePlanner;
