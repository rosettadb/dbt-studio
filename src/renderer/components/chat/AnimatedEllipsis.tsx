import React from 'react';
import { Box } from '@mui/material';

export const AnimatedEllipsis: React.FC = () => (
  <Box
    component="span"
    sx={{
      display: 'inline-block',
      width: '1em',
      '&::after': {
        content: '"..."',
        display: 'inline-block',
        overflow: 'hidden',
        verticalAlign: 'bottom',
        animation: 'ellipsis 2s infinite',
        width: 0,
      },
      '@keyframes ellipsis': {
        '0%': { width: 0 },
        '33%': { width: '0.33em' },
        '66%': { width: '0.66em' },
        '100%': { width: '1em' },
      },
    }}
  />
);
