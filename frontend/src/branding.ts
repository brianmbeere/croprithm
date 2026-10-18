import { createTheme } from "@mui/material/styles";

 // Brand palette
// Updated Brand palette for Croprithm based on logo

export const brandPalette = {
  primary: {
    main: "#3A8374",
    contrastText: "#000000",
  },
  secondary: {
    main: "#365D54",
    contrastText: "#FFFFFF",
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
    default: "#F4F6F3",
    paper: "#FFFFFF",
  },
  text: {
    primary: "#1F3E37", // Deep greenish text color
    secondary: "#53645F",
    disabled: "#A0A0A0",
  },
  error: {
    main: "#B42318",
    contrastText: "#FFFFFF",
  },
  warning: {
    main: "#925C13",
    contrastText: "#1F3E37",
  },
  success: {
    main: "#206451",
    contrastText: "#FFFFFF",
  },
};


const baseTheme = createTheme({
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

export const theme = createTheme(baseTheme, {
  shape: { borderRadius: 12 },
  typography: {
    fontFamily: 'Inter, system-ui, -apple-system, sans-serif',
    h1: { fontSize: 'clamp(2.4rem, 6vw, 4.6rem)', fontWeight: 750, lineHeight: 1.08, letterSpacing: '-0.045em' },
    h2: { fontSize: 'clamp(2rem, 4vw, 3.2rem)', fontWeight: 700, letterSpacing: '-0.035em' },
    h3: { fontSize: 'clamp(1.75rem, 3vw, 2.5rem)', fontWeight: 700 },
    h4: { fontSize: 'clamp(1.5rem, 2.5vw, 2rem)', fontWeight: 700, letterSpacing: '-0.025em' },
    h5: { fontSize: '1.35rem', fontWeight: 700 },
    h6: { fontSize: '1.1rem', fontWeight: 650 },
    body1: { lineHeight: 1.65, color: 'inherit' }, body2: { lineHeight: 1.6, color: 'inherit' },
  },
  components: {
    MuiCssBaseline: { styleOverrides: {
      html: { scrollBehavior: 'smooth' },
      body: { margin: 0 },
      '*': { boxSizing: 'border-box' },
      'a, button, input, [tabindex]': { '&:focus-visible': { outline: '3px solid #925C13', outlineOffset: 3 } },
      '@media (prefers-reduced-motion: reduce)': { '*': { animationDuration: '0.01ms !important', transitionDuration: '0.01ms !important', scrollBehavior: 'auto !important' } },
    } },
    MuiButton: { defaultProps: { disableElevation: true }, styleOverrides: {
      root: { minHeight: 44, borderRadius: 10, padding: '10px 18px', letterSpacing: 0 },
      containedPrimary: { '&:hover': { backgroundColor: '#4A9686' } },
      outlinedPrimary: { '&:hover': { backgroundColor: '#E7EFEA' } },
    } },
    MuiIconButton: { styleOverrides: { root: { minWidth: 44, minHeight: 44 } } },
    MuiPaper: { styleOverrides: { root: { backgroundImage: 'none' }, elevation1: { boxShadow: '0 2px 12px #173D2D08', border: '1px solid #DFE6E0' } } },
    MuiCard: { styleOverrides: { root: { borderRadius: 16, boxShadow: '0 2px 12px #173D2D08', border: '1px solid #DFE6E0' } } },
    MuiCardContent: { styleOverrides: { root: { padding: 24 } } },
    MuiAppBar: { styleOverrides: { root: { backgroundColor: '#FFFFFF', color: '#1F3E37', boxShadow: 'none', borderRadius: 0, borderBottom: '1px solid #DFE6E0' } } },
    MuiDrawer: { styleOverrides: { paper: { backgroundColor: '#FFFFFF', color: '#1F3E37', borderRadius: 0, borderRight: '1px solid #DFE6E0' } } },
    MuiListItemButton: { styleOverrides: { root: { '&.Mui-selected': { backgroundColor: '#3A8374', color: '#000000' } } } },
    MuiAlert: { styleOverrides: { standardError: { backgroundColor: '#FEF3F2', color: '#912018' }, standardWarning: { backgroundColor: '#FFFAEB', color: '#794C10' } } },
    MuiTextField: { defaultProps: { variant: 'outlined' } },
    MuiTableContainer: { styleOverrides: { root: { overflowX: 'auto' } } },
    MuiTableCell: { styleOverrides: { head: { backgroundColor: '#F4F6F3', color: '#53645F', fontWeight: 650 }, root: { borderColor: '#E5EAE5' } } },
    MuiTabs: { defaultProps: { variant: 'scrollable', scrollButtons: 'auto' } },
  },
});