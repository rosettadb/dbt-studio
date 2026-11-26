import React from 'react';
import { Box, Typography } from '@mui/material';
import { Panel } from '../ui/Panel';

export const DEFAULT_CHART_HEIGHT = 300;

/** Title, subtitle and a fixed-height area for a Recharts chart. */
export const ChartFrame: React.FC<{
  title?: string;
  subtitle?: string;
  height?: number;
  empty?: boolean;
  children: React.ReactNode;
}> = ({ title, subtitle, height, empty, children }) => (
  <Panel testId="bi-chart" sx={{ height: 'calc(100% - 16px)' }}>
    {title && (
      <Typography
        variant="subtitle1"
        fontWeight={600}
        sx={{ mb: subtitle ? 0 : 1 }}
      >
        {title}
      </Typography>
    )}
    {subtitle && (
      <Typography
        variant="caption"
        color="text.secondary"
        sx={{ display: 'block', mb: 1 }}
      >
        {subtitle}
      </Typography>
    )}
    {empty ? (
      <Box
        sx={{
          height: 80,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          border: '1px dashed',
          borderColor: 'divider',
          borderRadius: 1,
          color: 'text.secondary',
        }}
      >
        <Typography variant="caption">No data</Typography>
      </Box>
    ) : (
      <Box
        sx={{
          width: '100%',
          height: Math.max(height ?? DEFAULT_CHART_HEIGHT, 120),
          maxHeight: '70vh',
          position: 'relative',
          overflow: 'hidden',
          contain: 'layout size',
        }}
      >
        <Box sx={{ position: 'absolute', inset: 0, minWidth: 0, minHeight: 0 }}>
          {children}
        </Box>
      </Box>
    )}
  </Panel>
);
