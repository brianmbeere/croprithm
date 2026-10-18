import { useEffect, useState } from "preact/hooks";
import { Alert, Box, Button, Chip, CircularProgress, Dialog, DialogActions, DialogContent, DialogContentText, DialogTitle, Paper, Stack, Typography } from "@mui/material";
import { deliveryRouteApi, type DeliveryStop, type StopStatus } from "../../api/produceApi";
import NavigationButtons from "./NavigationButtons";

export default function DeliveryItinerary({ routeId, editable, handoverEditable = editable, onProgress }: {
  routeId: number;
  editable: boolean;
  handoverEditable?: boolean;
  onProgress: () => void;
}) {
  const [stops, setStops] = useState<DeliveryStop[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);
  const [confirming, setConfirming] = useState<DeliveryStop | null>(null);
  const [notice, setNotice] = useState("");

  const handover = async (stop: DeliveryStop, stage: "ready" | "delivered") => {
    setSaving(true);
    setError(null);
    setNotice("");
    try {
      const saved = await deliveryRouteApi.updateHandover(routeId, stop.id, stage);
      setStops(previous => previous.map(item => item.id === saved.id ? saved : item));
      setConfirming(null);
      setNotice(stage === "delivered"
        ? "Order and route stop confirmed delivered. The customer can refresh Menurithm to see the update."
        : "Produce marked ready. Confirm delivery here after handing it to the customer.");
      onProgress();
    } catch (err) {
      console.error("Could not confirm order handover", err);
      setError(err instanceof Error ? err.message : "Could not confirm handover. Reload before retrying.");
      setConfirming(null);
    } finally {
      setSaving(false);
    }
  };

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
        For approved farmer deliveries, use the order handover actions below to update the order
        without leaving this screen. Route-only progress does not confirm customer receipt.
      </Alert>
      {notice && <Alert severity="success" role="status">{notice}</Alert>}
      {error && <Alert severity="error" action={<Button onClick={() => setReload(n => n + 1)}>Reload</Button>}>{error}</Alert>}
      {!stops.length && <Alert severity="warning">This route has no saved delivery stops.</Alert>}
      {stops.map(stop => (
        <Paper key={stop.id} variant="outlined" sx={{ p: 2, overflowWrap: "anywhere" }}>
          <Stack spacing={1.5}>
            <Box>
              <Typography fontWeight="bold">{stop.stop_order}. {stop.address}</Typography>
              <Chip label={stop.status.replace("_", " ")} size="small" sx={{ mr: 1 }} />
              {stop.fulfillment_stage && <Chip label={`Order: ${stop.fulfillment_stage}`} size="small"
                color={stop.fulfillment_stage === "delivered" ? "success" : "default"} />}
              {editable && stop.id === next?.id && <Chip label="Next stop" size="small" color="primary" />}
            </Box>
            <NavigationButtons destination={stop} />
            {editable && (
              <Stack direction="row" useFlexGap flexWrap="wrap" gap={1}>
                {(["en_route", "arrived", "delivered", "skipped", "pending"] as const).filter(
                  status => !(stop.fulfillment_stage && status === "delivered")
                ).map(status => (
                  <Button key={status} size="small" variant={status === "delivered" ? "contained" : "outlined"}
                    sx={{ minHeight: 44 }} disabled={saving || stop.status === status || stop.fulfillment_stage === "delivered"}
                    onClick={() => update(stop, status)}>
                    {{ en_route: "En route", arrived: "Arrived", delivered: "Mark delivered", skipped: "Skip stop", pending: "Reset" }[status]}
                  </Button>
                ))}
              </Stack>
            )}
            {stop.fulfillment_method === "farmer_delivery" && <>
              {handoverEditable && stop.fulfillment_stage === "accepted" && <Button variant="contained" disabled={saving}
                sx={{ alignSelf: "flex-start", minHeight: 44 }} onClick={() => handover(stop, "ready")}>Mark produce ready</Button>}
              {handoverEditable && stop.fulfillment_stage === "ready" && <Button variant="contained" disabled={saving}
                sx={{ alignSelf: "flex-start", minHeight: 44 }} onClick={() => setConfirming(stop)}>Confirm delivered to customer</Button>}
              {stop.fulfillment_stage === "delivered" && <Typography variant="body2" color="text.secondary">
                Order fulfillment confirmed. No payment or customer receipt verification is implied.
              </Typography>}
            </>}
          </Stack>
        </Paper>
      ))}
      <Typography variant="body2" color="text.secondary">
        Resolve skipped stops before completing the route. Maps may choose different roads and travel times from this plan.
        Only update progress when safely parked.
      </Typography>
      <Dialog open={Boolean(confirming)} onClose={() => { if (!saving) setConfirming(null); }}
        aria-labelledby="confirm-route-handover">
        <DialogTitle id="confirm-route-handover">Confirm successful delivery?</DialogTitle>
        <DialogContent><DialogContentText>
          Confirm only after physically handing the produce to the customer at {confirming?.address}.
          This marks both the order and route stop delivered, and the customer can see it in Menurithm.
          This does not record payment or customer proof of receipt.
        </DialogContentText></DialogContent>
        <DialogActions>
          <Button sx={{ minHeight: 44 }} disabled={saving} onClick={() => setConfirming(null)}>Not yet</Button>
          <Button sx={{ minHeight: 44 }} variant="contained" disabled={saving || !confirming}
            onClick={() => { if (confirming) void handover(confirming, "delivered"); }}>
            {saving ? "Saving..." : "Yes, confirm delivery"}
          </Button>
        </DialogActions>
      </Dialog>
    </Stack>
  );
}
