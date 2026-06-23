import React from 'react';
import { Box as MuiBox } from '@mui/material';
import {
  getStringProp,
  getNumberProp,
} from '../../../../utils/analyticsComponentProps';
import type { ParsedProps } from '../../../../utils/analyticsComponentProps';
import type { AnalyticsComponentProps } from '../../registry/analyticsComponentRegistry';

type Props = AnalyticsComponentProps & {
  chartProps?: ParsedProps;
};

export const AnalyticsBox: React.FC<Props> = ({
  chartProps = {},
  children,
}) => {
  const p = getNumberProp(chartProps, 'p');
  const m = getNumberProp(chartProps, 'm');
  const width = getStringProp(chartProps, 'width', '100%');
  const height = getStringProp(chartProps, 'height');
  const bgcolor = getStringProp(chartProps, 'bgcolor');

  return (
    <MuiBox
      sx={{
        width,
        ...(height ? { height } : {}),
        ...(bgcolor ? { bgcolor } : {}),
        ...(p !== undefined ? { p } : {}),
        ...(m !== undefined ? { m } : {}),
        mb: 2,
      }}
    >
      {children}
    </MuiBox>
  );
};
