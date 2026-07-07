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
  const widthVal = chartProps.width;
  const heightVal = chartProps.height;

  const resolveWidth = (): string | number => {
    if (widthVal === undefined) return '100%';
    return typeof widthVal === 'number' ? widthVal : String(widthVal);
  };
  const resolveHeight = (): string | number | undefined => {
    if (heightVal === undefined) return undefined;
    return typeof heightVal === 'number' ? heightVal : String(heightVal);
  };
  const width = resolveWidth();
  const height = resolveHeight();
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
