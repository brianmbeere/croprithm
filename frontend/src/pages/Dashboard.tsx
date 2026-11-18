import { useState, useEffect } from "preact/hooks";
import type { FunctionalComponent } from "preact";
import { onAuthStateChanged, type User as FirebaseUser, signOut } from "firebase/auth";
import { CssBaseline, Box, Alert, CircularProgress, Button, Card, CardContent, Stack, Typography } from "@mui/material";
import { useNavigate } from "react-router-dom";
import { doc, getDoc } from "firebase/firestore";

import { auth, db } from "../hooks/initializeFirebase";
import WorkspaceLayout from "../components/WorkspaceLayout";
import { WorkspaceHeading, WorkspaceIcon } from "../components/WorkspaceUI";
import type { WorkspacePage, WorkspaceRole } from "../components/workspaceSections";

import RoutePlanner from "./RoutePlanner";
import SavedRoutes from "../components/SavedRoutes";
import SourcingInsights from "../components/ProduceInsights";
import ProduceAnalytics from "../components/ProduceAnalytics";
import ProduceInventoryManager from "../components/ProduceInventoryManager";
import FarmFinder from "../components/FarmFinder";
import Settings from "../components/Settings";
import FulfillmentOrders from "../components/FulfillmentOrders";
import { MeasurementPreferences } from "../context/MeasurementPreferences";

const Dashboard: FunctionalComponent = () => {
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [role, setRole] = useState<WorkspaceRole | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [page, setPage] = useState<WorkspacePage>("overview");

  const navigate = useNavigate();

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (currentUser) => {
      setUser(currentUser);
      setLoading(true);
      setError("");
      try {
        if (currentUser) {
          const userDocRef = doc(db, "users", currentUser.uid);
          const userDoc = await getDoc(userDocRef);
          const accountRole = userDoc.data()?.role;
          const workspaceRole = accountRole === "farmer" || accountRole === "restaurant" ? accountRole : null;
          setRole(workspaceRole);
          setPage(workspaceRole === "restaurant" ? "market" : "overview");
        } else {
          setRole(null);
          navigate("/signin");
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Unable to load your account");
      } finally { setLoading(false); }
    });

    return unsub;
  }, []);

  const handleLogout = async () => {
    await signOut(auth);
    navigate("/signin");
  };

  const getTabContent = () => {
    switch (page) {
      case "overview": return <Stack spacing={3}>
        <WorkspaceHeading title="Farm overview" description="Manage what you have available, what restaurants have ordered, and what’s ready for handover." />
        <Box sx={{ display: "grid", gap: 2, gridTemplateColumns: { xs: "1fr", lg: "repeat(3, minmax(0, 1fr))" } }}>
          {([
            { id: "inventory", icon: "inventory", title: "Check your stock", description: "See available and committed quantities. Update stock counts or publish produce.", action: "Open inventory" },
            { id: "orders", icon: "orders", title: "Prepare orders", description: "Review requests and pickup orders, set pickup windows, and mark produce ready.", action: "Open orders" },
            { id: "plan", icon: "route", title: "Plan deliveries", description: "Plan a route for accepted farmer deliveries and organize your stops.", action: "Plan a route" },
          ] as const).map(item => <Card key={item.id} variant="outlined" sx={{ display: "flex" }}>
            <CardContent sx={{ display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 1.25, p: 2.5 }}>
              <Box sx={{ color: "primary.main", display: "flex" }}><WorkspaceIcon name={item.icon} /></Box>
              <Typography component="h2" variant="h6" sx={{ color: "text.primary" }}>{item.title}</Typography>
              <Typography color="text.secondary" sx={{ flex: 1 }}>{item.description}</Typography>
              <Button onClick={() => setPage(item.id)} endIcon={<WorkspaceIcon name="arrow" />}>{item.action}</Button>
            </CardContent>
          </Card>)}
        </Box>
      </Stack>;
      case "inventory": return <ProduceInventoryManager />;
      case "orders": return <FulfillmentOrders />;
      case "plan": return <RoutePlanner />;
      case "saved": return <SavedRoutes />;
      case "analytics": return role === "farmer" ? <ProduceAnalytics /> : <SourcingInsights />;
      case "settings": return user && role && <Settings key={user.uid} user={user} role={role} onPageChange={setPage} />;
      case "market": return <FarmFinder />;
    }
  };

  if (loading) return <Box p={3}><CircularProgress aria-label="Loading your workspace" /></Box>;
  if (error) return <Box p={3}><Alert severity="error">{error}</Alert></Box>;
  if (!user) return <Box p={3}>User not signed in.</Box>;
  if (!role) return <Box p={3}><Alert severity="warning">Your account needs a farmer or restaurant role. Please contact support.</Alert></Box>;

  return (
    <MeasurementPreferences key={user.uid} uid={user.uid}>
      <CssBaseline />
      <WorkspaceLayout role={role} page={page} onPageChange={setPage} onLogout={() => void handleLogout()}>
        {getTabContent()}
      </WorkspaceLayout>
    </MeasurementPreferences>
  );
};

export default Dashboard;
