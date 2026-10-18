import { useEffect, useState } from 'preact/hooks';
import {
  Alert, Box, Button, Card, CardContent, Chip, CircularProgress, MenuItem,
  Stack, TextField, Typography,
} from '@mui/material';
import { auth } from '../hooks/initializeFirebase';
import { BASE_URL } from '../utils';

interface Order {
  id: number; request_id: number; restaurant_name: string; produce_type: string;
  quantity_needed: number; unit: string; method: string; fee: string | null;
  currency: string; pickup_address: string | null; instructions: string | null;
  delivery_address: string; window_start: string; window_end: string;
  revision: number; stage: string;
  customer_contact: string | null; special_requirements: string | null;
}
interface Quote { method: string; fee: string; pickup_address: string; instructions: string }

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
  const [drafts, setDrafts] = useState<Record<number, Quote>>({});
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const refresh = async () => {
    setLoading(true); setError('');
    try {
      const data = await request<Order[]>('farmer/orders');
      setOrders(data);
      setDrafts(Object.fromEntries(data.map(order => [order.id, {
        method: order.method, fee: order.fee || '0.00',
        pickup_address: order.pickup_address || '', instructions: order.instructions || '',
      }])));
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

  return (
    <Stack spacing={3}>
      <Box>
        <Typography variant="overline" color="primary">Farmer workspace</Typography>
        <Typography variant="h4">Orders & handovers</Typography>
        <Typography color="text.secondary">Your produce. Your standards. Offer customer pickup or deliver it yourself.</Typography>
      </Box>
      <Alert severity="info">Quote your delivery fee in USD. The customer must accept the exact terms before you proceed. Agree produce pricing and collect payment separately; the app does not process payments or assign third-party drivers.</Alert>
      {error && <Alert severity="error" role="alert">{error}</Alert>}
      {notice && <Alert severity="success" role="status">{notice}</Alert>}
      <Box><Button variant="outlined" disabled={loading || busy} onClick={refresh}>Refresh orders</Button></Box>
      {loading ? <CircularProgress aria-label="Loading orders" /> : orders.length === 0 && !error ?
        <Card><CardContent><Typography variant="h6">Your next harvest starts here</Typography><Typography color="text.secondary">New customer requests will appear here. Keep your produce inventory current while you wait.</Typography></CardContent></Card> : null}
      {orders.map(order => {
        const draft = drafts[order.id];
        const canQuote = ['requested', 'quoted'].includes(order.stage);
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
                  <Button type="submit" variant="contained" disabled={busy}>Send {order.revision ? 'revised ' : ''}quote for approval</Button>
                </Stack>
              </Box>
            ) : <>
              <Typography fontWeight={650}>{order.method === 'customer_pickup' ? 'Customer pickup' : 'Farmer delivery'} · USD {order.fee} delivery fee · accepted quote {order.revision}</Typography>
              {order.pickup_address && <Typography sx={{ overflowWrap: 'anywhere' }}>Pickup: {order.pickup_address}</Typography>}
              <Typography sx={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{order.instructions}</Typography>
              {order.stage === 'accepted' && <Button sx={{ alignSelf: 'flex-start' }} variant="contained" disabled={busy}
                onClick={() => save(order, 'stage', 'ready')}>Mark produce ready</Button>}
              {order.stage === 'ready' && <Button sx={{ alignSelf: 'flex-start' }} variant="contained" disabled={busy}
                onClick={() => save(order, 'stage', order.method === 'customer_pickup' ? 'collected' : 'delivered')}>
                {order.method === 'customer_pickup' ? 'Confirm customer collected produce' : 'Confirm delivered to customer'}
              </Button>}
            </>}
          </Stack>
        </CardContent></Card>;
      })}
    </Stack>
  );
}
