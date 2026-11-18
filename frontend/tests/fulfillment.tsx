import { render } from 'preact';
import { useState } from 'preact/hooks';
import { CssBaseline, ThemeProvider, Box } from '@mui/material';
import { auth } from '../src/hooks/initializeFirebase';
import { theme } from '../src/branding';
import FulfillmentOrders from '../src/components/FulfillmentOrders';
import ProduceInventoryManager from '../src/components/ProduceInventoryManager';
import WorkspaceLayout from '../src/components/WorkspaceLayout';
import Settings from '../src/components/Settings';
import { MeasurementPreferences } from '../src/context/MeasurementPreferences';
import { WorkspaceHeading } from '../src/components/WorkspaceUI';
import type { WorkspacePage } from '../src/components/workspaceSections';
import RoutePlanner from '../src/pages/RoutePlanner';

await auth.authStateReady();
Object.defineProperty(auth, 'currentUser', { get: () => ({ getIdToken: async () => 'fixture-only' }) });
const order = {
  id: 1, request_id: 101, restaurant_name: 'Fixture kitchen', produce_type: 'Tomatoes',
  quantity_needed: 10, unit: 'kg', method: 'customer_pickup', fee: null, currency: 'USD',
  delivery_address: '', pickup_address: null, instructions: null, revision: 0, stage: 'requested',
  window_start: '2026-11-01T10:00:00Z', window_end: '2026-11-01T12:00:00Z',
  customer_contact: 'fixture@example.com', special_requirements: 'Keep shaded.',
  produce_inventory_id: null, produce_total: null, sale_total: null, seller_id: null,
};
const originalFetch = window.fetch.bind(window);
const params = new URLSearchParams(location.search);
const pickup = {
  ...order, id: 2, request_id: 102, pickup_checkout_id: 42, restaurant_name: 'Market Bistro',
  produce_type: 'Spinach', quantity_needed: 3, stage: 'accepted', seller_id: 7,
  produce_total: '12.00', fee: '0.00', sale_total: '12.00', stock_reserved: true,
  pickup_address: '100 Farm Road', payment_recorded_at: null as string | null,
};
const fixtureOrders = params.has('order-queue') ? [order, pickup, {
  ...order, id: 3, request_id: 103, restaurant_name: 'Sunday Kitchen', produce_type: 'Carrots',
  stage: 'ready', method: 'farmer_delivery', delivery_address: '21 Main Street',
  window_start: '2026-11-02T10:00:00Z', window_end: '2026-11-02T12:00:00Z',
}] : [order];
const pickupWindows: { id: number; address: string; starts_at: string; ends_at: string; active: boolean }[] = [];
const listing = {
  id: 1, produce_type: 'Tomatoes', quantity_available: 20, quantity_committed: 0,
  unit: 'kg', price_per_unit: 3, location: 'Fixture farm', is_available: true, organic: false,
  illustration_id: null,
};
window.fetch = async (input, init) => {
  if (String(input).endsWith('/api/produce/illustrations')) return Response.json([
    { id: 'tomato', label: 'Tomato', symbol: '🍅', background: '#fae5dc' },
    { id: 'seedling', label: 'Seedling', symbol: '🌱', background: '#e7eddc' },
  ]);
  if (String(input).endsWith('/api/produce/inventory/1') && init?.method === 'PUT') {
    const body = JSON.parse(String(init.body));
    if ('quantity_available' in body) {
      if (params.has('stock-conflict') && listing.quantity_available === 20) {
        listing.quantity_available = 18;
        listing.quantity_committed = 2;
      }
      if (body.expected_quantity_available !== listing.quantity_available) {
        return Response.json({ detail: 'Stock changed. Reload stock and retry.' }, { status: 409 });
      }
    }
    Object.assign(listing, body);
    return Response.json(listing);
  }
  if (String(input).endsWith('/api/produce/inventory')) return Response.json([listing]);
  if (String(input).endsWith('/api/fulfillment/marketplace/farmer/pickup-windows')) {
    if (init?.method !== 'POST') return Response.json(pickupWindows);
    const body = JSON.parse(String(init.body));
    const posted = { id: pickupWindows.length + 1, address: body.address,
      starts_at: body.starts_at, ends_at: body.ends_at, active: true };
    pickupWindows.push(posted);
    return Response.json(posted, { status: 201 });
  }
  const pause = String(input).match(/\/pickup-windows\/(\d+)\/pause$/);
  if (pause && init?.method === 'POST') {
    const target = pickupWindows.find(window => window.id === Number(pause[1]));
    if (!target) return Response.json({ detail: 'Window not found' }, { status: 404 });
    target.active = false;
    return Response.json(target);
  }
  if (params.has('workspace') && String(input).startsWith('https://example.com/')) {
    if (!String(input).includes('/api/fulfillment/')) return Response.json([]);
  }
  if (!String(input).includes('/api/fulfillment/')) return originalFetch(input, init);
  const match = String(input).match(/\/farmer\/orders\/(\d+)\/(quote|stage|record-payment)$/);
  const target = fixtureOrders.find(item => item.id === Number(match?.[1]));
  if (target && init?.method === 'PUT') {
    const body = JSON.parse(String(init.body));
    if (match?.[2] === 'quote') Object.assign(target, body, { revision: target.revision + 1, stage: 'quoted' });
    else Object.assign(target, { stage: body.stage, ...(body.stage === 'collected' ? { stock_reserved: false } : {}) });
    return Response.json(target);
  }
  if (target === pickup && match?.[2] === 'record-payment' && init?.method === 'POST') {
    pickup.payment_recorded_at = '2026-11-01T12:00:00Z';
    return Response.json(pickup);
  }
  return Response.json(fixtureOrders);
};
const role = params.has('restaurant') ? 'restaurant' : 'farmer';
const fixtureAccount = { uid: 'fixture-account', email: 'account@example.com', emailVerified: true, providerData: [], metadata: {} };
let fixtureProfile = { organization: 'Market Farm', headquarters: '100 Farm Road', businessPhone: '', industry: 'Produce' };
let settingsLoadFails = params.has('settings-load-error');
let settingsSaveFails = params.has('settings-save-error');
const fixtureSettingsStore = {
  async load() {
    if (settingsLoadFails) {
      settingsLoadFails = false;
      throw new Error('Fixture load failure');
    }
    return fixtureProfile;
  },
  async save(_uid: string, changes: Partial<typeof fixtureProfile>) {
    if (settingsSaveFails) {
      settingsSaveFails = false;
      throw new Error('Fixture save failure');
    }
    fixtureProfile = { ...fixtureProfile, ...changes };
  },
};

function WorkspaceFixture() {
  const [page, setPage] = useState<WorkspacePage>('overview');
  return <MeasurementPreferences uid={fixtureAccount.uid}><WorkspaceLayout role={role} page={page} onPageChange={setPage} onLogout={() => {}}>
    {page === 'inventory' ? <ProduceInventoryManager /> : page === 'orders' ? <FulfillmentOrders onPlanDeliveries={() => setPage('plan')} />
      : page === 'plan' ? <RoutePlanner onOpenOrders={role === 'farmer' ? () => setPage('orders') : undefined} />
      : page === 'settings' ? <Settings user={fixtureAccount} role={role} store={fixtureSettingsStore} onPageChange={setPage} />
      : page === 'market' ? <WorkspaceHeading title="Source produce" description="Restaurant workspace fixture." />
      : <WorkspaceHeading title="Workspace fixture" description="Test the workspace navigation." />}
  </WorkspaceLayout></MeasurementPreferences>;
}
const root = document.getElementById('fixture');
if (!root) throw new Error('Missing fixture root');
render(<ThemeProvider theme={theme}><CssBaseline />{params.has('workspace') ? <WorkspaceFixture />
  : <Box sx={{ p: 2, maxWidth: 1200, mx: 'auto' }}>{params.has('inventory') ? <ProduceInventoryManager /> : <FulfillmentOrders />}</Box>}
</ThemeProvider>, root);
