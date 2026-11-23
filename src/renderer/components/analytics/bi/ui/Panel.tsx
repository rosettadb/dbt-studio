import React from 'react';
import { Box, SxProps, Theme } from '@mui/material';

/** Card that holds one chart, table or KPI on a dashboard. */
export const Panel: React.FC<{
  children: React.ReactNode;
  sx?: SxProps<Theme>;
  testId?: string;
}> = ({ children, sx, testId }) => (
  <Box
    data-testid={testId}
    sx={[
      {
        bgcolor: 'background.paper',
        border: 1,
        borderColor: 'divider',
        borderRadius: 2,
        p: 2,
        mb: 2,
        minWidth: 0,
        boxSizing: 'border-box',
      },
      ...(Array.isArray(sx) ? sx : [sx]),
    ]}
  >
    {children}
  </Box>
);
