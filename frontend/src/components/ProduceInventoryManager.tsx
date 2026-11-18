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
import { AddIcon, EditIcon, DeleteIcon, MoreVertIcon } from "../components/SVGIcons";
import { produceInventoryApi, type ProduceIllustration, type ProduceInventory } from "../api/produceApi";

const ProduceInventoryManager = () => {
  const [inventory, setInventory] = useState<ProduceInventory[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<ProduceInventory | null>(null);
  const [formData, setFormData] = useState({
    produce_type: '',
    variety: '',
    quantity_available: 0,
    unit: 'kg',
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

  useEffect(() => {
    loadInventory();
  }, []);

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
        unit: 'kg',
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
      setLoadingIllustrations(true);
      setIllustrationError('');
      void produceInventoryApi.getIllustrations()
        .then(setIllustrations)
        .catch(err => setIllustrationError(err instanceof Error ? err.message : 'Could not load crop illustrations.'))
        .finally(() => setLoadingIllustrations(false));
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

  const updateStock = async (item: ProduceInventory) => {
    const entered = window.prompt(`New available count (${item.unit}), excluding ${item.quantity_committed ?? 0} already committed:`, String(item.quantity_available));
    if (entered === null) return;
    const quantity = Number(entered);
    if (!entered.trim() || !Number.isFinite(quantity) || quantity < 0) {
      setError('Enter an available quantity of zero or more.');
      return;
    }
    setSubmitting(true); setError('');
    try {
      await produceInventoryApi.update(item.id, {
        quantity_available: quantity, expected_quantity_available: item.quantity_available,
      });
      await loadInventory();
    } catch (err) {
      await loadInventory();
      setError(err instanceof Error ? err.message : 'Failed to update stock.');
    } finally { setSubmitting(false); }
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

  return (
    <Box>
      <Stack spacing={2} mb={3}>
        <Box sx={{ bgcolor: 'primary.dark', color: 'primary.contrastText', borderRadius: 4, p: { xs: 3, md: 4 } }}>
          <Stack direction={{ xs: 'column', sm: 'row' }} gap={2} justifyContent="space-between" alignItems={{ xs: 'flex-start', sm: 'center' }}>
            <Box>
              <Typography variant="overline">Croprithm seller workspace</Typography>
              <Typography component="h1" variant="h4" fontWeight={750}>Farm storefront</Typography>
              <Typography>Manage the produce, pricing, and stock restaurants see in Menurithm.</Typography>
            </Box>
            <Button variant="contained" color="secondary" startIcon={<AddIcon />} onClick={() => handleOpenDialog()}>Add listing</Button>
          </Stack>
        </Box>
        <Grid container spacing={2}>
          {[
            ['Published and in stock', inventory.filter(item => item.is_available && item.quantity_available > 0).length],
            ['With committed stock', inventory.filter(item => item.quantity_committed > 0).length],
            ['Paused or sold out', inventory.filter(item => !item.is_available || item.quantity_available <= 0).length],
          ].map(([label, count]) => <Grid key={label} size={{ xs: 12, sm: 4 }}>
            <Card variant="outlined" sx={{ borderRadius: 3 }}><CardContent>
              <Typography variant="body2" color="text.secondary">{label}</Typography>
              <Typography variant="h5" fontWeight={750}>{count}</Typography>
            </CardContent></Card>
          </Grid>)}
        </Grid>
        <Alert severity="info">Stripe Connect onboarding and payouts are not configured. Existing orders still use quotes and direct payment.</Alert>
      </Stack>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}

      {inventory.length === 0 ? (
        <Card variant="outlined" sx={{ borderRadius: 3 }}>
          <CardContent sx={{ textAlign: 'center', py: 4 }}>
            <Typography variant="h6" color="text.secondary" gutterBottom>
              No produce inventory yet
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
              Add your first produce item to start selling
            </Typography>
            <Button variant="contained" onClick={() => handleOpenDialog()}>
              Add Produce
            </Button>
          </CardContent>
        </Card>
      ) : (
        <Grid container spacing={2}>
          {inventory.map((item) => (
            <Grid size={{ xs: 12, md: 6, lg: 4 }} key={item.id}>
              <Card>
                <CardContent>
                  <Box display="flex" justifyContent="space-between" alignItems="flex-start">
                    <Box flex={1}>
                      <Typography variant="h6" gutterBottom>
                        {item.produce_type}
                        {item.variety && (
                          <Typography component="span" variant="body2" color="text.secondary">
                            {' '}({item.variety})
                          </Typography>
                        )}
                      </Typography>
                    </Box>
                    <IconButton
                      size="small"
                      onClick={(e) => handleMenuOpen(e, item)}
                    >
                      <MoreVertIcon />
                    </IconButton>
                  </Box>

                  <Box display="flex" gap={1} mb={1}>
                    {item.organic && <Chip label="Organic" color="success" size="small" />}
                    <Chip 
                      label={!item.is_available ? "Paused" : item.quantity_available > 0 ? "Published" : "Sold out"}
                      color={item.is_available && item.quantity_available > 0 ? "primary" : "default"}
                      size="small" 
                    />
                  </Box>

                  <Typography variant="body2" gutterBottom>
                    Available: {item.quantity_available} {item.unit} · Committed: {item.quantity_committed ?? 0} {item.unit}
                  </Typography>
                  <Typography variant="body2">On hand: {Number((item.quantity_available + (item.quantity_committed ?? 0)).toPrecision(12))} {item.unit}</Typography>
                  <Button size="small" disabled={submitting} onClick={() => void updateStock(item)}>Update stock count</Button>
                  <Button size="small" disabled={submitting} onClick={() => void toggleListing(item)}>
                    {item.is_available ? 'Pause listing' : 'Publish listing'}
                  </Button>
                  <Typography variant="body2" gutterBottom>
                    Price: ${item.price_per_unit}/{item.unit}
                  </Typography>
                  <Typography variant="body2" gutterBottom>
                    Location: {item.location}
                  </Typography>
                  
                  {item.harvest_date && (
                    <Typography variant="body2" color="text.secondary">
                      Harvested: {formatDate(item.harvest_date)}
                    </Typography>
                  )}
                  
                  {item.expiry_date && (
                    <Typography variant="body2" color="text.secondary">
                      Expires: {formatDate(item.expiry_date)}
                    </Typography>
                  )}

                  {item.description && (
                    <Typography variant="body2" sx={{ mt: 1, fontStyle: 'italic' }}>
                      {item.description}
                    </Typography>
                  )}
                </CardContent>
              </Card>
            </Grid>
          ))}
        </Grid>
      )}

      {/* Context Menu */}
      <Menu
        anchorEl={menuAnchor}
        open={Boolean(menuAnchor)}
        onClose={handleCloseMenu}
      >
        <MenuItem
          onClick={() => {
            handleOpenDialog(selectedItem!);
            handleCloseMenu();
          }}
        >
          <EditIcon style={{ marginRight: 8 }} />
          Edit
        </MenuItem>
        <MenuItem
          onClick={() => selectedItem && handleDelete(selectedItem)}
          sx={{ color: 'error.main' }}
        >
          <DeleteIcon style={{ marginRight: 8 }} />
          Delete
        </MenuItem>
      </Menu>

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
