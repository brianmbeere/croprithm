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
        background: brandPalette.background.default,
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
          px: { xs: 2, md: 4 },
          py: 2,
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <Box sx={{ display: "flex", alignItems: "center", gap: 2 }}>
          <Box component="img" src={logoLanding} alt="Croprithm Logo" sx={{ height: { xs: 30, md: 42 }, maxWidth: { xs: 140, md: 220 }, background: "transparent" }} />
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
          <Typography variant="overline" color="primary">From your farm. On your terms.</Typography>
          <Typography variant="h1" sx={{ my: 3 }}>Good produce deserves<br />a better handover.</Typography>
          <Typography variant="h6" color={brandPalette.text.secondary} sx={{ maxWidth: 600, mx: "auto" }}>
            Manage your harvest, quote farmer delivery or customer pickup, and keep every handover clear. Built for farmers who care about the condition their produce arrives in.
          </Typography>
          <Button variant="contained" size="large" href="/signin" sx={{ mt: 4, background: brandPalette.primary.main, color: brandPalette.primary.contrastText, fontWeight: 700, borderRadius: 2, px: 4, fontSize: 20, boxShadow: "0 2px 8px rgba(58,131,116,0.08)", ':hover': { background: brandPalette.secondary.main, color: brandPalette.secondary.contrastText } }}>
            Open farmer workspace
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
              title: "Choose the right handover",
              desc: "Offer customer pickup with no delivery fee, or deliver it yourself. Quote the terms and wait for customer approval.",
            },
            {
              title: "Keep your harvest in view",
              desc: "Manage produce availability and quality details in your farmer inventory. Keep customers informed as orders become ready.",
            },
            {
              title: "Plan here. Navigate with Maps.",
              desc: "Save delivery stops, open Google Maps or Apple Maps for directions, and return to record progress. No dedicated navigation app required.",
            },
          ].map((feature, index) => (
            <Grid key={index} size={{ xs: 12, md: 4 }}>
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
