import { Box, styled, Switch, Toolbar } from '@mui/material';

export const StyledToolbar = styled(Toolbar)(({ theme }) => ({
  background:
    theme.palette.mode === 'light'
      ? theme.palette.primary.main
      : theme.palette.background.paper,
  minHeight: 40,
  display: 'flex',
  justifyContent: 'space-between',
  paddingLeft: '12px !important',
  paddingRight: '8px !important',
  flexShrink: 0,
}));

export const IconsContainer = styled('div')(() => ({
  display: 'flex',
  alignItems: 'center',
  gap: 4,
}));

export const Logo = styled('img')(() => ({
  marginLeft: 10,
  width: 140,
  height: 40,
  cursor: 'pointer',
}));

export const BranchDropdownToggle = styled('div')(({ theme }) => ({
  display: 'flex',
  alignItems: 'center',
  gap: 10,
  color:
    theme.palette.mode === 'light'
      ? theme.palette.primary.contrastText
      : theme.palette.text.primary,
}));

export const EnvironmentSwitchContainer = styled(Box)(() => ({
  position: 'relative',
  display: 'inline-flex',
  alignItems: 'center',
}));

export const EnvironmentSwitch = styled(Switch)(({ theme }) => ({
  width: 36,
  height: 20,
  padding: 0,
  '& .MuiSwitch-switchBase': {
    padding: 0,
    margin: 2,
    transitionDuration: '300ms',
    '&.Mui-checked': {
      transform: 'translateX(16px)',
      '& + .MuiSwitch-track': {
        backgroundColor:
          theme.palette.mode === 'light'
            ? 'rgba(255,255,255,0.3)'
            : theme.palette.action.selected,
        opacity: 1,
        border: 0,
      },
    },
  },
  '& .MuiSwitch-thumb': {
    boxSizing: 'border-box',
    width: 20,
    height: 20,
    backgroundColor:
      theme.palette.mode === 'light'
        ? theme.palette.primary.contrastText
        : theme.palette.primary.main,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  '& .MuiSwitch-track': {
    borderRadius: 24 / 2,
    backgroundColor:
      theme.palette.mode === 'light'
        ? 'rgba(255,255,255,0.3)'
        : theme.palette.action.selected,
    opacity: 1,
    transition: theme.transitions.create(['background-color'], {
      duration: 500,
    }),
  },
}));

export const SwitchIcon = styled(Box)(({ theme }) => ({
  position: 'absolute',
  left: '50%',
  top: '50%',
  transform: 'translate(-50%, -50%)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  pointerEvents: 'none',
  zIndex: 1,
  transition: theme.transitions.create(['left'], {
    duration: 300,
  }),
  '&.checked': {
    left: 'calc(50% + 8px)',
  },
  '&.unchecked': {
    left: 'calc(50% - 8px)',
  },
}));

export const AuthButtonContent = styled('div')(({ theme }) => ({
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  color:
    theme.palette.mode === 'light'
      ? theme.palette.primary.contrastText
      : theme.palette.text.primary,
}));

export const AuthIcon = styled('img')(() => ({
  width: 14,
  height: 14,
}));

export const AuthLabel = styled('span')(({ theme }) => ({
  color: theme.palette.text.primary,
  fontWeight: 300,
  fontSize: '0.75rem',
  color:
    theme.palette.mode === 'light'
      ? theme.palette.primary.contrastText
      : theme.palette.text.primary,
}));
