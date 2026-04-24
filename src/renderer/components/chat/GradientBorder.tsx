import React from 'react';
import { Box } from '@mui/material';
import { useTheme } from '@mui/material/styles';

export const GradientBorder: React.FC<{
  loading: boolean;
  children: React.ReactNode;
}> = ({ loading, children }) => {
  const theme = useTheme();
  // Match the input background — shimmer between paper and a slightly lighter tone
  const bg = theme.palette.background.paper;
  const shimmer =
    theme.palette.mode === 'dark'
      ? 'rgba(255,255,255,0.06)'
      : 'rgba(0,0,0,0.04)';

  return (
    <Box
      sx={{
        borderRadius: 1,
        p: loading ? '1px' : 0,
        background: loading
          ? `linear-gradient(90deg, ${bg}, ${shimmer}, ${bg})`
          : 'transparent',
        backgroundSize: loading ? '200% 100%' : '100% 100%',
        animation: loading ? 'borderShimmer 1.8s ease-in-out infinite' : 'none',
        transition: 'padding 0.2s ease',
        '@keyframes borderShimmer': {
          '0%': { backgroundPosition: '0% 0' },
          '50%': { backgroundPosition: '100% 0' },
          '100%': { backgroundPosition: '0% 0' },
        },
      }}
    >
      {children}
    </Box>
  );
};
