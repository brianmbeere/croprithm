import { useEffect, useState } from "preact/hooks";
import { Alert, Box, Button, Chip, CircularProgress, Paper, Stack, Typography } from "@mui/material";
import { deliveryRouteApi, type DeliveryStop, type StopStatus } from "../../api/produceApi";
import NavigationButtons from "./NavigationButtons";

export default function DeliveryItinerary({ routeId, editable, onProgress }: {
  routeId: number;
  editable: boolean;
  onProgress: () => void;
}) {
  const [stops, setStops] = useState<DeliveryStop[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    let current = true;
    setLoading(true);
    setError(null);
    deliveryRouteApi.getStops(routeId).then(data => {
      if (current) setStops(data);
    }).catch(err => {
      console.error("Could not load delivery stops", err);
      if (current) setError("Could not load saved stops. Check your connection and retry.");
    }).finally(() => { if (current) setLoading(false); });
    return () => { current = false; };
  }, [routeId, reload]);

  const update = async (stop: DeliveryStop, status: StopStatus) => {
    setSaving(true);
    setError(null);
    try {
      const saved = await deliveryRouteApi.updateStopStatus(routeId, stop.id, status);
      setStops(previous => previous.map(item => item.id === saved.id ? saved : item));
      onProgress();
    } catch (err) {
      console.error("Could not save delivery progress", err);
      setError(err instanceof Error ? err.message : "Could not save progress. Please retry.");
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <CircularProgress aria-label="Loading saved delivery stops" />;
  const next = stops.find(stop => !["delivered", "skipped"].includes(stop.status));
  return (
    <Stack spacing={2}>
      <Typography variant="h6">Delivery itinerary</Typography>
      <Alert severity="info">
        Open Maps for directions from your current location. Return here to confirm progress.
        Opening Maps does not mark a delivery complete. Updates are saved online; no background GPS tracking.
        Stop progress does not automatically confirm an order in Menurithm.
      </Alert>
      {error && <Alert severity="error" action={<Button onClick={() => setReload(n => n + 1)}>Reload</Button>}>{error}</Alert>}
      {!stops.length && <Alert severity="warning">This route has no saved delivery stops.</Alert>}
      {stops.map(stop => (
        <Paper key={stop.id} variant="outlined" sx={{ p: 2, overflowWrap: "anywhere" }}>
          <Stack spacing={1.5}>
            <Box>
              <Typography fontWeight="bold">{stop.stop_order}. {stop.address}</Typography>
              <Chip label={stop.status.replace("_", " ")} size="small" sx={{ mr: 1 }} />
              {editable && stop.id === next?.id && <Chip label="Next stop" size="small" color="primary" />}
            </Box>
            <NavigationButtons destination={stop} />
            {editable && (
              <Stack direction="row" useFlexGap flexWrap="wrap" gap={1}>
                {(["en_route", "arrived", "delivered", "skipped", "pending"] as const).map(status => (
                  <Button key={status} size="small" variant={status === "delivered" ? "contained" : "outlined"}
                    sx={{ minHeight: 44 }} disabled={saving || stop.status === status}
                    onClick={() => update(stop, status)}>
                    {{ en_route: "En route", arrived: "Arrived", delivered: "Mark delivered", skipped: "Skip stop", pending: "Reset" }[status]}
                  </Button>
                ))}
              </Stack>
            )}
          </Stack>
        </Paper>
      ))}
      <Typography variant="body2" color="text.secondary">
        Resolve skipped stops before completing the route. Maps may choose different roads and travel times from this plan.
        Only update progress when safely parked.
      </Typography>
    </Stack>
  );
}
