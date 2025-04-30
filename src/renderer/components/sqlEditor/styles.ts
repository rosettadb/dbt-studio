import { styled } from '@mui/material/styles';

export const Container = styled('div')(() => ({
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
