import { useState, useContext, useEffect } from "preact/hooks";
import { Card, CardContent, Typography, Button, Grid, Box, Chip, CircularProgress, Alert } from "@mui/material";
import { SelectedRequestsContext } from "../context/SelectedRequestsContext";
import { produceRequestApi, type ProduceRequest } from "../api/produceApi";

const ProduceRequestFeed = () => {
  const ctx = useContext(SelectedRequestsContext);
  const [requests, setRequests] = useState<ProduceRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [updating, setUpdating] = useState<string[]>([]);

  // Load requests on component mount
  useEffect(() => {
    loadRequests();
  }, []);

  const loadRequests = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await produceRequestApi.getRequests({
        status: 'pending',
        legacy_only: true,
        limit: 50
      });
      setRequests(data);
    } catch (err) {
      console.error('Failed to load requests:', err);
      setError('Failed to load produce requests. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleSelect = (id: string) => {
    setSelected((prev) =>
      prev.includes(id) ? prev.filter((sid) => sid !== id) : [...prev, id]
    );
  };

  const handleAcceptRequest = async (requestId: number) => {
    try {
      setUpdating(prev => [...prev, requestId.toString()]);
      
      // Accept the request (assigns it to current user)
      await produceRequestApi.updateStatus(requestId, 'accepted');
      
      // Reload requests to get updated data
      await loadRequests();
      
      // Remove from selected if it was selected
      setSelected(prev => prev.filter(id => id !== requestId.toString()));
      
    } catch (err) {
      console.error('Failed to accept request:', err);
      setError('Failed to accept request. Please try again.');
    } finally {
      setUpdating(prev => prev.filter(id => id !== requestId.toString()));
    }
  };

  const handleAddToRoute = () => {
    // Convert selected string IDs to ProduceRequest objects
    const selectedRequests = requests
      .filter((req) => selected.includes(req.id.toString()))
      .map(req => ({
        id: req.id.toString(),
        restaurantName: req.restaurant_name,
        location: {
          address: req.delivery_address,
          lat: req.delivery_latitude || 0,
          lng: req.delivery_longitude || 0,
        },
        produce: req.produce_type,
        quantity: `${req.quantity_needed}${req.unit}`,
        deliveryWindow: formatDeliveryWindow(req.delivery_window_start, req.delivery_window_end),
      }));

    ctx?.setSelectedRequests(selectedRequests);
    
    // Clear selections after adding to route
    setSelected([]);
    
    alert("Selected requests added to route: " + selectedRequests.map(r => r.restaurantName).join(", "));
  };

  const formatDeliveryWindow = (start: string, end: string): string => {
    const startDate = new Date(start);
    const endDate = new Date(end);
    const today = new Date();
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const isToday = startDate.toDateString() === today.toDateString();
    const isTomorrow = startDate.toDateString() === tomorrow.toDateString();

    const dayText = isToday ? 'Today' : isTomorrow ? 'Tomorrow' : startDate.toLocaleDateString();
    const timeRange = `${startDate.toLocaleTimeString([], { hour: 'numeric', hour12: true })} - ${endDate.toLocaleTimeString([], { hour: 'numeric', hour12: true })}`;
    
    return `${dayText}, ${timeRange}`;
  };

  if (loading) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight={200}>
        <CircularProgress />
      </Box>
    );
  }

  if (error) {
    return (
      <Box>
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
        <Button onClick={loadRequests} variant="outlined">
          Retry
        </Button>
      </Box>
    );
  }

  return (
    <Box>
      <Box display="flex" justifyContent="space-between" alignItems="center" mb={2}>
        <Typography variant="h5" gutterBottom>Legacy produce requests</Typography>
        <Alert severity="info" sx={{ mb: 2 }}>Historical requests use the original workflow. New customer pickup and farmer delivery requests are managed in Orders & handovers.</Alert>
        <Button onClick={loadRequests} variant="outlined" size="small">
          Refresh
        </Button>
      </Box>
      
      {requests.length === 0 ? (
        <Alert severity="info">
          No pending produce requests at the moment.
        </Alert>
      ) : (
        <>
          <Grid container spacing={2}>
            {requests.map((req) => {
              const isSelected = selected.includes(req.id.toString());
              const isUpdating = updating.includes(req.id.toString());
              const canAccept = req.status === 'pending' && !req.assigned_seller_id;
              
              return (
                <Grid size={{ xs: 12, md: 6 }} key={req.id}>
                  <Card 
                    variant={isSelected ? "outlined" : undefined} 
                    sx={{ 
                      borderColor: isSelected ? 'primary.main' : undefined,
                      opacity: isUpdating ? 0.7 : 1
                    }}
                  >
                    <CardContent>
                      <Box display="flex" justifyContent="space-between" alignItems="center">
                        <Typography variant="h6">{req.restaurant_name}</Typography>
                        <Chip label={req.produce_type} color="success" />
                      </Box>
                      <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                        {req.delivery_address}
                      </Typography>
                      <Typography variant="body2">
                        Quantity: {req.quantity_needed}{req.unit}
                      </Typography>
                      <Typography variant="body2">
                        Delivery: {formatDeliveryWindow(req.delivery_window_start, req.delivery_window_end)}
                      </Typography>
                      {req.max_price_per_unit && (
                        <Typography variant="body2">
                          Max Price: ${req.max_price_per_unit}/{req.unit}
                        </Typography>
                      )}
                      {req.special_requirements && (
                        <Typography variant="body2" sx={{ mt: 1, fontStyle: 'italic' }}>
                          Note: {req.special_requirements}
                        </Typography>
                      )}
                      
                      <Box sx={{ mt: 2, display: 'flex', gap: 1 }}>
                        {canAccept && (
                          <Button
                            variant="contained"
                            color="success"
                            onClick={() => handleAcceptRequest(req.id)}
                            disabled={isUpdating}
                            size="small"
                          >
                            {isUpdating ? <CircularProgress size={16} /> : 'Accept'}
                          </Button>
                        )}
                        
                        {req.assigned_seller_id && (
                          <Button
                            variant={isSelected ? "contained" : "outlined"}
                            color="primary"
                            onClick={() => handleSelect(req.id.toString())}
                            disabled={isUpdating}
                            size="small"
                          >
                            {isSelected ? "Selected" : "Add to Route"}
                          </Button>
                        )}
                      </Box>
                    </CardContent>
                  </Card>
                </Grid>
              );
            })}
          </Grid>
          
          {selected.length > 0 && (
            <Button 
              variant="contained" 
              color="primary" 
              sx={{ mt: 3 }} 
              onClick={handleAddToRoute}
            >
              Add Selected Requests to Route ({selected.length})
            </Button>
          )}
        </>
      )}
    </Box>
  );
};

export default ProduceRequestFeed;