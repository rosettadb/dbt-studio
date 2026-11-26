import AutoStoriesIcon from '@mui/icons-material/AutoStories';
import type {
  DashboardCard,
  NavigationItem,
} from '../../../extensionApi/renderer';
import { NotebooksIcon } from '../../../extensionApi/studio/sidebarIcons';

/** Route of the Notebooks screen. */
export const NOTEBOOKS_SCREEN_PATH = '/app/notebooks';

// The Notebooks entry in the sidebar: fourth, between the SQL Editor (300)
// and Object Explorer (500).
export const notebooksNavigationItem: NavigationItem = {
  id: 'notebooks',
  path: NOTEBOOKS_SCREEN_PATH,
  label: 'Notebooks',
  description: 'Explore data in SQL and Python notebooks',
  icon: NotebooksIcon,
  testId: 'nav-item-notebooks',
  order: 400,
};

// The Notebook card on Home: second, between Projects (100) and the SQL
// Editor (300).
export const notebooksDashboardCard: DashboardCard = {
  id: 'notebook',
  order: 200,
  title: 'Notebook',
  category: 'Analytics',
  description:
    'Create interactive notebooks for data exploration and analysis.',
  icon: AutoStoriesIcon,
  path: NOTEBOOKS_SCREEN_PATH,
};
