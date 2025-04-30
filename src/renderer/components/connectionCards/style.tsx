import { styled } from '@mui/material/styles';
import { Box, Card, CardContent } from '@mui/material';

export const ContentBox = styled(Box)({
  borderTop: 'solid 1px #80808017',
  background: '#8080800a',
  textAlign: 'center',
  paddingBottom: '0.35rem',
});

export const CardImage = styled('img')({
  display: 'flex',
  paddingBottom: '25px',
  position: 'relative',
  width: '39%',
  height: 'auto',
  margin: 'auto',
  paddingTop: '20px',
});

export const JdbcImage = styled('img')({
  display: 'flex',
  paddingBottom: '24px',
  position: 'relative',
  width: '39%',
  height: 'auto',
  margin: 'auto',
  paddingTop: '19px',
});

export const ContentWrapper = styled(Box)({
  padding: 3,
  height: 180,
  width: 240,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  position: 'relative',
  overflow: 'hidden',
});

export const StyledCardContent = styled(CardContent)({
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
});

export const StyledCard = styled(Card)({
  maxWidth: 345,
  width: 240,
  height: 252,
  cursor: 'pointer',
  transition: 'all 0.3s ease',
  '&:hover': {
    transform: 'translateY(-4px)',
  },
});

export const MediaImage = styled('img')({
  width: 140,
});

export const FileMediaImage = styled('img')({
  width: 100,
});

export const ControlBox = styled(Box)({
  padding: 2,
});

export const ComingSoonBanner = styled(Box)(({ theme }) => ({
  position: 'absolute',
  width: '120%',
  height: '20px',
  background: `${theme.palette.primary.main}40`,  // Adding 40 for 25% opacity
  color: 'white',
  display: 'flex',
  justifyContent: 'center',
  alignItems: 'center',
  fontWeight: 'bold',
  transform: 'rotate(35deg) translateY(-50px) translateX(95px)',
  fontSize: '10px',
  top: '0px',
  right: '10px',
}));
