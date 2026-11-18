import { Alert, Button, Stack } from "@mui/material";
import { navigationLinks, type NavigationDestination } from "../../utils/navigation";
import { WorkspaceIcon } from "../WorkspaceUI";

export default function NavigationButtons({ destination, origin }: {
  destination: NavigationDestination; origin?: NavigationDestination;
}) {
  const links = navigationLinks(destination, origin);
  if (!links) return <Alert severity="warning">Add a valid address before navigating.</Alert>;
  const action = origin ? "Preview directions to" : "Navigate to";
  return (
    <Stack direction={{ xs: "column", sm: "row" }} spacing={1}>
      <Button component="a" href={links.google} target="_blank" rel="noopener noreferrer"
        startIcon={<WorkspaceIcon name="route" />} variant="outlined" sx={{ minHeight: 44 }}
        aria-label={`${action} ${destination.address} with Google Maps`}>
        Google Maps
      </Button>
      <Button component="a" href={links.apple} target="_blank" rel="noopener noreferrer"
        startIcon={<WorkspaceIcon name="route" />} variant="outlined" sx={{ minHeight: 44 }}
        aria-label={`${action} ${destination.address} with Apple Maps`}>
        Apple Maps
      </Button>
    </Stack>
  );
}
