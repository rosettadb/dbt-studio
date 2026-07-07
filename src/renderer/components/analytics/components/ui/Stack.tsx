import React from 'react';
import { Stack as MuiStack } from '@mui/material';
import {
  getStringProp,
  getNumberProp,
} from '../../../../utils/analyticsComponentProps';
import type { ParsedProps } from '../../../../utils/analyticsComponentProps';
import type { AnalyticsComponentProps } from '../../registry/analyticsComponentRegistry';

type Props = AnalyticsComponentProps & {
  chartProps?: ParsedProps;
};

export const AnalyticsStack: React.FC<Props> = ({
  chartProps = {},
  children,
}) => {
  const direction = getStringProp(chartProps, 'direction', 'column') as
    | 'row'
    | 'column';
  const spacing = getNumberProp(chartProps, 'spacing', 1);

  return (
    <MuiStack direction={direction} spacing={spacing} sx={{ mb: 2 }}>
      {children}
    </MuiStack>
  );
};
