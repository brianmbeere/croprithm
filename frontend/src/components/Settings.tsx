import { useEffect, useState } from "preact/hooks";
import {
  Accordion, AccordionDetails, AccordionSummary, Alert, Avatar, Box, Button, Card,
  CardContent, Chip, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle,
  Divider, List, ListItemButton, ListItemIcon, ListItemText, MenuItem, Stack, TextField, Typography,
  useMediaQuery, useTheme,
} from "@mui/material";
import type { User } from "firebase/auth";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { db } from "../hooks/initializeFirebase";
import { WorkspaceHeading, WorkspaceIcon } from "./WorkspaceUI";
import type { WorkspacePage, WorkspaceRole } from "./workspaceSections";
import { useMeasurementPreferences } from "../context/MeasurementPreferences";

type BusinessProfile = {
  organization: string;
  headquarters: string;
  businessPhone: string;
  industry: string;
};

const emptyProfile: BusinessProfile = {
  organization: "", headquarters: "", businessPhone: "", industry: "",
};

const profileStore = {
  async load(uid: string): Promise<BusinessProfile> {
    const data = (await getDoc(doc(db, "users", uid))).data();
    return {
      organization: typeof data?.organization === "string" ? data.organization : "",
      headquarters: typeof data?.headquarters === "string" ? data.headquarters : "",
      businessPhone: typeof data?.businessPhone === "string" ? data.businessPhone : "",
      industry: typeof data?.industry === "string" ? data.industry : "",
    };
  },
  async save(uid: string, changes: Partial<BusinessProfile>) {
    await setDoc(doc(db, "users", uid), { ...changes, updatedAt: new Date().toISOString() }, { merge: true });
  },
};

const shortcuts = {
  farmer: [
    { page: "inventory", icon: "inventory", label: "Inventory", description: "Update stock and manage produce listings." },
    { page: "orders", icon: "calendar", label: "Orders & pickup windows", description: "Open Orders to manage when customers can collect." },
    { page: "plan", icon: "route", label: "Route planning", description: "Plan deliveries and organize your stops." },
  ],
  restaurant: [
    { page: "market", icon: "market", label: "Source produce", description: "Find farms and browse produce." },
    { page: "saved", icon: "saved", label: "Saved routes", description: "View your saved itineraries." },
  ],
} as const;

const providerLabel = (id: string) =>
  ({ password: "Email & password", "google.com": "Google", "apple.com": "Apple" })[id] ?? id;

function Detail({ label, value, empty = "Not added" }: { label: string; value?: string | null; empty?: string }) {
  return <Box sx={{ minWidth: 0 }}>
    <Typography component="dt" variant="body2" color="text.secondary">{label}</Typography>
    <Typography component="dd" sx={{ m: 0, overflowWrap: "anywhere" }}>{value || empty}</Typography>
  </Box>;
}

export default function Settings({ user, role, onPageChange, store = profileStore }: {
  user: Pick<User, "uid" | "email" | "emailVerified" | "providerData" | "metadata">;
  role: WorkspaceRole;
  onPageChange: (page: WorkspacePage) => void;
  store?: typeof profileStore;
}) {
  const [profile, setProfile] = useState<BusinessProfile | null>(null);
  const [draft, setDraft] = useState<BusinessProfile>(emptyProfile);
  const [loadError, setLoadError] = useState(false);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(false);
  const [saved, setSaved] = useState(false);
  const isMobile = useMediaQuery(useTheme().breakpoints.down("sm"));
  const { uid } = user;
  const { system, setSystem, storageError } = useMeasurementPreferences();

  useEffect(() => {
    let active = true;
    store.load(uid).then(
      data => { if (active) setProfile(data); },
      error => {
        console.error("Failed to load business profile", error);
        if (active) setLoadError(true);
      },
    );
    return () => { active = false; };
  }, [store, uid, loadAttempt]);

  const nameLabel = role === "farmer" ? "Farm name" : "Restaurant name";
  const roleLabel = role === "farmer" ? "Farmer" : "Restaurant";
  const businessName = profile?.organization || `${roleLabel} workspace`;
  const fields: { key: keyof BusinessProfile; label: string; autoComplete?: string; type?: string }[] = [
    { key: "organization", label: nameLabel, autoComplete: "organization" },
    { key: "headquarters", label: "Business location", autoComplete: "street-address" },
    { key: "businessPhone", label: "Business phone", autoComplete: "tel", type: "tel" },
    { key: "industry", label: "Industry" },
  ];
  const changes: Partial<BusinessProfile> = {};
  for (const { key } of fields) {
    if (profile && draft[key].trim() !== profile[key].trim()) changes[key] = draft[key].trim();
  }
  const isDirty = Object.keys(changes).length > 0;
  const providers = [...new Set(user.providerData.map(provider => providerLabel(provider.providerId)))];
  const lastSignIn = user.metadata.lastSignInTime;

  const openEditor = () => {
    if (!profile) return;
    setDraft(profile);
    setSaveError(false);
    setSaved(false);
    setEditing(true);
  };
  const closeEditor = () => { if (!saving) setEditing(false); };
  const save = async () => {
    if (!profile || !isDirty || saving) return;
    setSaving(true);
    setSaveError(false);
    try {
      await store.save(uid, changes);
      setProfile({ ...profile, ...changes });
      setEditing(false);
      setSaved(true);
    } catch (error) {
      console.error("Failed to save business profile", error);
      setSaveError(true);
    } finally {
      setSaving(false);
    }
  };

  return <Stack spacing={3} sx={{ maxWidth: 1040 }}>
    <WorkspaceHeading title="Settings" description="Manage your business profile and review your sign-in details." />

    <Card variant="outlined">
      <CardContent sx={{ p: { xs: 2, sm: 3 } }}>
        <Stack direction="row" spacing={2} alignItems="center">
          <Avatar aria-hidden="true" sx={{ bgcolor: "primary.main", color: "primary.contrastText", width: 52, height: 52 }}>
            <WorkspaceIcon name={role === "farmer" ? "inventory" : "market"} />
          </Avatar>
          <Box sx={{ minWidth: 0 }}>
            <Typography component="h2" variant="h6" fontWeight={700} sx={{ overflowWrap: "anywhere" }}>{businessName}</Typography>
            <Typography variant="body2" color="text.secondary">{roleLabel} account</Typography>
          </Box>
        </Stack>
      </CardContent>
    </Card>

    <Box sx={{ display: "grid", gap: 2.5, alignItems: "start", gridTemplateColumns: { xs: "minmax(0, 1fr)", md: "minmax(0, 3fr) minmax(0, 2fr)" } }}>
      <Stack spacing={2.5}>
        <Card variant="outlined" component="section" aria-labelledby="business-profile-heading">
          <CardContent>
            <Stack spacing={2}>
              <Stack direction="row" spacing={1} alignItems="flex-start" justifyContent="space-between">
                <Box>
                  <Typography id="business-profile-heading" component="h2" variant="h6">Business profile</Typography>
                  <Typography variant="body2" color="text.secondary">Your business name, location and contact details.</Typography>
                </Box>
                {profile && <Button variant="outlined" onClick={openEditor} aria-label="Edit business profile" sx={{ flexShrink: 0 }}>Edit</Button>}
              </Stack>
              {saved && <Alert severity="success" role="status" onClose={() => setSaved(false)}>Business profile saved.</Alert>}
              {loadError ? <Alert severity="error" action={<Button color="inherit" onClick={() => {
                setLoadError(false);
                setLoadAttempt(attempt => attempt + 1);
              }}>Retry</Button>}>Couldn’t load your business profile.</Alert>
                : profile ? <Box component="dl" sx={{ m: 0, display: "grid", gap: 2, gridTemplateColumns: { xs: "1fr", sm: "repeat(2, minmax(0, 1fr))" } }}>
                  {fields.map(({ key, label }) => <Detail key={key} label={label} value={profile[key]} />)}
                </Box> : <CircularProgress size={24} aria-label="Loading business profile" />}
            </Stack>
          </CardContent>
        </Card>

        <Card variant="outlined" component="section" aria-labelledby="measurement-heading">
          <CardContent>
            <Stack spacing={2}>
              <Box>
                <Typography id="measurement-heading" component="h2" variant="h6">Measurements</Typography>
                <Typography variant="body2" color="text.secondary">
                  Set route units and the default weight unit for new listings. Existing listings and orders keep their original units, with approximate weight equivalents where available.
                </Typography>
              </Box>
              <TextField select label="Measurement system" value={system} size="small"
                helperText="Saved for this account in this browser."
                onChange={event => {
                  const target = event.target;
                  const value = target && "value" in target ? target.value : undefined;
                  if (value === "us" || value === "metric") setSystem?.(value);
                }}>
                <MenuItem value="us">U.S. customary (lb, mi)</MenuItem>
                <MenuItem value="metric">Metric (kg, km)</MenuItem>
              </TextField>
              {storageError && <Alert severity="warning">Browser storage isn’t available. Your selection may reset when you reload.</Alert>}
            </Stack>
          </CardContent>
        </Card>

        <Card variant="outlined" component="section" aria-labelledby="sign-in-heading">
          <CardContent>
            <Typography id="sign-in-heading" component="h2" variant="h6">Sign-in details</Typography>
            <Typography variant="body2" color="text.secondary">The account you use to access Croprithm.</Typography>
            <Stack component="dl" spacing={1.5} sx={{ mb: 0 }}>
              <Detail label="Sign-in email" value={user.email} empty="Not available" />
              {user.email && <Box component="div">
                <Typography component="dt" variant="body2" color="text.secondary">Email verification</Typography>
                <Box component="dd" sx={{ m: 0, mt: 0.5 }}>
                  <Chip size="small" label={user.emailVerified ? "Verified" : "Not verified"} />
                </Box>
              </Box>}
            </Stack>
          </CardContent>
          <Divider />
          <Accordion disableGutters elevation={0} square sx={{ "&::before": { display: "none" } }}>
            <AccordionSummary id="account-details-toggle" aria-controls="account-details-panel"
              expandIcon={<Box sx={{ display: "flex", transform: "rotate(90deg)" }}><WorkspaceIcon name="arrow" /></Box>}>
              More account details
            </AccordionSummary>
            <AccordionDetails>
              <Stack component="dl" spacing={1.5} sx={{ m: 0 }}>
                <Detail label="Sign-in method" value={providers.join(", ")} empty="Not available" />
                <Detail label="Last sign-in" value={lastSignIn ? new Date(lastSignIn).toLocaleString() : null} empty="Not available" />
                <Detail label="Account ID" value={uid} />
              </Stack>
            </AccordionDetails>
          </Accordion>
        </Card>
      </Stack>

      <Card variant="outlined" component="section" aria-labelledby="workspace-shortcuts-heading">
        <CardContent sx={{ pb: 1, "&:last-child": { pb: 1 } }}>
          <Typography id="workspace-shortcuts-heading" component="h2" variant="h6">Workspace shortcuts</Typography>
          <Typography variant="body2" color="text.secondary">Jump to tools you use for day-to-day work.</Typography>
        </CardContent>
        <List disablePadding>
          {shortcuts[role].map(({ page, icon, label, description }, index) =>
            <Box component="li" key={page}>
              <ListItemButton divider={index < shortcuts[role].length - 1} onClick={() => onPageChange(page)} sx={{ gap: 1, py: 1.25 }}>
                <ListItemIcon sx={{ minWidth: 30, color: "primary.main" }}><WorkspaceIcon name={icon} /></ListItemIcon>
                <ListItemText primary={label} secondary={description} />
                <Box sx={{ display: "flex", flexShrink: 0, color: "text.secondary" }}><WorkspaceIcon name="arrow" /></Box>
              </ListItemButton>
            </Box>,
          )}
        </List>
      </Card>
    </Box>

    <Dialog open={editing} onClose={closeEditor} fullWidth fullScreen={isMobile} maxWidth="sm" aria-labelledby="edit-business-heading">
      <Box component="form" onSubmit={(event) => { event.preventDefault(); void save(); }}>
        <DialogTitle id="edit-business-heading">Edit business profile</DialogTitle>
        <DialogContent dividers>
          <Stack spacing={2}>
            {saveError && <Alert severity="error">Couldn’t save your changes. Try again.</Alert>}
            {fields.map(({ key, label, autoComplete, type }, index) =>
              <TextField key={key} label={label} autoFocus={index === 0} fullWidth
                autoComplete={autoComplete} type={type} value={draft[key]} disabled={saving}
                onChange={(event) => {
                  const value = event.currentTarget.value;
                  setDraft(previous => ({ ...previous, [key]: value }));
                }} />,
            )}
          </Stack>
        </DialogContent>
        <DialogActions sx={{ px: 3, py: 2 }}>
          <Button onClick={closeEditor} disabled={saving}>Cancel</Button>
          <Button type="submit" variant="contained" disabled={saving || !isDirty}>{saving ? "Saving..." : "Save changes"}</Button>
        </DialogActions>
      </Box>
    </Dialog>
  </Stack>;
}
