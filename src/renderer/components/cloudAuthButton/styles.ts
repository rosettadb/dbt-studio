import { styled } from '@mui/material';

export const AuthButtonContent = styled('div')(({ theme }) => ({
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  color: theme.palette.text.primary,
}));

export const AuthIcon = styled('img')(() => ({
  width: 14,
  height: 14,
}));

export const AuthLabel = styled('span')(({ theme }) => ({
  fontWeight: 300,
  fontSize: '0.75rem',
  color: theme.palette.text.primary,
}));
