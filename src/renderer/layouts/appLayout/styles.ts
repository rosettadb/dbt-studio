import { styled } from '@mui/material';

export const Root = styled('div')(() => ({
  display: 'flex',
  flexDirection: 'column',
  height: '100vh',
}));

export const ContentColumn = styled('div')(() => ({
  display: 'flex',
  flexDirection: 'column',
  flexGrow: 1,
  minWidth: 0,
  height: 'calc(100vh - 24px)',
}));

export const Content = styled('main')(() => ({
  flexGrow: 1,
  minHeight: 0,
}));

export const Main = styled('div')(() => ({
  paddingTop: 2,
  height: 'calc(100vh - 64px)',
  overflowY: 'auto',
  overflowX: 'hidden',
  display: 'flex',
  flexDirection: 'column',
  flex: 1,
}));
