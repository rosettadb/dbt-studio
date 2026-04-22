import { createTheme } from '@mui/material/styles';
import { grey, red, yellow } from '@mui/material/colors';

const theme = createTheme({
  colorSchemes: {
    light: {
      palette: {
        mode: 'light',
        primary: {
          light: '#4f83cc',
          main: '#2c5282',
          dark: '#1a365d',
          contrastText: '#ffffff',
        },
        secondary: {
          main: red[500],
          contrastText: '#fff',
        },
        error: {
          main: red[700],
        },
        warning: {
          main: yellow[700],
        },
        info: {
          main: '#4a90e2',
        },
        success: {
          main: '#4caf50',
        },
        text: {
          primary: grey[900],
          secondary: grey[600],
          disabled: grey[400],
        },
        background: {
          default: '#f0f0f0',
          paper: '#ffffff',
        },
        divider: 'rgba(0, 0, 0, 0.08)',
      },
    },
    dark: {
      palette: {
        mode: 'dark',
        primary: {
          light: '#e0e0e0',
          main: '#bdbdbd',
          dark: '#9e9e9e',
          contrastText: '#212121',
        },
        secondary: {
          main: red[400],
          contrastText: '#fff',
        },
        error: {
          main: red[500],
        },
        warning: {
          main: yellow[500],
        },
        info: {
          main: '#5d9cec',
        },
        success: {
          main: '#66bb6a',
        },
        text: {
          primary: '#cccccc',
          secondary: '#969696',
          disabled: grey[600],
        },
        background: {
          default: '#1e1e1e',
          paper: '#252526',
        },
        divider: 'rgba(255, 255, 255, 0.06)',
      },
    },
  },
  components: {
    MuiAppBar: {
      styleOverrides: {
        root: {
          boxShadow: 'none',
        },
      },
      defaultProps: {
        color: 'default',
      },
    },
    MuiCard: {
      styleOverrides: {
        root: {
          borderRadius: '6px',
          boxShadow: '0px 1px 3px rgba(0,0,0,0.08)',
        },
      },
    },
    MuiInputBase: {
      styleOverrides: {
        root: {
          height: 48,
        },
      },
    },
    MuiInputLabel: {
      styleOverrides: {
        root: {
          lineHeight: '1.1rem',
        },
      },
    },
    MuiButton: {
      styleOverrides: {
        root: {
          borderRadius: '4px',
          textTransform: 'none',
          fontWeight: 500,
        },
        containedPrimary: {
          '&:hover': {
            boxShadow: '0px 2px 6px rgba(0, 0, 0, 0.12)',
          },
        },
      },
    },
    MuiTooltip: {
      styleOverrides: {
        tooltip: {
          fontSize: '0.7rem',
          fontWeight: 400,
          borderRadius: 3,
        },
      },
    },
  },
  typography: {
    fontFamily:
      '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
    fontSize: 13,
    h1: {
      fontWeight: 500,
    },
    h2: {
      fontWeight: 500,
    },
    h3: {
      fontWeight: 500,
    },
    h4: {
      fontWeight: 500,
    },
    h5: {
      fontWeight: 500,
    },
    h6: {
      fontWeight: 500,
    },
    button: {
      fontWeight: 500,
    },
    body1: {
      fontSize: '0.875rem',
    },
    body2: {
      fontSize: '0.8125rem',
    },
  },
  shape: {
    borderRadius: 4,
  },
});

export default theme;
