import { Box, styled, Switch, Toolbar } from '@mui/material';

export const StyledToolbar = styled(Toolbar)(({ theme }) => ({
  background: theme.palette.background.paper,
  minHeight: 40,
  display: 'flex',
  justifyContent: 'space-between',
}));

export const IconsContainer = styled('div')(() => ({
  display: 'flex',
  alignItems: 'center',
  marginBottom: '-4px',
}));

export const Logo = styled('img')(() => ({
  marginLeft: 10,
  width: 140,
  height: 40,
  cursor: 'pointer',
}));

export const BranchDropdownToggle = styled('div')(() => ({
  display: 'flex',
  alignItems: 'center',
  gap: 10,
}));

export const EnvironmentSwitchContainer = styled(Box)(() => ({
  position: 'relative',
  display: 'inline-flex',
  alignItems: 'center',
}));

export const EnvironmentSwitch = styled(Switch)(({ theme }) => ({
  width: 42,
  height: 24,
  padding: 0,
  '& .MuiSwitch-switchBase': {
    padding: 0,
    margin: 2,
    transitionDuration: '300ms',
    '&.Mui-checked': {
      transform: 'translateX(18px)',
      '& + .MuiSwitch-track': {
        backgroundColor: theme.palette.action.selected,
        opacity: 1,
        border: 0,
      },
    },
  },
  '& .MuiSwitch-thumb': {
    boxSizing: 'border-box',
    width: 20,
    height: 20,
    backgroundColor: theme.palette.primary.main,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  '& .MuiSwitch-track': {
    borderRadius: 24 / 2,
    backgroundColor: theme.palette.action.selected,
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
    left: 'calc(50% + 9px)',
  },
  '&.unchecked': {
    left: 'calc(50% - 9px)',
  },
}));
