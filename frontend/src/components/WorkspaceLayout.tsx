import { Box, Button, Divider, Drawer, IconButton, List, ListItemButton, Stack, Tooltip, Typography, useMediaQuery, useTheme } from "@mui/material";
import type { ComponentChildren } from "preact";
import { useState } from "preact/hooks";
import { WorkspaceIcon } from "./WorkspaceUI";
import { workspaceSections, type WorkspacePage, type WorkspaceRole } from "./workspaceSections";

export default function WorkspaceLayout({ role, page, onPageChange, onLogout, children }: {
  role: WorkspaceRole; page: WorkspacePage; onPageChange: (page: WorkspacePage) => void;
  onLogout: () => void; children: ComponentChildren;
}) {
  const theme = useTheme();
  const mobile = useMediaQuery(theme.breakpoints.down("md"));
  const [open, setOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const compact = !mobile && collapsed;
  const width = compact ? 64 : 244;
  const groups = workspaceSections[role];
  const title = groups.flatMap(group => [...group.items]).find(item => item.id === page)?.label;
  const select = (next: WorkspacePage) => {
    onPageChange(next);
    setOpen(false);
  };
  return <Box sx={{ display: "flex", minHeight: "100vh", bgcolor: "background.default" }}>
    <Drawer variant={mobile ? "temporary" : "permanent"} open={!mobile || open} onClose={() => setOpen(false)}
      sx={{ flexShrink: 0, width: mobile ? undefined : width }}
      slotProps={{ paper: { sx: { width, boxSizing: "border-box", borderRadius: 0 } } }}>
      <Stack sx={{ minHeight: "100%" }}>
        <Button onClick={() => select(role === "farmer" ? "overview" : "market")} aria-label="Croprithm workspace home"
          sx={{ minHeight: 64, justifyContent: compact ? "center" : "flex-start", gap: 1, px: 2, color: "text.primary" }}>
          <img src="/croprithm-icon.svg" width="30" height="30" alt="" />
          {!compact && <Typography fontWeight={800}>Croprithm</Typography>}
        </Button>
        <Divider />
        <Box component="nav" aria-label="Workspace navigation" sx={{ flex: 1, py: 1 }}>
          {groups.map(group => <Box key={group.label}>
            {!compact && <Typography variant="caption" sx={{ display: "block", px: 2.5, mt: 1.5, color: "text.secondary", fontWeight: 700 }}>
              {group.label}
            </Typography>}
            <List disablePadding>
              {group.items.map(item => <Box component="li" key={item.id} sx={{ listStyle: "none" }}>
                <Tooltip title={compact ? item.label : ""} placement="right">
                  <ListItemButton component="button" type="button" aria-label={item.label}
                    aria-current={page === item.id ? "page" : undefined} selected={page === item.id}
                    onClick={() => select(item.id)}
                    sx={{ mx: 1, my: 0.4, width: "calc(100% - 16px)", minHeight: 44, gap: 1.25, borderRadius: 2,
                      justifyContent: compact ? "center" : "flex-start", px: compact ? 0 : 1.5,
                      "&.Mui-selected": { color: "primary.contrastText", bgcolor: "primary.main",
                        "&:hover": { bgcolor: "primary.main" } } }}>
                    <WorkspaceIcon name={item.icon} />
                    {!compact && <Typography component="span" variant="inherit" fontWeight={650}>{item.label}</Typography>}
                  </ListItemButton>
                </Tooltip>
              </Box>)}
            </List>
          </Box>)}
        </Box>
        <Divider />
        <Stack direction={compact ? "column" : "row"} sx={{ p: 1, alignItems: "center", justifyContent: "space-between" }}>
          <Button aria-label="Sign out" onClick={onLogout} sx={{ minWidth: 44, gap: 1, color: "text.primary" }}>
            <WorkspaceIcon name="logout" />{!compact && "Sign out"}
          </Button>
          {!mobile && <IconButton aria-label={compact ? "Expand navigation" : "Collapse navigation"} onClick={() => setCollapsed(!collapsed)}>
            <WorkspaceIcon name={compact ? "expand" : "collapse"} />
          </IconButton>}
        </Stack>
      </Stack>
    </Drawer>
    <Box sx={{ flex: 1, minWidth: 0 }}>
      <Stack component="header" direction="row" alignItems="center" justifyContent="space-between" gap={1}
        sx={{ position: "sticky", top: 0, zIndex: theme.zIndex.appBar, minHeight: 64,
          px: { xs: 2, md: 3 }, bgcolor: "background.paper", borderBottom: 1, borderColor: "divider" }}>
        <Stack direction="row" gap={1} alignItems="center" minWidth={0}>
          {mobile && <IconButton edge="start" onClick={() => setOpen(true)} aria-label="Open navigation" aria-expanded={open}>
            <WorkspaceIcon name="menu" />
          </IconButton>}
          <Typography noWrap fontWeight={700}>{title}</Typography>
        </Stack>
        <Button onClick={() => select("settings")} startIcon={<WorkspaceIcon name="account" />}>Account</Button>
      </Stack>
      <Box component="main" sx={{ p: { xs: 2, sm: 3, lg: 4 }, maxWidth: 1440, mx: "auto" }}>
        {children}
      </Box>
    </Box>
  </Box>;
}
