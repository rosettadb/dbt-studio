import { styled } from '@mui/material';

export const Root = styled('div')(() => ({
  display: 'flex',
  height: '100vh',
}));

// Column to the right of the sidebar: menu on top, content below
export const ContentColumn = styled('div')(() => ({
  display: 'flex',
  flexDirection: 'column',
  flexGrow: 1,
  minWidth: 0, // prevent flex overflow
  height: 'calc(100vh - 24px)', // minus status bar
}));

export const Content = styled('main')(() => ({
  flexGrow: 1,
  minHeight: 0, // allow flex child to shrink
}));

export const Main = styled('div')(() => ({
  paddingTop: 2,
  paddingLeft: 2,
  height: '100%',
  overflow: 'auto',
  display: 'flex',
  flexDirection: 'column',
}));
