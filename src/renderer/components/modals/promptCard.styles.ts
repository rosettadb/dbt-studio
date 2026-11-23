import { styled } from '@mui/material';

// The card a prompt or generated query sits in, in the AI dialogs.
export const Container = styled('div')(({ theme }) => ({
  padding: 16,
  background:
    theme.palette.mode === 'dark' ? theme.palette.background.paper : '#fafafa',
  borderRadius: 8,
  marginBottom: 10,
  cursor: 'pointer',
}));
