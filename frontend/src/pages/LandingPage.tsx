import { Button, Card, CardContent, Container, Grid, Typography, Box } from "@mui/material";
import { motion } from "framer-motion";
import { type FunctionalComponent } from "preact";
import { brandPalette } from "../branding";
const logoLanding = "/croprithm-logo.svg";

const LandingPage: FunctionalComponent = () => {
  return (
    <Box
      sx={{
        minHeight: "100vh",
        background: `linear-gradient(120deg, ${brandPalette.background.default} 0%, ${brandPalette.accent.main} 100%)`,
        color: brandPalette.text.primary,
        display: "flex",
        flexDirection: "column",
        boxSizing: "border-box",
        overflowX: "hidden",
      }}
    >
      {/* Sticky Header */}
      <Box
        component="header"
        sx={{
          position: "sticky",
          top: 0,
          zIndex: 1000,
          backgroundColor: brandPalette.background.paper,
          borderBottom: `1px solid ${brandPalette.accent.main}`,
          px: 3,
          py: 2,
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <Box sx={{ display: "flex", alignItems: "center", gap: 2 }}>
          <Box component="img" src={logoLanding} alt="Croprithm Logo" sx={{ height: 48, width: "auto", background: "transparent" }} />
        </Box>
        <Button
          variant="contained"
          href="/signin"
          sx={{
            background: brandPalette.primary.main,
            color: brandPalette.primary.contrastText,
            fontWeight: 700,
            borderRadius: 2,
            px: 3,
            boxShadow: "0 2px 8px rgba(58,131,116,0.08)",
            ':hover': {
              background: brandPalette.secondary.main,
              color: brandPalette.secondary.contrastText,
            },
          }}
        >
          Get Started
        </Button>
      </Box>

      {/* Hero Section */}
      <Container maxWidth="md" sx={{ py: 8, textAlign: "center" }}>
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.7 }}
        >
          <Box
            component="img"
            src={logoLanding}
            alt="Connecting Farms to Tables"
            sx={{ width: "100%", maxWidth: 500, mx: "auto", mb: 3 }}
          />
          <Typography variant="h6" color={brandPalette.text.secondary} sx={{ maxWidth: 600, mx: "auto" }}>
            Croprithm connects farmers, restaurants, and local markets with optimized, sustainable delivery routes. Reduce waste, save fuel, and deliver fresher produce faster.
          </Typography>
          <Button variant="contained" size="large" href="/signin" sx={{ mt: 4, background: brandPalette.primary.main, color: brandPalette.primary.contrastText, fontWeight: 700, borderRadius: 2, px: 4, fontSize: 20, boxShadow: "0 2px 8px rgba(58,131,116,0.08)", ':hover': { background: brandPalette.secondary.main, color: brandPalette.secondary.contrastText } }}>
            Start Planning
          </Button>
        </motion.div>
      </Container>

      {/* Features Section */}
      <Container maxWidth="lg" sx={{ py: 8 }}>
        <Typography variant="h4" fontWeight="bold" color={brandPalette.primary.main} align="center" gutterBottom sx={{ mb: 6 }}>
          Why Croprithm?
        </Typography>
        <Grid container spacing={4}>
          {[
            {
              title: "🚚 Optimized Farm-to-Table Delivery",
              desc: "Coordinate pickups and delivery stops between farms, markets, and restaurants with suggested stop ordering.",
            },
            {
              title: "🌱 Reduce Waste, Boost Profit",
              desc: "Smart routing means less spoilage, fewer empty miles, and more revenue for every stakeholder in the supply chain.",
            },
            {
              title: "📦 Plan Here, Navigate with Maps",
              desc: "Save delivery stops, open Google Maps or Apple Maps for directions, and return to record progress. No dedicated navigation app required.",
            },
          ].map((feature, index) => (
            <Grid key={index} sx={{ xs: 12, sm: 6, md: 4 }}>
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: index * 0.2 }}
                style={{ height: "100%" }}
              >
                <Card elevation={3} sx={{ height: "100%", borderRadius: 3, background: brandPalette.background.paper }}>
                  <CardContent>
                    <Typography variant="h6" fontWeight="bold" color={brandPalette.secondary.main} gutterBottom>
                      {feature.title}
                    </Typography>
                    <Typography variant="body1" color={brandPalette.text.primary}>{feature.desc}</Typography>
                  </CardContent>
                </Card>
              </motion.div>
            </Grid>
          ))}
        </Grid>
      </Container>

      {/* Footer */}
      <Box component="footer" sx={{ textAlign: "center", py: 4, color: brandPalette.text.secondary, fontWeight: 500, letterSpacing: 1 }}>
        © {new Date().getFullYear()} Croprithm. All rights reserved.
      </Box>
    </Box>
  );
};

export default LandingPage;
