import React from 'react';
import Terminal from '@mui/icons-material/Terminal';
import type {
  DashboardCard,
  NavigationItem,
} from '../../../extensionApi/renderer';
import { DataSources } from '../../../extensionApi/studio/sidebarIcons';

/** Route of the SQL Editor screen. */
export const SQL_SCREEN_PATH = '/app/sql';

// The SQL Editor entry in the sidebar: third, between Project (200) and
// Notebooks (400).
export const sqlNavigationItem: NavigationItem = {
  id: 'sql',
  path: SQL_SCREEN_PATH,
  label: 'SQL Editor',
  description: 'Write and run SQL against your connections',
  icon: DataSources,
  testId: 'nav-item-sql',
  order: 300,
};

const SqlEditorCardIcon: React.FC = () => (
  <Terminal color="primary" sx={{ fontSize: 28 }} />
);

// The SQL Editor card on Home: third, between Notebook (200) and
// Analytics (400).
export const sqlDashboardCard: DashboardCard = {
  id: 'sql-editor',
  title: 'SQL Editor',
  category: 'SQL',
  description: 'Write, execute, and profile high-performance SQL queries.',
  icon: SqlEditorCardIcon,
  order: 300,
  path: SQL_SCREEN_PATH,
};
