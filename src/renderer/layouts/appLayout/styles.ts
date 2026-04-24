import { styled } from '@mui/material';

export const Root = styled('div')(() => ({
  display: 'flex',
  flexDirection: 'column',
  height: '100vh',
}));

export const Content = styled('main')(() => ({
  flexGrow: 1,
  display: 'flex',
  flexDirection: 'column',
  overflow: 'hidden',
}));

export const Main = styled('div')(() => ({
  paddingTop: 4,
  paddingLeft: 2,
  marginTop: '38px',
  height: 'calc(100vh - 60px)', // 38px top bar + 22px status bar
  overflow: 'auto',
  display: 'flex',
  flexDirection: 'column',
  flex: 1,
}));
