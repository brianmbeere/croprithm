import { useEffect, useState } from 'preact/hooks';
import {
  Alert, Box, Button, Card, CardContent, Chip, CircularProgress, MenuItem,
  Stack, TextField, Typography,
} from '@mui/material';
import { auth } from '../hooks/initializeFirebase';
import { BASE_URL } from '../utils';
import { produceInventoryApi, type ProduceInventory } from '../api/produceApi';

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
  const windowPath = 'marketplace/farmer/pickup-windows';

  const manageWindows = async (action: 'load' | 'post' | number) => {
    setBusy(true); setError(''); setNotice('');
    try {
      if (action === 'post') {
        await request<PickupWindow>(windowPath, { method: 'POST', body: JSON.stringify({
          address: windowForm.address, starts_at: new Date(windowForm.starts_at).toISOString(),
          ends_at: new Date(windowForm.ends_at).toISOString(),
        }) });
        setWindowForm({ address: '', starts_at: '', ends_at: '' });
      } else if (typeof action === 'number') {
        await request<PickupWindow>(`${windowPath}/${action}/pause`, { method: 'POST' });
      }
      setWindows(await request<PickupWindow[]>(windowPath));
      setShowWindows(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to update pickup windows.');
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
      await request<Order>(`farmer/orders/${order.id}/${action}`, {
        method: 'PUT', body: JSON.stringify(action === 'quote' ? {
          ...drafts[order.id], currency: 'USD', expected_revision: order.revision,
          fee: drafts[order.id].method === 'customer_pickup' ? '0.00' : drafts[order.id].fee,
        } : { stage }),
      });
      await refresh();
      setNotice(action === 'quote' ? 'Quote sent. Wait for the customer to accept before preparing delivery.' : 'Handover progress saved.');
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

  return (
    <Stack spacing={3}>
      <Box>
        <Typography variant="overline" color="primary">Farmer workspace</Typography>
        <Typography variant="h4">Orders & handovers</Typography>
        <Typography color="text.secondary">Your produce. Your standards. Offer customer pickup or deliver it yourself.</Typography>
      </Box>
      <Alert severity="info">Quote produce and delivery in USD. Stock is reserved when the customer accepts. Collect payment directly, then record it here after handover. Croprithm does not process payments.</Alert>
      {error && <Alert severity="error" role="alert">{error}</Alert>}
      {notice && <Alert severity="success" role="status">{notice}</Alert>}
      <Box><Button variant="outlined" disabled={busy} onClick={() => void manageWindows('load')}>Manage pickup windows</Button></Box>
      {showWindows && <Card variant="outlined"><CardContent><Stack spacing={2}>
        <Typography variant="h6">Pickup windows</Typography>
        <Typography variant="body2">Posting a window lets restaurants order your published, in-stock listings at their posted prices and pay you at pickup. A window can serve multiple orders. Pausing it stops new orders without changing existing ones.</Typography>
        <Stack component="form" spacing={2} onSubmit={event => { event.preventDefault(); void manageWindows('post'); }}>
          <TextField required label="Pickup address" value={windowForm.address}
            slotProps={{ htmlInput: { maxLength: 500 } }}
            onChange={event => {
              const value = (event.target as HTMLInputElement).value;
              setWindowForm(previous => ({ ...previous, address: value }));
            }} />
          {(['starts_at', 'ends_at'] as const).map(field => <TextField key={field} required type="datetime-local"
            label={field === 'starts_at' ? 'Starts (local time)' : 'Ends (local time)'} value={windowForm[field]}
            slotProps={{ inputLabel: { shrink: true } }}
            onChange={event => {
              const value = (event.target as HTMLInputElement).value;
              setWindowForm(previous => ({ ...previous, [field]: value }));
            }} />)}
          <Button type="submit" variant="contained" disabled={busy}>Post pickup window</Button>
        </Stack>
        {windows.map(window => <Stack key={window.id} direction={{ xs: 'column', sm: 'row' }} gap={1} alignItems={{ sm: 'center' }}>
          <Typography>{new Date(window.starts_at).toLocaleString()} to {new Date(window.ends_at).toLocaleString()} / {window.address}</Typography>
          {window.active ? <Button disabled={busy} onClick={() => void manageWindows(window.id)}>Pause</Button> : <Chip label="Paused" />}
        </Stack>)}
      </Stack></CardContent></Card>}
      <Box><Button variant="outlined" disabled={loading || busy} onClick={refresh}>Refresh orders</Button></Box>
      {loading ? <CircularProgress aria-label="Loading orders" /> : orders.length === 0 && !error ?
        <Card><CardContent><Typography variant="h6">Your next harvest starts here</Typography><Typography color="text.secondary">New customer requests will appear here. Keep your produce inventory current while you wait.</Typography></CardContent></Card> : null}
      {orders.map(order => {
        const draft = drafts[order.id];
        const canQuote = ['requested', 'quoted'].includes(order.stage);
        const completed = ['collected', 'delivered'].includes(order.stage);
        const matchingStock = inventory.filter(item => item.is_available && item.quantity_available >= order.quantity_needed
          && item.produce_type.trim().toLowerCase() === order.produce_type.trim().toLowerCase()
          && item.unit.trim().toLowerCase() === order.unit.trim().toLowerCase());
        return <Card key={order.id}><CardContent>
          <Stack spacing={2}>
            <Stack direction="row" justifyContent="space-between" gap={1} flexWrap="wrap">
              <Box><Typography variant="h6">{order.quantity_needed} {order.unit} {order.produce_type}</Typography>
                <Typography color="text.secondary">{order.restaurant_name} · Request #{order.request_id}</Typography></Box>
              <Chip label={order.stage === 'quoted' ? 'Awaiting customer approval' : order.stage.replace(/_/g, ' ')} color={order.stage === 'accepted' ? 'success' : 'default'} />
            </Stack>
            <Typography variant="body2">Requested window: {new Date(order.window_start).toLocaleString()} – {new Date(order.window_end).toLocaleString()}</Typography>
            {order.customer_contact && <Typography sx={{ overflowWrap: 'anywhere' }}>Customer contact: {order.customer_contact}</Typography>}
            {order.special_requirements && <Alert severity="info" sx={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>Customer requirements: {order.special_requirements}</Alert>}
            {order.delivery_address && <Typography sx={{ overflowWrap: 'anywhere' }}>Delivery address: {order.delivery_address}</Typography>}
            {canQuote && draft ? (
              <Box component="form" onSubmit={event => { event.preventDefault(); void save(order, 'quote'); }}
                sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: 2 }}>
                {!order.produce_inventory_id && <TextField select required label="Stock listing"
                  value={draft.produce_inventory_id}
                  helperText={matchingStock.length ? 'Select the stock that will fulfill this request.' : 'Add enough matching stock in My Inventory first.'}
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
              {order.stage !== 'canceled' && <Typography fontWeight={650}>{order.method === 'customer_pickup' ? 'Customer pickup' : 'Farmer delivery'} · USD {order.fee} delivery fee · accepted quote {order.revision}</Typography>}
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
            {order.pickup_checkout_id && <Chip sx={{ alignSelf: 'flex-start' }} label={`Pickup #${order.pickup_checkout_id} · Pay at pickup`} />}
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
        </CardContent></Card>;
      })}
    </Stack>
  );
}
