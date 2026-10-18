import { createTheme } from "@mui/material/styles";

 // Brand palette
// Updated Brand palette for Croprithm based on logo

export const brandPalette = {
  primary: {
    main: "#3A8374", // Teal green from truck/map icon
    contrastText: "#FFFFFF",
  },
  secondary: {
    main: "#60B393", // Soft green used for CROPRITHM text
    contrastText: "#1F3E37",
  },
  accent: {
    main: "#A4D8C2", // Light mint for hover or highlight
    contrastText: "#1F3E37",
  },
  neutral: {
    main: "#2F2F2F", // Charcoal for text/UI
    contrastText: "#FAFAFA",
  },
  background: {
    default: "#F8FAF9", // Light background similar to logo background
    paper: "#FFFFFF",
  },
  text: {
    primary: "#1F3E37", // Deep greenish text color
    secondary: "#3A8374", // Teal for highlights or headings
    disabled: "#A0A0A0",
  },
  error: {
    main: "#E57373", // Standard material red
    contrastText: "#FFFFFF",
  },
  warning: {
    main: "#FFB74D",
    contrastText: "#1F3E37",
  },
  success: {
    main: "#60B393", // Echoes the logo green
    contrastText: "#FFFFFF",
  },
};


export const theme = createTheme({
  palette: {
    mode: "light",
    primary: brandPalette.primary,
    secondary: brandPalette.secondary,
    background: brandPalette.background,
    text: brandPalette.text,
    error: brandPalette.error,
    warning: brandPalette.warning,
    success: brandPalette.success,
    // Custom accent color for highlights
    // accent: brandPalette.accent, // Removed because 'accent' is not a valid PaletteOptions property
  },
  typography: {
    fontFamily: [
      'Inter',
      'Poppins',
      'system-ui',
      'sans-serif'
    ].join(','),
    h1: { color: brandPalette.primary.main, fontFamily: 'Poppins, Inter, sans-serif' },
    h2: { color: brandPalette.primary.main, fontFamily: 'Poppins, Inter, sans-serif' },
    h3: { color: brandPalette.primary.main, fontFamily: 'Poppins, Inter, sans-serif' },
    h4: { color: brandPalette.primary.main, fontFamily: 'Poppins, Inter, sans-serif' },
    h5: { color: brandPalette.primary.main, fontFamily: 'Poppins, Inter, sans-serif' },
    h6: { color: brandPalette.primary.main, fontFamily: 'Poppins, Inter, sans-serif' },
    body1: { color: brandPalette.text.primary, fontFamily: 'Inter, Poppins, sans-serif' },
    body2: { color: brandPalette.text.primary, fontFamily: 'Inter, Poppins, sans-serif' },
  },
  components: {
    MuiButton: {
      styleOverrides: {
        root: {
          borderRadius: 8,
          fontWeight: 600,
          textTransform: "none",
          fontFamily: 'Inter, Poppins, sans-serif',
        },
        containedPrimary: {
          backgroundColor: brandPalette.primary.main,
          color: brandPalette.primary.contrastText,
          '&:hover': {
            backgroundColor: brandPalette.secondary.main,
          },
        },
        outlinedPrimary: {
          borderColor: brandPalette.primary.main,
          color: brandPalette.primary.main,
          '&:hover': {
            backgroundColor: brandPalette.secondary.main,
            borderColor: brandPalette.primary.main,
          },
        },
        containedSecondary: {
          backgroundColor: brandPalette.secondary.main,
          color: brandPalette.secondary.contrastText,
        },
        outlinedSecondary: {
          borderColor: brandPalette.secondary.main,
          color: brandPalette.secondary.main,
        },
      },
    },
    MuiPaper: {
      styleOverrides: {
        root: {
          backgroundColor: brandPalette.background.paper,
          borderRadius: 16,
        },
      },
    },
    MuiAppBar: {
      styleOverrides: {
        root: {
          backgroundColor: brandPalette.background.paper,
          color: brandPalette.primary.contrastText,
          fontFamily: 'Poppins, Inter, sans-serif',
        },
      },
    },
    MuiDrawer: {
      styleOverrides: {
        paper: {
          backgroundColor: brandPalette.primary.main,
          color: brandPalette.neutral.main,
        },
      },
    },
    MuiCard: {
      styleOverrides: {
        root: {
          borderRadius: 20,
          backgroundColor: brandPalette.background.paper,
        },
      },
    },
    MuiTypography: {
      styleOverrides: {
        root: {
          fontFamily: 'Inter, Poppins, sans-serif',
        },
      },
    },
    MuiListItemButton: {
      styleOverrides: {
        root: {
          '&.Mui-selected': {
            backgroundColor: brandPalette.background.paper,
            color: brandPalette.primary.contrastText,
            '& .MuiListItemIcon-root': {
              color: brandPalette.primary.contrastText,
            },
          },
          '&:hover': {
            backgroundColor: brandPalette.accent.main,
          },
        },
      },
    },
    MuiListItemIcon: {
      styleOverrides: {
        root: {
          color: brandPalette.neutral.main,
        },
      },
    },
    MuiAlert: {
      styleOverrides: {
        standardError: {
          backgroundColor: brandPalette.accent.main,
          color: brandPalette.accent.contrastText,
        },
        standardWarning: {
          backgroundColor: brandPalette.accent.main,
          color: brandPalette.accent.contrastText,
        },
      },
    },
  },
});