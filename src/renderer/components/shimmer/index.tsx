import React from 'react';
import { styled, keyframes } from '@mui/material/styles';
import Box from '@mui/material/Box';
import { Typography } from '@mui/material';

const shimmerAnimation = keyframes`
  0% {
    background-position: 150% 150%;
  }
  100% {
    background-position: -50% -50%;
  }
`;

export const ShimmerS = styled(Box)(({ theme }) => {
  const baseColor =
    theme.palette.mode === 'dark'
      ? theme.palette.grey[900]
      : theme.palette.grey[300];

  const shimmerColor =
    theme.palette.mode === 'dark'
      ? theme.palette.grey[800]
      : theme.palette.grey[100];

  return {
    position: 'absolute',
    top: 0,
    left: 0,
    width: '100%',
    height: '100%',
    backgroundColor: baseColor,
    backgroundImage: `linear-gradient(135deg, ${baseColor} 25%, ${shimmerColor} 50%, ${baseColor} 75%)`,
    backgroundSize: '300% 300%',
    backgroundRepeat: 'no-repeat',
    animation: `${shimmerAnimation} 3s ease-in infinite`,
    zIndex: 1,
  };
});

export const Shimmer: React.FC<{ text?: string }> = ({
  text = 'Loading...',
}) => (
  <Box
    sx={{
      position: 'relative',
      width: '100%',
      height: '100%',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
    }}
  >
    <ShimmerS />
    <Typography
      variant="subtitle1"
      sx={{
        zIndex: 2,
        color: (theme) => (theme.palette.mode === 'dark' ? '#ccc' : '#333'),
        fontWeight: 500,
      }}
    >
      {text}
    </Typography>
  </Box>
);
