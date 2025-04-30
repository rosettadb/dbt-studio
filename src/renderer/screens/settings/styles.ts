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
  minHeight: 400,
  flexDirection: 'column',
  gap: theme.spacing(2),
  padding: theme.spacing(4),
  backgroundColor: theme.palette.background.paper,
  width: '100%',
}));

export const Title = styled('h1')(() => ({}));

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
