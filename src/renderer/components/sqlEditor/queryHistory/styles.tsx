import { styled } from '@mui/material';

export const Container = styled('div')(({ theme }) => ({
  padding: 16,
  background:
    theme.palette.mode === 'dark' ? theme.palette.background.paper : '#fafafa',
  borderRadius: 8,
  marginBottom: 10,
  cursor: 'pointer',
}));
