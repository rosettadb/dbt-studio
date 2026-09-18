import { styled } from '@mui/material/styles';
import { Box, Typography, Card, CardContent } from '@mui/material';

export const DashboardContainer = styled(Box)(({ theme }) => ({
  display: 'flex',
  flexDirection: 'column',
  height: '100%',
  width: '100%',
  background: theme.palette.background.default,
  padding: theme.spacing(6),
  boxSizing: 'border-box',
  overflowY: 'auto',
  alignItems: 'center',
  justifyContent: 'center',
}));

export const CardsGrid = styled(Box)(({ theme }) => ({
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
  gap: theme.spacing(4),
  width: '100%',
  maxWidth: '1200px',
}));

export const FeatureCard = styled(Card)(({ theme }) => ({
  position: 'relative',
  background: theme.palette.background.paper,
  border: `1px solid ${theme.palette.divider}`,
  borderRadius: theme.spacing(2),
  overflow: 'hidden',
  transition: 'all 0.25s ease-in-out',
  cursor: 'pointer',
  height: '100%',
  display: 'flex',
  flexDirection: 'column',

  '&:hover': {
    transform: 'translateY(-4px)',
    boxShadow:
      theme.palette.mode === 'dark'
        ? '0 12px 24px rgba(255, 107, 0, 0.2)'
        : '0 12px 24px rgba(255, 107, 0, 0.15)',
    borderColor: '#ff6b00',

    '& .icon-container': {
      transform: 'scale(1.08)',
      color: '#ff6b00',
      background: 'rgba(255, 107, 0, 0.15)',
    },

    '& .arrow-icon': {
      transform: 'translateX(4px)',
      opacity: 1,
    },
  },
}));

export const CardContentWrapper = styled(CardContent)(({ theme }) => ({
  padding: theme.spacing(4, 3),
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  textAlign: 'center',
  height: '100%',
  position: 'relative',
  zIndex: 1,
  '&:last-child': {
    paddingBottom: theme.spacing(4),
  },
}));

export const IconContainer = styled(Box)(({ theme }) => ({
  width: '60px',
  height: '60px',
  borderRadius: '14px',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  marginBottom: theme.spacing(2),
  background: 'rgba(255, 107, 0, 0.1)',
  color: '#ff6b00',
  transition: 'all 0.25s ease',

  '& svg': {
    fontSize: '30px',
  },
}));

export const CardTitle = styled(Typography)(({ theme }) => ({
  fontWeight: 700,
  fontSize: '1.15rem',
  color: theme.palette.text.primary,
}));
