import {
  AppBar,
  Toolbar,
  Tooltip,
  Button,
  IconButton,
  Box,
  Typography,
  Breadcrumbs,
  Link as MuiLink,
} from "@mui/material";
import { brandPalette } from "../branding";
import { Link as RouterLink } from "react-router-dom";
import { MenuIcon, AvatarIcon } from "./SVGIcons";
import { useTheme } from "@mui/material/styles";
import { HomeIcon } from "./SVGIcons";

interface DashboardAppBarProps {
  isMobile: boolean;
  onMenuClick: () => void;
  onAccount: () => void;
  breadcrumb: { title: string; path: string }; // New prop for dynamic breadcrumb
}

const DashboardAppBar = ({
  isMobile,
  onMenuClick,
  onAccount,
  breadcrumb,
}: DashboardAppBarProps) => {
  const theme = useTheme();

  return (
    <Box
      sx={{
        width: { md: "100%" },
        ml: { md: "5px" },
        mt: { md: 0 },
        transition: "width 0.2s, margin-left 0.2s",
        display: "flex",
        flexDirection: "row",
      }}
    >
      <AppBar
        position="static"
        variant="outlined"
        sx={{
          boxShadow: theme.shadows[1],
          background: `linear-gradient(90deg, ${brandPalette.primary.main} 0%, ${brandPalette.secondary.main} 100%)`,
          border: 0,
        }}
        elevation={0}
      >
        <Toolbar sx={{ display: "flex", justifyContent: "space-between" }}>
          <Box sx={{ display: "flex", alignItems: "center", gap: 2 }}>
            {isMobile && (
              <IconButton edge="start" onClick={onMenuClick}>
                <MenuIcon />
              </IconButton>
            )}

            {/* Dynamic Breadcrumbs */}
            <Breadcrumbs aria-label="breadcrumb">
              <MuiLink
                component={RouterLink}
                to="/dashboard"
                underline="hover"
                sx={{ display: "flex", alignItems: "center", fontWeight: 700, color: brandPalette.primary.contrastText }}
              >
                <HomeIcon />
                <Box component="span" sx={{ ml: 0.5 }}>Croprithm</Box>
              </MuiLink>
              <Typography sx={{ color: brandPalette.primary.contrastText }}>/</Typography>
              <Typography sx={{ color: brandPalette.primary.contrastText, fontWeight: 700 }}>{breadcrumb.title}</Typography>
            </Breadcrumbs>
          </Box>

          {/* Account Button */}
          <Tooltip title="Account Settings">
            <Button
              onClick={onAccount}
              startIcon={<AvatarIcon />}
              variant="contained"
              sx={{
                backgroundColor: brandPalette.primary.contrastText,
                color: brandPalette.primary.main,
                fontWeight: 700,
                fontFamily: theme.typography.fontFamily,
                minWidth: 0,
                boxShadow: '0 2px 8px rgba(58,131,116,0.08)',
                ':hover': {
                  backgroundColor: brandPalette.accent.main,
                  borderColor: brandPalette.secondary.main,
                  color: brandPalette.neutral.main,
                },
              }}
            >
              Account
            </Button>
          </Tooltip>
        </Toolbar>
      </AppBar>
    </Box>
  );
};

export default DashboardAppBar;