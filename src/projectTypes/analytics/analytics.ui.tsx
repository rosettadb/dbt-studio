import React from 'react';
import { useTheme } from '@mui/material';
import type { ProjectTypeUi } from '../core/types.ui';

// A database with a bar chart cut into it: data, then analysis. One solid
// shape so it still reads at the 11–12px of the type badges.
const AnalyticsIcon: React.FC<{ size?: number }> = ({ size = 20 }) => {
  const theme = useTheme();
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill={theme.palette.primary.main}
      fillRule="evenodd"
      style={{ display: 'block', flexShrink: 0 }}
      aria-hidden
    >
      <path d="M3.5 5c0-1.66 3.8-3 8.5-3s8.5 1.34 8.5 3v14c0 1.66-3.8 3-8.5 3s-8.5-1.34-8.5-3zM3.5 4.7c0 1.66 3.8 3 8.5 3s8.5-1.34 8.5-3v1.6c0 1.66-3.8 3-8.5 3s-8.5-1.34-8.5-3zM7.2 14h2.4v5H7.2zM10.8 11.5h2.4V19h-2.4zM14.4 10h2.4v9h-2.4z" />
    </svg>
  );
};

// No top bar actions: an Analytics project has no dbt commands, and its
// notebooks open from the Notebooks screen in the nav rail.
export const analyticsProjectTypeUi: ProjectTypeUi = {
  Icon: AnalyticsIcon,
};
