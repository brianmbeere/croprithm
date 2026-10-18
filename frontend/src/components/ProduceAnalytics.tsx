import { useState, useEffect } from "preact/hooks";
import {
  Box,
  Typography,
  Card,
  CardContent,
  Grid,
  CircularProgress,
  Alert,
  Chip
} from "@mui/material";
import { analyticsApi } from "../api/produceApi";

interface DemandAnalytic {
  produce_type: string;
  total_requests: number;
  average_quantity: number;
  average_price: number;
  trend_direction: string;
}

interface MarketInsights {
  top_requested_produce: Array<{
    produce_type: string;
    demand_requests: number;
    supply_listings: number;
    average_requested_price: number;
    supply_demand_ratio: number;
  }>;
  market_trends: {
    high_demand_low_supply: any[];
    oversupplied: any[];
  };
  total_active_requests: number;
  total_available_inventory: number;
}

const ProduceAnalytics = () => {
  const [demandData, setDemandData] = useState<DemandAnalytic[]>([]);
  const [marketInsights, setMarketInsights] = useState<MarketInsights | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadAnalytics();
  }, []);

  const loadAnalytics = async () => {
    try {
      setLoading(true);
      setError(null);
      
      const [demand, market] = await Promise.all([
        analyticsApi.getDemandAnalytics(30),
        analyticsApi.getMarketInsights()
      ]);
      
      setDemandData(demand);
      setMarketInsights(market);
    } catch (err) {
      console.error('Failed to load analytics:', err);
      setError('Failed to load analytics data. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const getTrendColor = (trend: string) => {
    switch (trend) {
      case 'increasing': return 'success';
      case 'decreasing': return 'error';
      default: return 'default';
    }
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
      <Alert severity="error">
        {error}
      </Alert>
    );
  }

  return (
    <Box>
      <Typography variant="h5" gutterBottom>
        Market Analytics
      </Typography>

      {/* Market Overview */}
      {marketInsights && (
        <Grid container spacing={2} sx={{ mb: 3 }}>
          <Grid size={{ xs: 12, md: 3 }}>
            <Card>
              <CardContent sx={{ textAlign: 'center' }}>
                <Typography variant="h4" color="primary">
                  {marketInsights.total_active_requests}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  Active Requests
                </Typography>
              </CardContent>
            </Card>
          </Grid>
          <Grid size={{ xs: 12, md: 3 }}>
            <Card>
              <CardContent sx={{ textAlign: 'center' }}>
                <Typography variant="h4" color="primary">
                  {marketInsights.total_available_inventory}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  Available Inventory
                </Typography>
              </CardContent>
            </Card>
          </Grid>
          <Grid size={{ xs: 12, md: 3 }}>
            <Card>
              <CardContent sx={{ textAlign: 'center' }}>
                <Typography variant="h4" color="warning.main">
                  {marketInsights.market_trends.high_demand_low_supply.length}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  High Demand Items
                </Typography>
              </CardContent>
            </Card>
          </Grid>
          <Grid size={{ xs: 12, md: 3 }}>
            <Card>
              <CardContent sx={{ textAlign: 'center' }}>
                <Typography variant="h4" color="info.main">
                  {marketInsights.market_trends.oversupplied.length}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  Oversupplied Items
                </Typography>
              </CardContent>
            </Card>
          </Grid>
        </Grid>
      )}

      {/* Demand Trends */}
      <Typography variant="h6" gutterBottom sx={{ mt: 3 }}>
        Demand Trends (Last 30 Days)
      </Typography>
      
      {demandData.length === 0 ? (
        <Alert severity="info">
          No demand data available for the selected period.
        </Alert>
      ) : (
        <Grid container spacing={2}>
          {demandData.map((item) => (
            <Grid size={{ xs: 12, md: 6, lg: 4 }} key={item.produce_type}>
              <Card>
                <CardContent>
                  <Box display="flex" justifyContent="space-between" alignItems="center" mb={1}>
                    <Typography variant="h6">
                      {item.produce_type}
                    </Typography>
                    <Chip 
                      label={item.trend_direction} 
                      color={getTrendColor(item.trend_direction) as any}
                      size="small"
                    />
                  </Box>
                  
                  <Typography variant="body2" gutterBottom>
                    Total Requests: {item.total_requests}
                  </Typography>
                  
                  <Typography variant="body2" gutterBottom>
                    Avg Quantity: {item.average_quantity.toFixed(1)} units
                  </Typography>
                  
                  {item.average_price > 0 && (
                    <Typography variant="body2">
                      Avg Price: ${item.average_price.toFixed(2)}/unit
                    </Typography>
                  )}
                </CardContent>
              </Card>
            </Grid>
          ))}
        </Grid>
      )}

      {/* Market Opportunities */}
      {marketInsights && marketInsights.top_requested_produce.length > 0 && (
        <>
          <Typography variant="h6" gutterBottom sx={{ mt: 3 }}>
            Market Opportunities
          </Typography>
          
          <Grid container spacing={2}>
            {marketInsights.top_requested_produce.slice(0, 6).map((item) => (
              <Grid size={{ xs: 12, md: 6, lg: 4 }} key={item.produce_type}>
                <Card>
                  <CardContent>
                    <Typography variant="h6" gutterBottom>
                      {item.produce_type}
                    </Typography>
                    
                    <Box display="flex" justifyContent="space-between" mb={1}>
                      <Typography variant="body2">Demand:</Typography>
                      <Typography variant="body2" fontWeight="bold">
                        {item.demand_requests} requests
                      </Typography>
                    </Box>
                    
                    <Box display="flex" justifyContent="space-between" mb={1}>
                      <Typography variant="body2">Supply:</Typography>
                      <Typography variant="body2" fontWeight="bold">
                        {item.supply_listings} listings
                      </Typography>
                    </Box>
                    
                    <Box display="flex" justifyContent="space-between" mb={1}>
                      <Typography variant="body2">Avg Price:</Typography>
                      <Typography variant="body2" fontWeight="bold">
                        ${item.average_requested_price.toFixed(2)}
                      </Typography>
                    </Box>
                    
                    <Box display="flex" justifyContent="space-between">
                      <Typography variant="body2">Supply Ratio:</Typography>
                      <Chip
                        label={item.supply_demand_ratio.toFixed(2)}
                        color={item.supply_demand_ratio < 0.5 ? 'error' : 
                               item.supply_demand_ratio > 2.0 ? 'warning' : 'success'}
                        size="small"
                      />
                    </Box>
                  </CardContent>
                </Card>
              </Grid>
            ))}
          </Grid>
        </>
      )}
    </Box>
  );
};

export default ProduceAnalytics;
