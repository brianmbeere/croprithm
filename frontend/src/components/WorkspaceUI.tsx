import { Box, Stack, Typography } from "@mui/material";
import type { ComponentChildren } from "preact";

const paths = {
  overview: "M3 3h7v7H3z M14 3h7v7h-7z M3 14h7v7H3z M14 14h7v7h-7z",
  inventory: "M3 8h18v13H3z M2 4h20v4H2z M9 12h6",
  orders: "M9 5H5v16h14V5h-4 M9 3h6v4H9z M8 12h8 M8 16h6",
  route: "M5 8v7a4 4 0 0 0 4 4h6 M9 5h6a4 4 0 0 1 4 4v7 M5 2a3 3 0 1 0 0 6 3 3 0 0 0 0-6Z M19 16a3 3 0 1 0 0 6 3 3 0 0 0 0-6Z",
  saved: "M5 3h14v18l-7-4-7 4z",
  analytics: "M3 3v18h18 M8 16v-4 M13 16V8 M18 16V5",
  account: "M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2 M12 3a4 4 0 1 0 0 8 4 4 0 0 0 0-8Z",
  market: "M3 10l2-6h14l2 6 M3 10v2a3 3 0 0 0 6 0 3 3 0 0 0 6 0 3 3 0 0 0 6 0v-2H3 M5 15v6h14v-6",
  menu: "M4 6h16 M4 12h16 M4 18h16",
  logout: "M10 4H4v16h6 M9 12h12 M17 8l4 4-4 4",
  collapse: "M8 5h12v14H8z M13 9l-3 3 3 3 M4 5v14",
  expand: "M4 5h12v14H4z M11 9l3 3-3 3 M20 5v14",
  add: "M12 5v14 M5 12h14",
  calendar: "M4 6h16v15H4z M8 3v6 M16 3v6 M4 11h16",
  refresh: "M20 7v5h-5 M4 17v-5h5 M6 7a7 7 0 0 1 12-1l2 6 M4 12l2 6a7 7 0 0 0 12-1",
  more: "M5 12h.1 M12 12h.1 M19 12h.1",
  edit: "m4 16 11-11 4 4L8 20H4z M13 7l4 4",
  delete: "M4 6h16 M9 6V3h6v3 M6 6l1 14h10l1-14 M10 10v6 M14 10v6",
  arrow: "M5 12h14 M14 7l5 5-5 5",
} as const;

export type WorkspaceIconName = keyof typeof paths;

export function WorkspaceIcon({ name }: { name: WorkspaceIconName }) {
  return <svg aria-hidden="true" focusable="false" width="20" height="20" viewBox="0 0 24 24"
    fill="none" stroke="currentColor" strokeWidth={name === "more" ? 3 : 1.7}
    strokeLinecap="round" strokeLinejoin="round"><path d={paths[name]} /></svg>;
}

export function WorkspaceHeading({ title, description, actions }: {
  title: string; description: string; actions?: ComponentChildren;
}) {
  return <Stack direction={{ xs: "column", sm: "row" }} gap={2} alignItems={{ sm: "center" }}
    justifyContent="space-between">
    <Box sx={{ minWidth: 0 }}>
      <Typography component="h1" variant="h4" fontWeight={750} sx={{ color: "text.primary", letterSpacing: "-.025em" }}>
        {title}
      </Typography>
      <Typography color="text.secondary" sx={{ mt: 0.75 }}>{description}</Typography>
    </Box>
    {actions && <Box sx={{ flexShrink: 0 }}>{actions}</Box>}
  </Stack>;
}
