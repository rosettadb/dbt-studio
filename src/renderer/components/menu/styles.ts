import { Box, styled, Switch, Toolbar } from '@mui/material';

export const StyledToolbar = styled(Toolbar)(({ theme }) => ({
  background: theme.palette.background.paper,
  borderBottom: `1px solid ${theme.palette.divider}`,
  minHeight: '36px !important',
  height: 36,
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

export const BranchDropdownToggle = styled('div')(() => ({
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  fontSize: '0.8rem',
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
        backgroundColor: theme.palette.action.selected,
        opacity: 1,
        border: 0,
      },
    },
  },
  '& .MuiSwitch-thumb': {
    boxSizing: 'border-box',
    width: 16,
    height: 16,
    backgroundColor: theme.palette.primary.main,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  '& .MuiSwitch-track': {
    borderRadius: 20 / 2,
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
    left: 'calc(50% + 8px)',
  },
  '&.unchecked': {
    left: 'calc(50% - 8px)',
  },
}));

export const AuthButtonContent = styled('div')(({ theme }) => ({
  display: 'flex',
  alignItems: 'center',
  gap: 6,
  color: theme.palette.text.primary,
}));

export const AuthIcon = styled('img')(() => ({
  width: 14,
  height: 14,
}));

export const AuthLabel = styled('span')(({ theme }) => ({
  fontWeight: 400,
  fontSize: '0.7rem',
  color: theme.palette.text.primary,
}));
