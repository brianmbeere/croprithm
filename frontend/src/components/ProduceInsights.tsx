import { Alert, Button, Card, CardContent, Stack, Typography } from "@mui/material";

const ProduceInsights = () => (
  <Stack spacing={3}>
    <Typography variant="h4">Sourcing insights</Typography>
    <Card><CardContent><Stack spacing={2}>
      <Typography variant="h6">Build a clearer sourcing history</Typography>
      <Typography>Start with confirmed farmer agreements and review each pickup or delivery in Menurithm.</Typography>
      <Alert severity="info">Automated sourcing reports are not enabled in this pilot. We do not estimate savings from orders that have not been fulfilled.</Alert>
      <Button href="https://menurithm.com/dashboard/produce-orders" variant="outlined" sx={{ alignSelf: "flex-start" }}>Review produce orders</Button>
    </Stack></CardContent></Card>
  </Stack>
);
export default ProduceInsights;