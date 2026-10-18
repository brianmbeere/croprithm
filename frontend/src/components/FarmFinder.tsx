import { Alert, Button, Card, CardContent, Stack, Typography } from "@mui/material";

const FarmFinder = () => (
  <Stack spacing={3}>
    <Typography variant="h4">Fresh produce, directly from farmers</Typography>
    <Card><CardContent><Stack spacing={2}>
      <Typography variant="h6">Source through Menurithm</Typography>
      <Typography>Request customer pickup or farmer delivery, review the farmer's USD delivery fee and accept the handover terms before fulfillment starts.</Typography>
      <Alert severity="info">Menurithm and Croprithm use separate accounts. Sign in to your Menurithm customer account to place and review requests.</Alert>
      <Button variant="contained" href="https://menurithm.com/dashboard/produce-orders" sx={{ alignSelf: "flex-start" }}>Open customer orders</Button>
    </Stack></CardContent></Card>
  </Stack>
);
export default FarmFinder;