import { styled } from '@mui/material/styles';

export const Container = styled('div')(() => ({
  display: 'flex',
  flexDirection: 'column',
  height: '100%',
  position: 'relative',
  minHeight: 0,
}));

export const EditorViewport = styled('div')(() => ({
  flex: 1,
  position: 'relative',
  minHeight: 0,
  display: 'flex',
  flexDirection: 'column',
}));
