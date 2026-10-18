import { Alert, Button, Stack } from "@mui/material";
import { navigationLinks, type NavigationDestination } from "../../utils/navigation";

export default function NavigationButtons({ destination }: { destination: NavigationDestination }) {
  const links = navigationLinks(destination);
  if (!links) return <Alert severity="warning">Add a valid address before navigating.</Alert>;
  return (
    <Stack direction={{ xs: "column", sm: "row" }} spacing={1}>
      <Button component="a" href={links.google} target="_blank" rel="noopener noreferrer"
        variant="contained" sx={{ minHeight: 44 }} aria-label={`Navigate to ${destination.address} with Google Maps`}>
        Google Maps
      </Button>
      <Button component="a" href={links.apple} target="_blank" rel="noopener noreferrer"
        variant="outlined" sx={{ minHeight: 44 }} aria-label={`Navigate to ${destination.address} with Apple Maps`}>
        Apple Maps
      </Button>
    </Stack>
  );
}
