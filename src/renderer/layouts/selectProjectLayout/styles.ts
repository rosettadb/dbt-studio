import { styled } from '@mui/material';

export const Root = styled('div')(() => ({
  display: 'flex',
}));

export const Content = styled('main')(() => ({
  flexGrow: 1,
}));

export const Main = styled('div')(() => ({
  padding: '10px 16px',
  marginTop: '20px',
  height: 'calc(-20px + 100vh)',
  overflowY: 'auto',
}));
