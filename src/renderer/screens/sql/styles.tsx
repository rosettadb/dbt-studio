import { styled } from '@mui/material';

export const Container = styled('div')(() => ({
  display: 'flex',
  height: '100%',
  gap: '1rem',
  alignItems: 'center',
  justifyContent: 'space-between',
}));

export const SchemaViewContainer = styled('div')(({ theme }) => ({
  display: 'flex',
  flexDirection: 'column',
  gap: 10,
  background: theme.palette.background.paper,
  borderRadius: 8,
  padding: '5px',
  height: '100%',
  width: 310,
}));

export const SchemaViewGrid = styled('div')(() => ({
  overflowY: 'auto',
  height: '100%',
}));

export const Inputs = styled('div')(({ theme }) => ({
  display: 'flex',
  flexDirection: 'column',
  background: theme.palette.background.paper,
  height: '100%',
  flex: 1,
}));

export const RelativeContainer = styled('div')(() => ({
  position: 'relative',
  height: '100%',
}));
