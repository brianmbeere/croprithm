import { useEffect, useState } from 'preact/hooks';
import {
  Alert, Box, Button, Card, CardContent, Chip, CircularProgress, Dialog,
  DialogActions, DialogContent, DialogTitle, MenuItem,
  Stack, Tab, Tabs, TextField, Typography,
} from '@mui/material';
import { auth } from '../hooks/initializeFirebase';
import { BASE_URL } from '../utils';
import { produceInventoryApi, type ProduceInventory } from '../api/produceApi';
import { WorkspaceHeading, WorkspaceIcon } from './WorkspaceUI';
import { useMeasurementPreferences } from '../context/MeasurementPreferences';
import { weightEquivalent } from '../utils/measurements';
import { fulfillmentWindowLabel as windowLabel, pickupWindowEnd, pickupWindowTimes } from '../utils/pickupWindows';

interface Order {
  pickup_checkout_id?: number | null;
  id: number; request_id: number; restaurant_name: string; produce_type: string;
  quantity_needed: number; unit: string; method: string; fee: string | null;
  currency: string; pickup_address: string | null; instructions: string | null;
  delivery_address: string; window_start: string; window_end: string;
  revision: number; stage: string;
  customer_contact: string | null; special_requirements: string | null;
  produce_inventory_id: number | null; produce_total: string | null; sale_total: string | null;
  stock_reserved: boolean; payment_recorded_at: string | null; seller_id: number | null;
}
type PickupWindow = { id: number; address: string; starts_at: string; ends_at: string; active: boolean };
interface Quote {
  method: string; fee: string; pickup_address: string; instructions: string;
  produce_total: string; produce_inventory_id: number | '';
}

const stageLabels: Record<string, string> = {
  requested: 'Quote needed', quoted: 'Awaiting customer approval', accepted: 'To prepare',
  collected: 'Collected', delivered: 'Delivered', canceled: 'Canceled',
};
const stageLabel = (order: Order) => order.stage === 'ready'
  ? order.method === 'customer_pickup' ? 'Ready for pickup' : 'Ready for delivery'
  : stageLabels[order.stage] ?? order.stage.replace(/_/g, ' ');
const fulfillmentLabel = (order: Order) => order.method === 'customer_pickup' ? 'Customer pickup' : 'Farmer delivery';
const itemLabel = (order: Order) => `${order.quantity_needed} ${order.unit} ${order.produce_type}`;
const orderReference = (order: Order) => order.pickup_checkout_id ? `Pickup #${order.pickup_checkout_id}` : `Request #${order.request_id}`;
const views = [
  { id: 'open', label: 'Open orders', stages: ['accepted', 'ready'], empty: 'No open orders', description: 'Confirmed orders appear here until they are collected or delivered.' },
  { id: 'quotes', label: 'Quotes', stages: ['requested', 'quoted'], empty: 'No quotes or requests', description: 'Custom requests and quotes awaiting approval appear here.' },
  { id: 'history', label: 'History', stages: ['collected', 'delivered', 'canceled'], empty: 'No order history yet', description: 'Collected, delivered, and canceled items appear here.' },
] as const;
type OrderView = (typeof views)[number]['id'];
const inView = (order: Order, view: (typeof views)[number]) => view.stages.some(stage => stage === order.stage);
const nextAction = (order: Order) => {
  if (order.stage === 'requested') return 'Prepare quote';
  if (order.stage === 'accepted') return 'Prepare produce';
  if (order.stage === 'ready') return 'Review handover';
  if (['collected', 'delivered'].includes(order.stage) && order.sale_total != null && !order.payment_recorded_at) return 'Review payment';
  return 'View details';
};

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const user = auth.currentUser;
  if (!user) throw new Error('Please sign in again');
  const response = await fetch(`${BASE_URL}/api/fulfillment/${path}`, {
    ...options, headers: { Authorization: `Bearer ${await user.getIdToken()}`, 'Content-Type': 'application/json' },
  });
  const data = await response.json();
  if (!response.ok) throw new Error(typeof data.detail === 'string' ? data.detail : 'Check your quote fields and try again.');
  return data;
}

export default function FulfillmentOrders() {
  const { system } = useMeasurementPreferences();
  const [orders, setOrders] = useState<Order[]>([]);
  const [inventory, setInventory] = useState<ProduceInventory[]>([]);
  const [drafts, setDrafts] = useState<Record<number, Quote>>({});
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [windows, setWindows] = useState<PickupWindow[]>([]);
  const [windowForm, setWindowForm] = useState({ address: '', starts_at: '', ends_at: '' });
  const [showWindows, setShowWindows] = useState(false);
  const [windowError, setWindowError] = useState('');
  const [windowNotice, setWindowNotice] = useState('');
  const [activeView, setActiveView] = useState<OrderView>('open');
  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const windowPath = 'marketplace/farmer/pickup-windows';

  const manageWindows = async (action: 'load' | 'post' | number) => {
    setBusy(true); setWindowError(''); setWindowNotice('');
    setShowWindows(true);
    try {
      if (action === 'post') {
        const address = windowForm.address.trim();
        if (!address) throw new Error('Enter a pickup address.');
        const times = pickupWindowTimes(windowForm.starts_at, windowForm.ends_at);
        const posted = await request<PickupWindow>(windowPath, {
          method: 'POST', body: JSON.stringify({ address, ...times }),
        });
        setWindows(previous => [...previous, posted]);
        setWindowForm({ address, starts_at: '', ends_at: '' });
        setWindowNotice('Pickup window posted.');
      } else if (typeof action === 'number') {
        const paused = await request<PickupWindow>(`${windowPath}/${action}/pause`, { method: 'POST' });
        setWindows(previous => previous.map(window => window.id === paused.id ? paused : window));
        setWindowNotice('Pickup window paused. Existing orders are unchanged.');
      } else {
        setWindows(await request<PickupWindow[]>(windowPath));
      }
    } catch (err) {
      setWindowError(err instanceof Error ? err.message : 'Unable to update pickup windows.');
    } finally { setBusy(false); }
  };
  const refresh = async () => {
    setLoading(true); setError('');
    try {
      const [data, stock] = await Promise.all([
        request<Order[]>('farmer/orders'), produceInventoryApi.getSellerInventory(),
      ]);
      setOrders(data);
      setInventory(stock);
      setDrafts(Object.fromEntries(data.map(order => {
        const listing = stock.find(item => item.id === order.produce_inventory_id);
        return [order.id, {
        method: order.method, fee: order.fee || '0.00',
        pickup_address: order.pickup_address || '', instructions: order.instructions || '',
        produce_inventory_id: order.produce_inventory_id ?? '',
        produce_total: order.produce_total ?? (listing
          ? (listing.price_per_unit * order.quantity_needed).toFixed(2) : ''),
        }];
      })));
    } catch (err) { setError(err instanceof Error ? err.message : 'Could not load orders'); }
    finally { setLoading(false); }
  };
  useEffect(() => { void refresh(); }, []);
  const save = async (order: Order, action: 'quote' | 'stage', stage?: string) => {
    setBusy(true); setError(''); setNotice('');
    try {
      const updated = await request<Order>(`farmer/orders/${order.id}/${action}`, {
        method: 'PUT', body: JSON.stringify(action === 'quote' ? {
          ...drafts[order.id], currency: 'USD', expected_revision: order.revision,
          fee: drafts[order.id].method === 'customer_pickup' ? '0.00' : drafts[order.id].fee,
        } : { stage }),
      });
      setOrders(previous => previous.map(item => item.id === updated.id ? updated : item));
      await refresh();
      setNotice(action === 'quote' ? 'Quote sent. Wait for the customer to accept before preparing produce.' : 'Handover progress saved.');
    } catch (err) { setError(err instanceof Error ? err.message : 'Unable to save. Refresh before retrying.'); }
    finally { setBusy(false); }
  };
  const change = (id: number, key: keyof Quote, value: string) =>
    setDrafts(previous => ({ ...previous, [id]: { ...previous[id], [key]: value } }));

  const closeOrder = async (order: Order, action: 'cancel' | 'record-payment') => {
    if (!window.confirm(action === 'cancel'
      ? order.pickup_checkout_id ? 'Cancel all items in this pickup order?' : 'Cancel this order and release any reserved stock?'
      : `Confirm you received USD ${order.sale_total} directly from the customer?`)) return;
    setBusy(true); setError(''); setNotice('');
    try {
      if (order.pickup_checkout_id && action === 'cancel') {
        await request(`marketplace/farmer/pickup-checkouts/${order.pickup_checkout_id}/cancel`, { method: 'POST' });
        setOrders(previous => previous.map(item => item.pickup_checkout_id === order.pickup_checkout_id
          ? { ...item, stage: 'canceled', stock_reserved: false } : item));
      } else {
        const updated = await request<Order>(`farmer/orders/${order.id}/${action}`, { method: 'POST' });
        setOrders(previous => previous.map(item => item.id === updated.id ? updated : item));
      }
      setNotice(action === 'cancel' ? 'Order canceled. Any reserved stock was released.' : 'Direct payment recorded.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to update the order.');
    } finally { setBusy(false); }
  };

  const view = views.find(candidate => candidate.id === activeView) ?? views[0];
  const viewOrders = orders.filter(order => inView(order, view));
  const visible = viewOrders
    .filter(order => {
      const searchable = `${order.restaurant_name} ${order.produce_type} ${orderReference(order)} request #${order.request_id}`.toLowerCase();
      return query.trim().toLowerCase().split(/\s+/).every(term => searchable.includes(term));
    });
  if (activeView === 'open') visible.sort((a, b) => Date.parse(a.window_start) - Date.parse(b.window_start) || a.id - b.id);
  const selectedOrder = orders.find(order => order.id === selectedId);
  const now = Date.now();
  const bookable = windows.filter(window => window.active && Date.parse(window.starts_at) > now)
    .sort((a, b) => Date.parse(a.starts_at) - Date.parse(b.starts_at));
  const otherWindows = windows.filter(window => !bookable.includes(window))
    .sort((a, b) => Date.parse(b.starts_at) - Date.parse(a.starts_at));
  const windowRow = (window: PickupWindow) => <Stack key={window.id} direction={{ xs: 'column', sm: 'row' }}
    gap={1} alignItems={{ xs: 'flex-start', sm: 'center' }} justifyContent="space-between"
    sx={{ py: 1.25, borderTop: 1, borderColor: 'divider' }}>
    <Box sx={{ overflowWrap: 'anywhere' }}>
      <Typography fontWeight={650}>{windowLabel(window.starts_at, window.ends_at)}</Typography>
      <Typography variant="body2" color="text.secondary">{window.address}</Typography>
    </Box>
    {bookable.includes(window) ? <Button disabled={busy} onClick={() => void manageWindows(window.id)}>Pause bookings</Button>
      : <Chip size="small" label={!window.active ? 'Paused' : Date.parse(window.ends_at) <= now ? 'Ended' : 'In progress'} />}
  </Stack>;
  const closeDetails = () => {
    if (busy) return;
    setSelectedId(null);
    if (!visible.some(order => order.id === selectedId)) {
      requestAnimationFrame(() => document.getElementById(`orders-tab-${view.id}`)?.focus());
    }
  };
  const openDetails = (order: Order) => {
    setError('');
    setNotice('');
    setSelectedId(order.id);
  };

  return (
    <Stack spacing={3}>
      <WorkspaceHeading title="Orders"
        description="See what to pack, who it’s for, and when it needs to be ready."
        actions={<Button variant="contained" startIcon={<WorkspaceIcon name="calendar" />} disabled={busy}
          aria-expanded={showWindows} aria-controls={showWindows ? "pickup-window-panel" : undefined}
          onClick={() => showWindows ? setShowWindows(false) : void manageWindows('load')}>Manage pickup windows</Button>} />
      {!selectedOrder && error && <Alert severity="error" role="alert">{error}</Alert>}
      {!selectedOrder && notice && <Alert severity="success" role="status">{notice}</Alert>}
      {showWindows && <Card id="pickup-window-panel" variant="outlined"><CardContent><Stack spacing={2}>
        <Typography component="h2" variant="h6">Pickup windows</Typography>
        <Typography variant="body2">Set when restaurants can collect orders. Pausing a window stops new bookings without changing existing orders.</Typography>
        {windowError && <Alert severity="error">{windowError}</Alert>}
        {windowNotice && <Alert severity="success" role="status">{windowNotice}</Alert>}
        <Box>
          <Typography component="h3" variant="subtitle1" fontWeight={700}>Open for booking ({bookable.length})</Typography>
          {bookable.length ? bookable.map(windowRow) : <Typography variant="body2" color="text.secondary">
            {busy ? 'Updating pickup windows…' : 'No upcoming windows open for booking.'}
          </Typography>}
        </Box>
        <Stack component="form" spacing={2} onSubmit={event => { event.preventDefault(); void manageWindows('post'); }}>
          <Typography component="h3" variant="subtitle1" fontWeight={700}>Post a new window</Typography>
          <TextField required disabled={busy} label="Pickup address" value={windowForm.address}
            slotProps={{ htmlInput: { maxLength: 500 } }}
            onChange={event => {
              const value = (event.target as HTMLInputElement).value;
              setWindowForm(previous => ({ ...previous, address: value }));
            }} />
          <Stack direction={{ xs: 'column', sm: 'row' }} gap={2}>
          {(['starts_at', 'ends_at'] as const).map(field => <TextField key={field} required disabled={busy} fullWidth type="datetime-local"
            label={field === 'starts_at' ? 'Starts (local time)' : 'Ends (local time)'} value={windowForm[field]}
            slotProps={{ inputLabel: { shrink: true } }}
            onChange={event => {
              const value = (event.target as HTMLInputElement).value;
              setWindowForm(previous => ({ ...previous, [field]: value }));
            }} />)}
          </Stack>
          <Stack direction="row" gap={1} useFlexGap flexWrap="wrap" alignItems="center">
            <Typography variant="body2" color="text.secondary">Set end time:</Typography>
            {[30, 60, 120].map(minutes => <Button key={minutes} size="small" variant="outlined"
              disabled={busy || !windowForm.starts_at}
              onClick={() => setWindowForm(previous => ({ ...previous, ends_at: pickupWindowEnd(previous.starts_at, minutes) }))}>
              {minutes} min after start
            </Button>)}
          </Stack>
          <Button type="submit" variant="contained" disabled={busy} sx={{ alignSelf: 'flex-start' }}>Post pickup window</Button>
        </Stack>
        {!!otherWindows.length && <Box component="details">
          <Box component="summary" sx={{ cursor: 'pointer', py: 1, fontWeight: 700 }}>Other windows ({otherWindows.length})</Box>
          {otherWindows.map(windowRow)}
        </Box>}
      </Stack></CardContent></Card>}
      <Stack spacing={2} sx={{ minWidth: 0 }}>
        <Tabs value={activeView} onChange={(_, value: OrderView) => setActiveView(value)}
          aria-label="Order views" variant="scrollable" sx={{ borderBottom: 1, borderColor: 'divider' }}>
          {views.map(candidate => <Tab key={candidate.id} value={candidate.id} id={`orders-tab-${candidate.id}`}
            aria-controls={`orders-panel-${candidate.id}`}
            label={`${candidate.label}${loading && !orders.length ? '' : ` (${orders.filter(order => inView(order, candidate)).length})`}`}
            sx={{ px: { xs: 1, sm: 2 }, minWidth: 0, textTransform: 'none' }} />)}
        </Tabs>
        <Stack role="tabpanel" id={`orders-panel-${view.id}`} aria-labelledby={`orders-tab-${view.id}`} spacing={2}>
      <Stack direction={{ xs: "column", sm: "row" }} gap={1.5} justifyContent="space-between">
        <TextField fullWidth size="small" label="Search orders" placeholder="Restaurant, produce, or order number"
          value={query} onChange={event => setQuery((event.target as HTMLInputElement).value)} />
        <Button variant="outlined" startIcon={<WorkspaceIcon name="refresh" />} disabled={loading || busy} onClick={refresh}
          sx={{ flexShrink: 0 }}>Refresh orders</Button>
      </Stack>
      {!!viewOrders.length && <Typography role="status" variant="body2" color="text.secondary">
        Showing {visible.length} of {viewOrders.length} order items
      </Typography>}
      {loading && !orders.length ? <CircularProgress aria-label="Loading orders" /> : visible.length === 0 && !error ?
        <Card variant="outlined"><CardContent>
          <Typography variant="h6">{query.trim() ? 'No orders match' : view.empty}</Typography>
          <Typography color="text.secondary">{query.trim() ? 'Try another restaurant, produce name, or order number.' : view.description}</Typography>
          {query.trim() && <Button onClick={() => setQuery('')}>Clear search</Button>}
        </CardContent></Card> : null}
      {visible.length > 0 && <Card variant="outlined">
        <Box component="ul" aria-label="Order items" sx={{ listStyle: 'none', m: 0, p: 0 }}>
          {visible.map(order => <Box component="li" key={order.id} sx={{
            display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'minmax(0, 1.15fr) minmax(0, 1fr) minmax(160px, auto)' },
            gap: 1.5, alignItems: 'center', p: 2, overflowWrap: 'anywhere', '& + li': { borderTop: 1, borderColor: 'divider' },
          }}>
            <Box>
              <Typography component="h2" fontWeight={750}>{itemLabel(order)}</Typography>
              <Typography variant="caption" color="text.secondary">{weightEquivalent(order.quantity_needed, order.unit, system)}</Typography>
              <Typography variant="body2" color="text.secondary">{order.restaurant_name} · {orderReference(order)}</Typography>
            </Box>
            <Box>
              <Typography variant="body2" fontWeight={650}>{fulfillmentLabel(order)}</Typography>
              <Typography variant="body2" color="text.secondary">{windowLabel(order.window_start, order.window_end)}</Typography>
            </Box>
            <Stack direction={{ xs: 'row', md: 'column', lg: 'row' }} gap={1} alignItems="center"
              justifyContent={{ xs: 'space-between', md: 'flex-end' }} flexWrap="wrap">
              <Chip size="small" label={stageLabel(order)} color={order.stage === 'accepted' || order.stage === 'ready' ? 'success' : 'default'} />
              <Button variant="outlined" size="small" aria-haspopup="dialog"
                aria-label={`${nextAction(order)}: ${itemLabel(order)}, ${orderReference(order)}`}
                onClick={() => openDetails(order)}>{nextAction(order)}</Button>
            </Stack>
          </Box>)}
        </Box>
      </Card>}
        </Stack>
      </Stack>
      {(selectedOrder ? [selectedOrder] : []).map(order => {
        const draft = drafts[order.id];
        const canQuote = ['requested', 'quoted'].includes(order.stage);
        const completed = ['collected', 'delivered'].includes(order.stage);
        const matchingStock = inventory.filter(item => item.is_available && item.quantity_available >= order.quantity_needed
          && item.produce_type.trim().toLowerCase() === order.produce_type.trim().toLowerCase()
          && item.unit.trim().toLowerCase() === order.unit.trim().toLowerCase());
        return <Dialog key={order.id} open onClose={closeDetails} fullWidth maxWidth="md" scroll="paper" aria-labelledby="order-details-title">
          <DialogTitle id="order-details-title">
            {itemLabel(order)}
            <Typography component="span" display="block" variant="body2" color="text.secondary">
              {weightEquivalent(order.quantity_needed, order.unit, system)}
            </Typography>
          </DialogTitle>
          <DialogContent dividers>
          <Stack spacing={2}>
            {error && <Alert severity="error" role="alert">{error}</Alert>}
            {notice && <Alert severity="success" role="status">{notice}</Alert>}
            <Stack direction="row" justifyContent="space-between" gap={1} flexWrap="wrap">
              <Typography sx={{ overflowWrap: 'anywhere' }}>{order.restaurant_name} · {orderReference(order)}</Typography>
              <Chip label={stageLabel(order)} color={order.stage === 'accepted' || order.stage === 'ready' ? 'success' : 'default'} />
            </Stack>
            <Typography variant="body2">{order.pickup_checkout_id ? 'Pickup window' : 'Requested window'}: {windowLabel(order.window_start, order.window_end)}</Typography>
            {order.customer_contact && <Typography sx={{ overflowWrap: 'anywhere' }}>Customer contact: {order.customer_contact}</Typography>}
            {order.special_requirements && <Alert severity="info" sx={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>Customer requirements: {order.special_requirements}</Alert>}
            {order.delivery_address && <Typography sx={{ overflowWrap: 'anywhere' }}>Delivery address: {order.delivery_address}</Typography>}
            {canQuote && draft ? (
              <Box component="form" onSubmit={event => { event.preventDefault(); void save(order, 'quote'); }}
                sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: 2 }}>
                {!order.produce_inventory_id && <TextField select required label="Stock listing"
                  value={draft.produce_inventory_id}
                  helperText={matchingStock.length ? 'Select the stock that will fulfill this request.' : 'Add enough matching stock in Inventory first.'}
                  onChange={event => {
                    const listing = matchingStock.find(item => item.id === Number((event.target as HTMLInputElement).value));
                    if (listing) setDrafts(previous => ({ ...previous, [order.id]: {
                      ...previous[order.id], produce_inventory_id: listing.id,
                      produce_total: (listing.price_per_unit * order.quantity_needed).toFixed(2),
                    } }));
                  }}>
                  {matchingStock.map(item => <MenuItem key={item.id} value={item.id}>
                    {item.produce_type} {item.variety || ''} · {item.location} · {item.quantity_available} {item.unit}
                  </MenuItem>)}
                </TextField>}
                <TextField required label="Produce subtotal (USD)" type="number" value={draft.produce_total}
                  slotProps={{ htmlInput: { min: 0, step: '0.01', max: '99999999.99' } }}
                  onChange={event => change(order.id, 'produce_total', (event.target as HTMLInputElement).value)} />
                <TextField select label="Fulfillment you can offer" value={draft.method}
                  onChange={event => change(order.id, 'method', (event.target as HTMLInputElement).value)}>
                  <MenuItem value="customer_pickup">Customer pickup</MenuItem>
                  <MenuItem value="farmer_delivery" disabled={!order.delivery_address}>Farmer delivery</MenuItem>
                </TextField>
                {draft.method === 'farmer_delivery' ?
                  <TextField required label="Delivery fee (USD)" type="number" value={draft.fee}
                    slotProps={{ htmlInput: { min: 0, step: '0.01', max: '99999999.99' } }}
                    onChange={event => change(order.id, 'fee', (event.target as HTMLInputElement).value)} /> :
                  <TextField required label="Pickup address" value={draft.pickup_address}
                    onChange={event => change(order.id, 'pickup_address', (event.target as HTMLInputElement).value)} />}
                <TextField required multiline minRows={2} label="Handover / produce handling instructions"
                  value={draft.instructions} onChange={event => change(order.id, 'instructions', (event.target as HTMLInputElement).value)} />
                <Stack justifyContent="end" alignItems="flex-start" spacing={1}>
                  {draft.method === 'customer_pickup' && <Typography variant="body2">Pickup delivery fee: USD 0.00</Typography>}
                  <Button type="submit" variant="contained" disabled={busy || !draft.produce_inventory_id}>Send {order.revision ? 'revised ' : ''}quote for approval</Button>
                </Stack>
              </Box>
            ) : <>
              {order.stage !== 'canceled' && <Typography fontWeight={650}>{fulfillmentLabel(order)}
                {order.pickup_checkout_id ? ' · Pay at pickup' : ` · USD ${order.fee} delivery fee · accepted quote ${order.revision}`}</Typography>}
              {order.pickup_address && <Typography sx={{ overflowWrap: 'anywhere' }}>Pickup: {order.pickup_address}</Typography>}
              <Typography sx={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{order.instructions}</Typography>
              {order.stage === 'accepted' && <Button sx={{ alignSelf: 'flex-start' }} variant="contained" disabled={busy}
                onClick={() => save(order, 'stage', 'ready')}>Mark produce ready</Button>}
              {order.stage === 'ready' && <Button sx={{ alignSelf: 'flex-start' }} variant="contained" disabled={busy}
                onClick={() => save(order, 'stage', order.method === 'customer_pickup' ? 'collected' : 'delivered')}>
                {order.method === 'customer_pickup' ? 'Confirm customer collected produce' : 'Confirm delivered to customer'}
              </Button>}
            </>}
            {order.sale_total != null && <Typography>Produce: USD {order.produce_total} · Delivery: USD {order.fee} · Total: USD {order.sale_total}</Typography>}
            {order.stock_reserved && <Chip sx={{ alignSelf: 'flex-start' }} label="Stock committed" color="success" />}
            {order.payment_recorded_at && <Alert severity="success">Direct payment recorded {new Date(order.payment_recorded_at).toLocaleString()}.</Alert>}
            {completed && order.sale_total != null && !order.payment_recorded_at && <Button sx={{ alignSelf: 'flex-start' }}
              variant="contained" disabled={busy} onClick={() => void closeOrder(order, 'record-payment')}>
                {order.pickup_checkout_id ? 'Record payment for this item' : 'Record direct payment'}
              </Button>}
            {order.seller_id && !completed && order.stage !== 'canceled'
              && (!order.pickup_checkout_id || orders.every(item => item.pickup_checkout_id !== order.pickup_checkout_id || ['accepted', 'ready'].includes(item.stage)))
              && <Button sx={{ alignSelf: 'flex-start' }} color="error" disabled={busy} onClick={() => void closeOrder(order, 'cancel')}>
                {order.pickup_checkout_id ? 'Cancel entire pickup order' : 'Cancel order'}
              </Button>}
          </Stack>
          </DialogContent>
          <DialogActions><Button disabled={busy} onClick={closeDetails}>Close</Button></DialogActions>
        </Dialog>;
      })}
    </Stack>
  );
}
