import { createTheme } from '@mui/material/styles';
import { grey, red, yellow } from '@mui/material/colors';

// Define theme with both light and dark color schemes
const theme = createTheme({
  colorSchemes: {
    light: {
      palette: {
        mode: 'light',
        primary: {
          light: '#4f83cc', // Lighter blue-gray
          main: '#2c5282', // Attractive blue-gray for light mode (replacing dark gray)
          dark: '#1a365d', // Deeper blue-gray
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
          secondary: grey[700],
          disabled: grey[400],
        },
        background: {
          default: '#f5f5f5',
          paper: '#fafafa',
        },
        divider: 'rgba(0, 0, 0, 0.12)',
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
          primary: '#ffffff',
          secondary: grey[400],
          disabled: grey[600],
        },
        background: {
          default: '#121212',
          paper: '#1e1e1e',
        },
        divider: 'rgba(255, 255, 255, 0.12)',
      },
    },
  },
  components: {
    MuiAppBar: {
      styleOverrides: {
        root: {
          boxShadow: '0px 1px 3px 0px rgba(0,0,0,0.08)',
        },
      },
      defaultProps: {
        color: 'default',
      },
    },
    MuiCard: {
      styleOverrides: {
        root: {
          borderRadius: '8px',
          boxShadow: '0px 2px 4px rgba(0,0,0,0.05)',
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
          borderRadius: '6px',
          textTransform: 'none',
          fontWeight: 500,
        },
        containedPrimary: {
          '&:hover': {
            boxShadow: '0px 4px 8px rgba(0, 0, 0, 0.15)',
          },
        },
      },
    },
  },
  typography: {
    fontFamily: '"Roboto", "Helvetica", "Arial", sans-serif',
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
  },
  shape: {
    borderRadius: 8,
  },
});

export default theme;
