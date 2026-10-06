import { styled } from '@mui/material';
import { NavLink } from 'react-router-dom';

export const Container = styled('div')(() => ({
  display: 'flex',
  height: '100%',
  width: '100%',
  alignItems: 'flex-start',
  justifyContent: 'flex-start',
}));

export const StyledForm = styled('form')(({ theme }) => ({
  display: 'flex',
  minWidth: 600,
  minHeight: '100%',
  flexDirection: 'column',
  gap: theme.spacing(2),
  padding: '22px 28px 40px',
  backgroundColor: theme.palette.background.paper,
  width: '100%',
}));

export const Title = styled('h1')(() => ({
  margin: 0,
  fontSize: 18,
  fontWeight: 600,
  lineHeight: 1.4,
}));

export const Description = styled('p')(({ theme }) => ({
  margin: 0,
  fontSize: 12.5,
  color: theme.palette.text.secondary,
}));

export const StyledSettingsNavLink = styled(NavLink)(({ theme }) => ({
  textDecoration: 'none',
  color: theme.palette.grey[600],
  display: 'block',
  width: '100%',
  marginBottom: '2px',
  '&.active': {
    color: theme.palette.primary.main,
    textDecoration: 'none',
  },
  '&:hover': {
    color: theme.palette.primary.main,
    '& .MuiListItem-root': {
      backgroundColor: theme.palette.action.hover,
    },
  },
}));
