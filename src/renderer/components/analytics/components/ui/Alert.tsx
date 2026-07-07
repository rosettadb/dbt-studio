import React from 'react';
import { Alert as MuiAlert, AlertTitle as MuiAlertTitle } from '@mui/material';
import { getStringProp } from '../../../../utils/analyticsComponentProps';
import type { ParsedProps } from '../../../../utils/analyticsComponentProps';
import type { AnalyticsComponentProps } from '../../registry/analyticsComponentRegistry';

type Props = AnalyticsComponentProps & {
  chartProps?: ParsedProps;
};

export const AnalyticsAlert: React.FC<Props> = ({
  chartProps = {},
  children,
}) => {
  const severity = (getStringProp(chartProps, 'severity') || 'info') as
    | 'info'
    | 'warning'
    | 'error'
    | 'success';
  const title = getStringProp(chartProps, 'title');

  return (
    <MuiAlert severity={severity} sx={{ mb: 2 }}>
      {title && <MuiAlertTitle>{title}</MuiAlertTitle>}
      {children}
    </MuiAlert>
  );
};
