import React from 'react';
import { Box } from '@mui/material';
import { getNumberProp } from '../../../../../extensionApi/studio/analyticsComponentProps';
import type { ParsedProps } from '../../../../../extensionApi/studio/analyticsComponentProps';
import type { AnalyticsComponentProps } from '../../registry/analyticsComponentRegistry';

type Props = AnalyticsComponentProps & {
  chartProps?: ParsedProps;
};

export const AnalyticsGrid: React.FC<Props> = ({
  chartProps = {},
  children,
}) => {
  const columns = getNumberProp(chartProps, 'columns', 2);
  const spacing = getNumberProp(chartProps, 'spacing', 2) ?? 2;

  return (
    <Box
      sx={{
        display: 'grid',
        gridTemplateColumns: `repeat(${columns}, 1fr)`,
        gap: spacing * 2,
        mb: 2,
      }}
    >
      {children}
    </Box>
  );
};
