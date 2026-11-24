import React from 'react';
import * as Icons from './icons';
import type { NavigationItem } from '../../../extensionApi/renderer';
import { navigationItems } from '../../../extensionHost/renderer/contributions.renderer';
import { useRegistry } from '../../../extensionHost/renderer/registry.renderer';
import { useLastDataLakeRoute } from '../../hooks/useLastDataLakeRoute';

/** A sidebar item with its enabled state worked out for the current app state. */
export type SidebarItem = NavigationItem & { disabled: boolean };

// Studio's own sidebar items. Extensions add theirs to the same registry;
// `order` leaves room between them (300 is the SQL Editor and 400
// Notebooks, which their extensions add).
const coreItems: NavigationItem[] = [
  {
    id: 'home',
    path: '/app',
    label: 'Home',
    description: 'Overview of your projects and tools',
    icon: Icons.HomeIcon,
    testId: 'nav-item-home',
    order: 100,
    exact: true,
  },
  {
    id: 'project',
    path: '/app/dbt-project',
    label: 'Project',
    description: "Open the selected project's files and tools",
    icon: Icons.ProjectMenuIcon,
    testId: 'nav-item-files',
    order: 200,
    isEnabled: ({ hasProject }) => hasProject,
  },
  {
    id: 'cloud-explorer',
    path: '/app/cloud-explorer',
    label: 'Object Explorer',
    description: 'Browse your cloud storage buckets and files',
    icon: Icons.CloudIcon,
    testId: 'nav-item-cloud-explorer',
    order: 500,
  },
  {
    id: 'data-lake',
    path: '/app/data-lake',
    label: 'DataLake',
    description: 'Manage your data lake instances and tables',
    icon: Icons.DataLakeMenuIcon,
    testId: 'nav-item-data-lake',
    order: 600,
    // Opens the data lake page that was open last.
    useTargetPath: useLastDataLakeRoute,
  },
  {
    id: 'flows',
    path: '/app/flows',
    label: 'Flows',
    description: 'Build visual data flows with Flowfile',
    icon: Icons.FlowsIcon,
    testId: 'nav-item-flows',
    order: 700,
  },
  {
    id: 'connections',
    path: '/app/connections',
    label: 'Database Connections',
    description: 'Add and manage your database connections',
    icon: Icons.ElectricalServices,
    testId: 'nav-item-connections',
    area: 'bottom',
    order: 100,
    activePaths: [
      '/app/connections',
      '/app/edit-connection',
      '/app/add-connection',
    ],
  },
  {
    id: 'settings',
    path: '/app/settings',
    label: 'Settings',
    description: 'Change app, dbt, Python and AI settings',
    icon: Icons.SettingsIcon,
    testId: 'nav-item-settings',
    area: 'bottom',
    order: 200,
  },
];

coreItems.forEach((item) => navigationItems.add(item));

const resolve = (
  items: ReadonlyArray<NavigationItem>,
  area: 'main' | 'bottom',
  isProjectSelected: boolean,
): SidebarItem[] =>
  items
    .filter((item) => (item.area ?? 'main') === area)
    .map((item) => ({
      ...item,
      disabled: item.isEnabled
        ? !item.isEnabled({ hasProject: isProjectSelected })
        : false,
    }));

/** Items of the top group, in order. */
export const getMainElements = (isProjectSelected: boolean): SidebarItem[] =>
  resolve(navigationItems.list(), 'main', isProjectSelected);

/** Items of the group pinned to the bottom, in order. */
export const getBottomElements = (): SidebarItem[] =>
  resolve(navigationItems.list(), 'bottom', false);

/** Both groups, re-read whenever an item is added or removed. */
export const useNavigationItems = (
  isProjectSelected: boolean,
): { main: SidebarItem[]; bottom: SidebarItem[] } => {
  const items = useRegistry(navigationItems);
  return React.useMemo(
    () => ({
      main: resolve(items, 'main', isProjectSelected),
      bottom: resolve(items, 'bottom', isProjectSelected),
    }),
    [items, isProjectSelected],
  );
};
