import { useState, useEffect } from "preact/hooks";
import {
  Box,
  Typography,
  Button,
  Card,
  CardContent,
  Grid,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  FormControl,
  FormLabel,
  Switch,
  Alert,
  CircularProgress,
  Chip,
  IconButton,
  Menu,
  MenuItem,
  Stack
} from "@mui/material";
import { WorkspaceHeading, WorkspaceIcon } from "./WorkspaceUI";
import { produceInventoryApi, type ProduceIllustration, type ProduceInventory } from "../api/produceApi";
import { useMeasurementPreferences } from "../context/MeasurementPreferences";
import { defaultWeightUnit, weightEquivalent } from "../utils/measurements";

const money = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });
const totalStock = (item: ProduceInventory) => Number((item.quantity_available + (item.quantity_committed ?? 0)).toPrecision(12));
const stockColumns = "minmax(160px, 2fr) repeat(3, minmax(75px, 1fr)) minmax(108px, 1fr) minmax(148px, auto)";

const ProduceInventoryManager = () => {
  const { system } = useMeasurementPreferences();
  const [inventory, setInventory] = useState<ProduceInventory[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("all");
  const [error, setError] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<ProduceInventory | null>(null);
  const [formData, setFormData] = useState({
    produce_type: '',
    variety: '',
    quantity_available: 0,
    unit: defaultWeightUnit(system),
    price_per_unit: 0,
    harvest_date: '',
    expiry_date: '',
    location: '',
    latitude: 0,
    longitude: 0,
    organic: false,
    description: '',
    illustration_id: '',
    is_available: true
  });
  const [submitting, setSubmitting] = useState(false);
  const [illustrations, setIllustrations] = useState<ProduceIllustration[]>([]);
  const [illustrationError, setIllustrationError] = useState('');
  const [loadingIllustrations, setLoadingIllustrations] = useState(false);
  const [menuAnchor, setMenuAnchor] = useState<HTMLElement | null>(null);
  const [selectedItem, setSelectedItem] = useState<ProduceInventory | null>(null);
  const [detail, setDetail] = useState<ProduceInventory | null>(null);
  const [stockItem, setStockItem] = useState<ProduceInventory | null>(null);
  const [stockDraft, setStockDraft] = useState("");
  const [stockError, setStockError] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    loadInventory();
    void loadIllustrations();
  }, []);

  const loadIllustrations = async () => {
    setLoadingIllustrations(true);
    setIllustrationError("");
    try {
      setIllustrations(await produceInventoryApi.getIllustrations());
    } catch (err) {
      setIllustrationError(err instanceof Error ? err.message : "Could not load crop illustrations.");
    } finally {
      setLoadingIllustrations(false);
    }
  };

  const loadInventory = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await produceInventoryApi.getSellerInventory();
      setInventory(data);
    } catch (err) {
      console.error('Failed to load inventory:', err);
      setError('Failed to load inventory. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleOpenDialog = (item?: ProduceInventory) => {
    if (item) {
      setEditingItem(item);
      setFormData({
        produce_type: item.produce_type,
        variety: item.variety || '',
        quantity_available: item.quantity_available,
        unit: item.unit,
        price_per_unit: item.price_per_unit,
        harvest_date: item.harvest_date ? item.harvest_date.split('T')[0] : '',
        expiry_date: item.expiry_date ? item.expiry_date.split('T')[0] : '',
        location: item.location,
        latitude: item.latitude || 0,
        longitude: item.longitude || 0,
        organic: item.organic,
        description: item.description || '',
        illustration_id: item.illustration_id ?? '',
        is_available: item.is_available
      });
    } else {
      setEditingItem(null);
      setFormData({
        produce_type: '',
        variety: '',
        quantity_available: 0,
        unit: defaultWeightUnit(system),
        price_per_unit: 0,
        harvest_date: '',
        expiry_date: '',
        location: '',
        latitude: 0,
        longitude: 0,
        organic: false,
        description: '',
        illustration_id: '',
        is_available: true
      });
    }
    setDialogOpen(true);
    if (!illustrations.length && !loadingIllustrations) {
      void loadIllustrations();
    }
  };

  const handleCloseDialog = () => {
    setDialogOpen(false);
    setEditingItem(null);
  };

  const handleSubmit = async () => {
    try {
      setSubmitting(true);
      
      const baseData = {
        produce_type: formData.produce_type,
        variety: formData.variety || undefined,
        quantity_available: formData.quantity_available,
        unit: formData.unit,
        price_per_unit: formData.price_per_unit,
        harvest_date: formData.harvest_date ? new Date(formData.harvest_date).toISOString() : undefined,
        expiry_date: formData.expiry_date ? new Date(formData.expiry_date).toISOString() : undefined,
        location: formData.location,
        latitude: formData.latitude || undefined,
        longitude: formData.longitude || undefined,
        organic: formData.organic,
        description: formData.description || undefined,
        illustration_id: formData.illustration_id || null,
      };

      if (editingItem) {
        const { quantity_available, ...details } = baseData;
        await produceInventoryApi.update(editingItem.id, {
          ...details, is_available: formData.is_available,
          ...(quantity_available !== editingItem.quantity_available
            ? { quantity_available, expected_quantity_available: editingItem.quantity_available } : {}),
        });
      } else {
        // Create does not accept is_available per backend schema
        await produceInventoryApi.create(baseData);
      }

      await loadInventory();
      handleCloseDialog();
    } catch (err) {
      console.error('Failed to save inventory item:', err);
      setError(err instanceof Error ? err.message : 'Failed to save inventory item.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (item: ProduceInventory) => {
    if (confirm(`Are you sure you want to delete ${item.produce_type}${item.variety ? ` (${item.variety})` : ''}?`)) {
      try {
        await produceInventoryApi.delete(item.id);
        await loadInventory();
        handleCloseMenu();
      } catch (err) {
        console.error('Failed to delete inventory item:', err);
        setError(err instanceof Error ? err.message : 'Failed to delete inventory item.');
      }
    }
  };

  const openStock = (item: ProduceInventory) => {
    setStockItem(item);
    setStockDraft(String(item.quantity_available));
    setStockError("");
    setNotice("");
  };

  const updateStock = async () => {
    if (!stockItem || submitting) return;
    const quantity = Number(stockDraft);
    if (!stockDraft.trim() || !Number.isFinite(quantity) || quantity < 0) {
      setStockError("Enter an available quantity of zero or more.");
      return;
    }
    setSubmitting(true); setStockError(""); setError(null);
    try {
      const updated = await produceInventoryApi.update(stockItem.id, {
        quantity_available: quantity, expected_quantity_available: stockItem.quantity_available,
      });
      setInventory(previous => previous.map(item => item.id === updated.id ? updated : item));
      setNotice(`${updated.produce_type} stock updated to ${updated.quantity_available} ${updated.unit} available.`);
      setStockItem(null);
    } catch (err) {
      setStockError(err instanceof Error ? err.message : "Failed to update stock.");
    } finally { setSubmitting(false); }
  };

  const reloadStock = async () => {
    if (!stockItem || submitting) return;
    setSubmitting(true);
    try {
      const current = await produceInventoryApi.getSellerInventory();
      setInventory(current);
      const updated = current.find(item => item.id === stockItem.id);
      if (updated) {
        openStock(updated);
      } else {
        setStockItem(null);
        setError("This listing no longer exists.");
      }
    } catch (err) {
      setStockError(err instanceof Error ? err.message : "Could not refresh inventory.");
    } finally {
      setSubmitting(false);
    }
  };

  const toggleListing = async (item: ProduceInventory) => {
    setSubmitting(true); setError('');
    try {
      await produceInventoryApi.update(item.id, { is_available: !item.is_available });
      await loadInventory();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to change listing visibility.');
    } finally { setSubmitting(false); }
  };

  const handleMenuOpen = (event: Event, item: ProduceInventory) => {
    setMenuAnchor(event.currentTarget as HTMLElement);
    setSelectedItem(item);
  };

  const handleCloseMenu = () => {
    setMenuAnchor(null);
    setSelectedItem(null);
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString();
  };

  if (loading) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight={200}>
        <CircularProgress />
      </Box>
    );
  }

  const published = (item: ProduceInventory) => item.is_available && item.quantity_available > 0;
  const counts = [
    { id: "all", label: "All listings", items: inventory },
    { id: "published", label: "In stock", items: inventory.filter(published) },
    { id: "committed", label: "Stock committed", items: inventory.filter(item => item.quantity_committed > 0) },
    { id: "inactive", label: "Paused", items: inventory.filter(item => !item.is_available) },
    { id: "soldout", label: "Sold out", items: inventory.filter(item => item.is_available && item.quantity_available <= 0) },
  ];
  const searchTerms = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const visible = (counts.find(group => group.id === status)?.items ?? inventory).filter(item => {
    const searchable = [item.produce_type, item.variety, item.location].filter(Boolean).join(" ").toLowerCase();
    return searchTerms.every(term => searchable.includes(term));
  });

  return (
    <Box>
      <Stack spacing={2} mb={3}>
        <WorkspaceHeading title="Produce inventory" description="Manage the produce, prices, and available stock restaurants see in Menurithm."
          actions={<Button variant="contained" sx={{ minHeight: 44 }} startIcon={<WorkspaceIcon name="add" />} onClick={() => handleOpenDialog()}>Add listing</Button>} />
        {!!inventory.length && <Stack direction={{ xs: "column", sm: "row" }} gap={1.5} alignItems={{ sm: "center" }}>
          <TextField fullWidth size="small" label="Search listings" placeholder="Produce, variety, or location" value={query} onChange={event => {
            setQuery((event.target as HTMLInputElement).value);
          }} />
          <TextField select size="small" label="Listing status" value={status} sx={{ minWidth: { sm: 220 } }}
            onChange={event => setStatus((event.target as HTMLInputElement).value)}>
            {counts.map(group => <MenuItem key={group.id} value={group.id}>{group.label} ({group.items.length})</MenuItem>)}
          </TextField>
          <Typography role="status" variant="body2" color="text.secondary" sx={{ flexShrink: 0 }}>
            {visible.length} of {inventory.length} listings
          </Typography>
        </Stack>}
      </Stack>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}
      {notice && <Alert severity="success" role="status" sx={{ mb: 2 }} onClose={() => setNotice("")}>{notice}</Alert>}

      {visible.length === 0 && (!error || inventory.length > 0) ? (
        <Card variant="outlined" sx={{ borderRadius: 3 }}>
          <CardContent sx={{ textAlign: 'center', py: 4 }}>
            <Typography variant="h6" color="text.secondary" gutterBottom>
              {inventory.length ? "No listings match" : "No produce inventory yet"}
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
              {inventory.length ? "Try another search or listing status." : "Add your first listing with a price, unit, and available quantity. Restaurants can shop published listings that have stock."}
            </Typography>
            <Button variant="outlined" onClick={() => {
              if (inventory.length) { setQuery(""); setStatus("all"); }
              else handleOpenDialog();
            }}>
              {inventory.length ? "Clear filters" : "Add first listing"}
            </Button>
          </CardContent>
        </Card>
      ) : visible.length > 0 && (
        <Card variant="outlined">
          <Box aria-hidden="true" sx={{ display: { xs: "none", lg: "grid" }, gridTemplateColumns: stockColumns,
            gap: 1.5, px: 2, py: 1.25, bgcolor: "background.default" }}>
            {["Produce", "Available", "Committed", "On hand", "Status", "Actions"].map(label =>
              <Typography key={label} variant="caption" fontWeight={700} color="text.secondary">{label}</Typography>)}
          </Box>
          <Box component="ul" aria-label="Produce listings" sx={{ listStyle: "none", m: 0, p: 0 }}>
            {visible.map(item => {
              const art = illustrations.find(option => option.id === item.illustration_id);
              const name = item.variety ? `${item.produce_type} (${item.variety})` : item.produce_type;
              return <Box component="li" key={item.id} sx={{
                display: "grid", gridTemplateColumns: { xs: "repeat(3, minmax(0, 1fr))", lg: stockColumns },
                gap: 1.5, alignItems: "center", p: 2, "& + li": { borderTop: 1, borderColor: "divider" },
              }}>
                <Stack direction="row" gap={1.25} alignItems="center" minWidth={0} sx={{ gridColumn: { xs: "1 / -1", lg: "auto" } }}>
                  <Box aria-hidden="true" sx={{ display: "grid", placeItems: "center", borderRadius: 2, width: 40,
                    height: 40, flexShrink: 0, bgcolor: "background.default", color: "primary.main" }}>
                    {art?.symbol ?? <WorkspaceIcon name="inventory" />}
                  </Box>
                  <Box sx={{ minWidth: 0 }}>
                    <Button aria-haspopup="dialog" onClick={() => setDetail(item)} sx={{ p: 0, minWidth: 0,
                      textAlign: "left", justifyContent: "flex-start", color: "text.primary", overflowWrap: "anywhere" }}>{name}</Button>
                    <Typography variant="body2" color="text.secondary" sx={{ overflowWrap: "anywhere" }}>
                      {money.format(item.price_per_unit)} / {item.unit}
                    </Typography>
                  </Box>
                </Stack>
                {([
                  ["Available", item.quantity_available],
                  ["Committed", item.quantity_committed ?? 0],
                  ["On hand", totalStock(item)],
                ] as const).map(([label, quantity]) => {
                  const equivalent = weightEquivalent(quantity, item.unit, system);
                  return <Box key={label}>
                    <Typography variant="caption" color="text.secondary" sx={{
                      overflowWrap: "anywhere",
                      display: { xs: "block", lg: "inline" },
                      position: { lg: "absolute" }, clipPath: { lg: "inset(50%)" },
                    }}>{label}: </Typography>
                    <Typography variant="body2" fontWeight={label === "Available" ? 750 : 500}
                      sx={{ overflowWrap: "anywhere", fontVariantNumeric: "tabular-nums" }}>{quantity} {item.unit}</Typography>
                    {equivalent && <Typography variant="caption" color="text.secondary" display="block">{equivalent}</Typography>}
                  </Box>;
                })}
                <Box sx={{ gridColumn: { xs: "1", lg: "auto" } }}>
                  <Chip label={!item.is_available ? "Paused" : published(item) ? "Published" : "Sold out"}
                    color={published(item) ? "primary" : "default"} size="small" />
                </Box>
                <Stack direction="row" gap={0.5} alignItems="center"
                  sx={{ gridColumn: { xs: "2 / -1", lg: "auto" }, justifyContent: "flex-end" }}>
                  <Button variant="outlined" size="small" aria-label={`Update stock for ${name}`} aria-haspopup="dialog"
                    disabled={submitting} onClick={() => openStock(item)}>Update stock</Button>
                  <IconButton aria-label={`Listing actions for ${name}`} aria-haspopup="menu"
                    disabled={submitting} onClick={event => handleMenuOpen(event, item)}>
                    <WorkspaceIcon name="more" />
                  </IconButton>
                </Stack>
              </Box>;
            })}
          </Box>
        </Card>
      )}

      {/* Context Menu */}
      <Menu
        anchorEl={menuAnchor}
        open={Boolean(menuAnchor)}
        onClose={handleCloseMenu}
      >
        <MenuItem
          onClick={() => {
            if (selectedItem) handleOpenDialog(selectedItem);
            handleCloseMenu();
          }}
        >
          <Box sx={{ mr: 1, display: "flex" }}><WorkspaceIcon name="edit" /></Box>
          Edit
        </MenuItem>
        <MenuItem onClick={() => {
          if (selectedItem) void toggleListing(selectedItem);
          handleCloseMenu();
        }}>
          {selectedItem?.is_available ? "Pause listing" : "Publish listing"}
        </MenuItem>
        <MenuItem
          onClick={() => selectedItem && handleDelete(selectedItem)}
          sx={{ color: 'error.main' }}
        >
          <Box sx={{ mr: 1, display: "flex" }}><WorkspaceIcon name="delete" /></Box>
          Delete
        </MenuItem>
      </Menu>

      <Dialog open={detail !== null} onClose={() => setDetail(null)} fullWidth maxWidth="xs" aria-labelledby="listing-details-title">
        {detail && <>
          <DialogTitle id="listing-details-title">{detail.produce_type}{detail.variety ? ` (${detail.variety})` : ""}</DialogTitle>
          <DialogContent>
            <Stack spacing={1} sx={{ overflowWrap: "anywhere" }}>
              <Typography>Location: {detail.location}</Typography>
              {detail.organic && <Box><Chip label="Organic" color="success" size="small" /></Box>}
              {detail.harvest_date && <Typography>Harvested: {formatDate(detail.harvest_date)}</Typography>}
              {detail.expiry_date && <Typography>Expires: {formatDate(detail.expiry_date)}</Typography>}
              {detail.description && <Typography sx={{ whiteSpace: "pre-wrap" }}>{detail.description}</Typography>}
            </Stack>
          </DialogContent>
          <DialogActions><Button onClick={() => setDetail(null)}>Close</Button></DialogActions>
        </>}
      </Dialog>

      <Dialog open={stockItem !== null} onClose={() => { if (!submitting) setStockItem(null); }}
        fullWidth maxWidth="xs" aria-labelledby="update-stock-title">
        {stockItem && <Box component="form" onSubmit={event => { event.preventDefault(); void updateStock(); }}>
          <DialogTitle id="update-stock-title">Update stock: {stockItem.produce_type}</DialogTitle>
          <DialogContent>
            <Stack spacing={2}>
              <Typography color="text.secondary">
                Currently available: {stockItem.quantity_available} {stockItem.unit}. Leave out the {stockItem.quantity_committed ?? 0} {stockItem.unit} already committed to orders.
              </Typography>
              {stockError && <Alert severity="error" action={<Button color="inherit" size="small" disabled={submitting}
                onClick={() => void reloadStock()}>Reload stock</Button>}>{stockError}</Alert>}
              <TextField autoFocus required label={`New available stock (${stockItem.unit})`} type="number" value={stockDraft}
                disabled={submitting} slotProps={{ htmlInput: { min: 0, step: "any" } }}
                onChange={event => setStockDraft((event.target as HTMLInputElement).value)} />
            </Stack>
          </DialogContent>
          <DialogActions>
            <Button disabled={submitting} onClick={() => setStockItem(null)}>Cancel</Button>
            <Button variant="contained" type="submit" disabled={submitting}>{submitting ? "Saving…" : "Save stock"}</Button>
          </DialogActions>
        </Box>}
      </Dialog>

      {/* Add/Edit Dialog */}
      <Dialog open={dialogOpen} onClose={handleCloseDialog} maxWidth="md" fullWidth>
        <DialogTitle>
          {editingItem ? 'Edit Produce Item' : 'Add New Produce Item'}
        </DialogTitle>
        <DialogContent>
          <Grid container spacing={2} sx={{ mt: 1 }}>
            <Grid size={{ xs: 12, md: 6 }}>
              <TextField
                fullWidth
                label="Produce Type"
                value={formData.produce_type}
                onChange={(e) => setFormData({ ...formData, produce_type: (e.target as HTMLInputElement).value })}
                required
              />
            </Grid>
            <Grid size={{ xs: 12, md: 6 }}>
              <TextField
                fullWidth
                label="Variety (optional)"
                value={formData.variety}
                onChange={(e) => setFormData({ ...formData, variety: (e.target as HTMLInputElement).value })}
              />
            </Grid>
            <Grid size={12}>
              <TextField fullWidth select label="Crop illustration" value={formData.illustration_id}
                slotProps={{ inputLabel: { shrink: true }, select: { displayEmpty: true } }}
                disabled={loadingIllustrations || Boolean(illustrationError)}
                helperText={loadingIllustrations ? 'Loading illustrations...' : illustrationError
                  ? `${illustrationError} Reopen the form to retry.`
                  : 'Choose the artwork shoppers will see, or match the produce type automatically.'}
                onChange={event => {
                  const illustration_id = (event.target as HTMLInputElement).value;
                  setFormData(previous => ({ ...previous, illustration_id }));
                }}>
                <MenuItem value="">Automatic match</MenuItem>
                {formData.illustration_id && !illustrations.some(option => option.id === formData.illustration_id) &&
                  <MenuItem value={formData.illustration_id}>Current illustration</MenuItem>}
                {illustrations.map(option => <MenuItem key={option.id} value={option.id}>
                  <Box component="span" aria-hidden="true" sx={{ display: 'inline-grid', placeItems: 'center', width: 36,
                    height: 32, mr: 1, borderRadius: 1, bgcolor: option.background }}>{option.symbol}</Box>
                  {option.label}
                </MenuItem>)}
              </TextField>
            </Grid>
            <Grid size={{ xs: 12, md: 6 }}>
              <TextField
                fullWidth
                label="Quantity Available"
                type="number"
                value={formData.quantity_available}
                onChange={(e) => setFormData({ ...formData, quantity_available: parseFloat((e.target as HTMLInputElement).value) || 0 })}
                required
              />
            </Grid>
            <Grid size={{ xs: 12, md: 6 }}>
              <TextField
                fullWidth
                label="Unit"
                value={formData.unit}
                onChange={(e) => setFormData({ ...formData, unit: (e.target as HTMLInputElement).value })}
                required
              />
            </Grid>
            <Grid size={{ xs: 12, md: 6 }}>
              <TextField
                fullWidth
                label="Price per Unit ($)"
                type="number"
                value={formData.price_per_unit}
                onChange={(e) => setFormData({ ...formData, price_per_unit: parseFloat((e.target as HTMLInputElement).value) || 0 })}
                required
              />
            </Grid>
            <Grid size={{ xs: 12, md: 6 }}>
              <TextField
                fullWidth
                label="Location"
                value={formData.location}
                onChange={(e) => setFormData({ ...formData, location: (e.target as HTMLInputElement).value })}
                required
              />
            </Grid>
            <Grid size={{ xs: 12, md: 6 }}>
              <TextField
                fullWidth
                label="Harvest Date"
                type="date"
                value={formData.harvest_date}
                onChange={(e) => setFormData({ ...formData, harvest_date: (e.target as HTMLInputElement).value })}
                InputLabelProps={{ shrink: true }}
              />
            </Grid>
            <Grid size={{ xs: 12, md: 6 }}>
              <TextField
                fullWidth
                label="Expiry Date"
                type="date"
                value={formData.expiry_date}
                onChange={(e) => setFormData({ ...formData, expiry_date: (e.target as HTMLInputElement).value })}
                InputLabelProps={{ shrink: true }}
              />
            </Grid>
            <Grid size={{ xs: 12 }}>
              <TextField
                fullWidth
                label="Description (optional)"
                multiline
                rows={3}
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: (e.target as HTMLInputElement).value })}
              />
            </Grid>
            <Grid size={{ xs: 12, md: 6 }}>
              <FormControl>
                <FormLabel>Organic</FormLabel>
                <Switch
                  checked={formData.organic}
                  onChange={(e) => setFormData({ ...formData, organic: (e.target as HTMLInputElement).checked })}
                />
              </FormControl>
            </Grid>
            <Grid size={{ xs: 12, md: 6 }}>
              <FormControl>
                <FormLabel>Available for Sale</FormLabel>
                <Switch
                  checked={formData.is_available}
                  onChange={(e) => setFormData({ ...formData, is_available: (e.target as HTMLInputElement).checked })}
                />
              </FormControl>
            </Grid>
          </Grid>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCloseDialog}>Cancel</Button>
          <Button
            onClick={handleSubmit}
            variant="contained"
            disabled={submitting}
          >
            {submitting ? <CircularProgress size={20} /> : (editingItem ? 'Update' : 'Add')}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default ProduceInventoryManager;
