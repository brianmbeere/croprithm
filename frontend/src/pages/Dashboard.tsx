import { useState, useEffect } from "preact/hooks";
import type { FunctionalComponent } from "preact";
import { onAuthStateChanged, type User as FirebaseUser, signOut } from "firebase/auth";
import { CssBaseline, Box, Alert, CircularProgress, useMediaQuery } from "@mui/material";
import { useNavigate } from "react-router-dom";
import { doc, getDoc } from "firebase/firestore";

import { auth, db } from "../hooks/initializeFirebase";
import DashboardNavigation from "../components/DashboardNavigation";
import DashboardAppBar from "../components/DashboardAppbar";

import RoutePlanner from "./RoutePlanner";
import SavedRoutes from "../components/SavedRoutes";
import SourcingInsights from "../components/ProduceInsights";
import ProduceAnalytics from "../components/ProduceAnalytics";
import ProduceRequestFeed from "../components/ProduceRequestFeed";
import ProduceInventoryManager from "../components/ProduceInventoryManager";
import FarmFinder from "../components/FarmFinder";
import Settings from "../components/Settings";
import { theme } from "../branding";
import { SelectedRequestsProvider } from "../context/SelectedRequestsContext";
import FulfillmentOrders from "../components/FulfillmentOrders";

const drawerWidth = 240;
const appBarHeight = 64;
const collapsedDrawerWidth = 64;

const Dashboard: FunctionalComponent = () => {
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [role, setRole] = useState<"farmer" | "restaurant" | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const isMobile = useMediaQuery(theme.breakpoints.down("md"));
    const [drawerExpanded, setDrawerExpanded] = useState(true);
  const [activeTab, setActiveTab] = useState(0);
  const [mobileOpen, setMobileOpen] = useState(false);

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
        setRole(userDoc.exists() ? userDoc.data().role || null : null);
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
    const farmerTabs = [<FulfillmentOrders />, <ProduceInventoryManager />, <RoutePlanner />, <SavedRoutes />, <ProduceAnalytics />, <Settings user={user} />, <ProduceRequestFeed />];
    const restaurantTabs = [<FarmFinder />, <RoutePlanner />, <SavedRoutes />, <SourcingInsights />, <Settings user={user} />];

    return role === "farmer"
      ? farmerTabs[activeTab] || null
      : role === "restaurant"
      ? restaurantTabs[activeTab] || null
      : null;
  };

  if (loading) return <Box p={3}><CircularProgress aria-label="Loading your workspace" /></Box>;
  if (error) return <Box p={3}><Alert severity="error">{error}</Alert></Box>;
  if (user && !role) return <Box p={3}><Alert severity="warning">Your account needs a farmer or restaurant role. Please contact support.</Alert></Box>;
  if (!user) return <Box p={3}>User not signed in.</Box>;

  return (
    <SelectedRequestsProvider>
      <Box sx={{ display: "flex", backgroundColor: theme.palette.background.default }}>
        <CssBaseline />

        {/* AppBar (Fixed at Top) */}
        <Box
          sx={{
              position: "fixed",
              top: 0,
              left: {
                xs: 0,
                md: `${drawerExpanded ? drawerWidth : collapsedDrawerWidth}px`,
              },
              width: {
                xs: "100%",
                md: `calc(100% - ${drawerExpanded ? drawerWidth : collapsedDrawerWidth}px)`,
              },
              zIndex: (theme) => theme.zIndex.drawer + 1,
          }}
        >
          <DashboardAppBar
            isMobile={isMobile}
            onMenuClick={() => setMobileOpen(!mobileOpen)}
            onAccount={() => setActiveTab(role === "farmer" ? 5 : 4)}
            breadcrumb={{
              title:
                role === "farmer"
                  ? ["Orders & handovers", "My Inventory", "Route planning", "Saved Routes", "Analytics", "Settings", "Legacy requests"][activeTab]
                  : ["Farm Finder", "Route Optimizer", "Saved Routes", "Sourcing Insights", "Settings"][activeTab],
              path: "",
            }}
          />
        </Box>

        {/* Side Navigation Drawer */}
        <DashboardNavigation
          activeTab={activeTab}
          setActiveTab={setActiveTab}
          isMobile={isMobile}
          role={role || "farmer"}
          mobileOpen={mobileOpen}
          setMobileOpen={setMobileOpen}
          drawerWidth={drawerWidth}
          onLogout={handleLogout}
          onLogoClick={() => setActiveTab(0)}
          setExpanded={setDrawerExpanded}
          expanded={drawerExpanded}
        />

        {/* Main Content Area */}
        <Box
          component="main"
          sx={{
            flexGrow: 1,
            p: { xs: 2, md: 4 },
            minWidth: 0,
            minHeight: "100vh",
            width: { xs: "100%", md: `calc(100% - ${drawerExpanded ? drawerWidth : collapsedDrawerWidth}px)` },
            ml: { md: `${drawerExpanded ? drawerWidth : collapsedDrawerWidth}px` },
            mt: `${appBarHeight}px`,
          }}
        >
          {getTabContent()}
        </Box>
      </Box>
    </SelectedRequestsProvider>
  );
};

export default Dashboard;
