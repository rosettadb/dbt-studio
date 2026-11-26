import React from 'react';
import type { DashboardCard } from '../../../extensionApi/renderer';
import { icons } from '../../../extensionApi/studio/icons';
import { analyticsWorkspaceTab } from './workspaceTab';

/** The screen the Home card opens: the SQL Editor, on the Analytics tab. */
const ANALYTICS_HOME_PATH = '/app/sql';

const AnalyticsCardIcon: React.FC = () => (
  <img
    src={icons.analytics}
    alt="analytics"
    style={{ width: 28, height: 28, objectFit: 'contain' }}
  />
);

// The Analytics card on Home: fourth, between the SQL Editor (300) and
// Data Lake (500).
export const analyticsDashboardCard: DashboardCard = {
  id: 'analytics',
  order: 400,
  title: 'Analytics',
  category: 'BI & Viz',
  description: 'Visualize your data with powerful dashboards and charts.',
  icon: AnalyticsCardIcon,
  path: ANALYTICS_HOME_PATH,
  onSelect: ({ navigate, openSidebar }) => {
    openSidebar();
    navigate(ANALYTICS_HOME_PATH, {
      state: { tab: analyticsWorkspaceTab.id },
    });
  },
};
