import { createTheme } from "@mui/material/styles";

/**
 * MUI theme mirrored from the app's CSS design tokens (see src/index.css) so the
 * MUI-powered game grid feels at home next to the shadcn/Tailwind chrome.
 * Keep these values in sync with the `:root` HSL variables.
 */
export const muiTheme = createTheme({
  palette: {
    mode: "dark",
    primary: { main: "hsl(24, 95%, 53%)", contrastText: "hsl(24, 60%, 6%)" },
    secondary: { main: "hsl(16, 90%, 55%)" },
    success: { main: "hsl(142, 66%, 45%)" },
    warning: { main: "hsl(41, 96%, 55%)" },
    error: { main: "hsl(0, 72%, 51%)" },
    background: {
      default: "hsl(20, 9%, 6%)",
      paper: "hsl(24, 8%, 10%)",
    },
    text: {
      primary: "hsl(30, 10%, 96%)",
      secondary: "hsl(28, 6%, 64%)",
    },
    divider: "hsl(24, 7%, 18%)",
  },
  shape: { borderRadius: 12 },
  typography: {
    fontFamily:
      'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
  },
  components: {
    MuiPaper: {
      // Kill MUI's default elevation-overlay gradient; we set our own surfaces.
      styleOverrides: { root: { backgroundImage: "none" } },
    },
  },
});
