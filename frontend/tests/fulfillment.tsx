import { render } from 'preact';
import { CssBaseline, ThemeProvider, Box } from '@mui/material';
import { auth } from '../src/hooks/initializeFirebase';
import { theme } from '../src/branding';
import FulfillmentOrders from '../src/components/FulfillmentOrders';

await auth.authStateReady();
Object.defineProperty(auth, 'currentUser', { get: () => ({ getIdToken: async () => 'fixture-only' }) });
const order = {
  id: 1, request_id: 101, restaurant_name: 'Fixture kitchen', produce_type: 'Tomatoes',
  quantity_needed: 10, unit: 'kg', method: 'customer_pickup', fee: null, currency: 'USD',
  delivery_address: '', pickup_address: null, instructions: null, revision: 0, stage: 'requested',
  window_start: '2026-11-01T10:00:00Z', window_end: '2026-11-01T12:00:00Z',
  customer_contact: 'fixture@example.com', special_requirements: 'Keep shaded.',
};
const originalFetch = window.fetch.bind(window);
window.fetch = async (input, init) => {
  if (!String(input).includes('/api/fulfillment/')) return originalFetch(input, init);
  if (init?.method === 'PUT') {
    const body = JSON.parse(String(init.body));
    if (String(input).endsWith('/quote')) Object.assign(order, body, { revision: order.revision + 1, stage: 'quoted' });
    else Object.assign(order, { stage: body.stage });
    return Response.json(order);
  }
  return Response.json([order]);
};
const root = document.getElementById('fixture');
if (!root) throw new Error('Missing fixture root');
render(<ThemeProvider theme={theme}><CssBaseline /><Box sx={{ p: 2, maxWidth: 1200, mx: 'auto' }}><FulfillmentOrders /></Box></ThemeProvider>, root);
