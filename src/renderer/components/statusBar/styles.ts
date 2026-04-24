import { Box, styled, Switch } from '@mui/material';

export const StatusBarContainer = styled(Box)(({ theme }) => ({
  position: 'fixed',
  bottom: 0,
  left: 0,
  right: 0,
  height: 24,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  backgroundColor:
    theme.palette.mode === 'dark'
      ? theme.palette.background.paper
      : theme.palette.primary.dark,
  borderTop: `1px solid ${theme.palette.divider}`,
  paddingLeft: 12,
  paddingRight: 12,
  zIndex: 1100,
  userSelect: 'none',
}));

export const StatusBarSection = styled(Box)(() => ({
  display: 'flex',
  alignItems: 'center',
  gap: 12,
  height: '100%',
}));

export const StatusBarItem = styled(Box)(({ theme }) => ({
  display: 'flex',
  alignItems: 'center',
  gap: 4,
  fontSize: '0.7rem',
  fontWeight: 400,
  color:
    theme.palette.mode === 'dark'
      ? theme.palette.text.secondary
      : 'rgba(255, 255, 255, 0.85)',
  cursor: 'default',
  padding: '0 6px',
  height: '100%',
  transition: 'background-color 0.15s ease',

  '&:hover': {
    backgroundColor:
      theme.palette.mode === 'dark'
        ? theme.palette.action.hover
        : 'rgba(255, 255, 255, 0.1)',
  },
}));

export const StatusBarClickableItem = styled(StatusBarItem)(() => ({
  cursor: 'pointer',
}));

export const StatusBarDivider = styled(Box)(({ theme }) => ({
  width: 1,
  height: 14,
  backgroundColor:
    theme.palette.mode === 'dark'
      ? theme.palette.divider
      : 'rgba(255, 255, 255, 0.2)',
}));

export const EnvSwitch = styled(Switch)(({ theme }) => ({
  width: 28,
  height: 16,
  padding: 0,
  '& .MuiSwitch-switchBase': {
    padding: 0,
    margin: 2,
    transitionDuration: '200ms',
    '&.Mui-checked': {
      transform: 'translateX(12px)',
      '& + .MuiSwitch-track': {
        backgroundColor:
          theme.palette.mode === 'dark'
            ? theme.palette.action.selected
            : 'rgba(255, 255, 255, 0.3)',
        opacity: 1,
      },
    },
  },
  '& .MuiSwitch-thumb': {
    boxSizing: 'border-box',
    width: 12,
    height: 12,
    backgroundColor:
      theme.palette.mode === 'dark' ? theme.palette.primary.main : '#fff',
  },
  '& .MuiSwitch-track': {
    borderRadius: 16 / 2,
    backgroundColor:
      theme.palette.mode === 'dark'
        ? theme.palette.action.selected
        : 'rgba(255, 255, 255, 0.3)',
    opacity: 1,
  },
}));
