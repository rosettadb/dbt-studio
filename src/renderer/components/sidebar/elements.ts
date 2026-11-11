import * as Icons from './icons';

interface SideBarElementType {
  path: string;
  text: string;
  description: string;
  icon: any;
  testId: string;
  disabled?: boolean;
  subItems?: Array<{ path: string; text: string; icon?: any }>;
}

const baseElements: SideBarElementType[] = [
  {
    path: '/app',
    text: 'Home',
    description: 'Overview of your projects and tools',
    icon: Icons.HomeIcon,
    testId: 'nav-item-home',
  },
  {
    path: '/app/dbt-project',
    text: 'Project',
    description: "Open the selected project's files and tools",
    icon: Icons.ProjectMenuIcon,
    testId: 'nav-item-files',
  },
  {
    path: '/app/sql',
    text: 'SQL Editor',
    description: 'Write and run SQL against your connections',
    icon: Icons.DataSources,
    testId: 'nav-item-sql',
  },
  {
    path: '/app/notebooks',
    text: 'Notebooks',
    description: 'Explore data in SQL and Python notebooks',
    icon: Icons.NotebooksIcon,
    testId: 'nav-item-notebooks',
  },
  {
    path: '/app/cloud-explorer',
    text: 'Object Explorer',
    description: 'Browse your cloud storage buckets and files',
    icon: Icons.CloudIcon,
    testId: 'nav-item-cloud-explorer',
  },
  {
    path: '/app/data-lake',
    text: 'DataLake',
    description: 'Manage your data lake instances and tables',
    icon: Icons.DataLakeMenuIcon,
    testId: 'nav-item-data-lake',
  },
  {
    path: '/app/flows',
    text: 'Flows',
    description: 'Build visual data flows with Flowfile',
    icon: Icons.FlowsIcon,
    testId: 'nav-item-flows',
  },
];

export const getMainElements = (
  isProjectSelected: boolean,
): SideBarElementType[] => {
  return baseElements.map((element) => {
    if (!isProjectSelected && element.path === '/app/dbt-project') {
      return { ...element, disabled: true };
    }
    return element;
  });
};

export const getBottomElements = (): SideBarElementType[] => {
  return [
    {
      path: '/app/connections',
      text: 'Database Connections',
      description: 'Add and manage your database connections',
      icon: Icons.ElectricalServices,
      testId: 'nav-item-connections',
    },
    {
      path: '/app/settings',
      text: 'Settings',
      description: 'Change app, dbt, Python and AI settings',
      icon: Icons.SettingsIcon,
      testId: 'nav-item-settings',
    },
  ];
};

// Legacy compat: returns all elements in flat array
export const getSidebarElements = (
  isProjectSelected: boolean,
): SideBarElementType[] => {
  return getMainElements(isProjectSelected);
};
