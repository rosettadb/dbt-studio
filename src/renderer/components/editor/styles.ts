import { styled } from '@mui/material/styles';
import { Box } from '@mui/material';

export const Container = styled('div')(() => ({
  display: 'flex',
  flexDirection: 'column',
  height: '100%',
  position: 'relative',
  minHeight: 0,
}));

export const EditorViewport = styled(Box)(() => ({
  flex: 1,
  position: 'relative',
  minHeight: 0,
  display: 'flex',
  flexDirection: 'column',
}));
