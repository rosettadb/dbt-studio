import { styled } from '@mui/material';

export const Root = styled('div')(() => ({
  display: 'flex',
}));

export const Content = styled('main')(() => ({
  flexGrow: 1,
}));

export const Main = styled('div')(() => ({
  paddingTop: 4,
  paddingLeft: 2,
  marginTop: '38px',
  height: 'calc(100vh - 40px)',
  overflowY: 'auto',
}));
