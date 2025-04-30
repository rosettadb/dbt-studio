import { styled, Toolbar } from '@mui/material';

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
