import * as Icons from './icons';

interface SideBarElementType {
  path: string;
  text: string;
  icon: any;
  testId: string;
  disabled?: boolean;
  subItems?: Array<{ path: string; text: string; icon?: any }>;
}

const baseElements: SideBarElementType[] = [
  {
    path: '/app',
    text: 'DBT Studio',
    icon: Icons.DBTProjects,
    testId: 'nav-item-files',
  },
  {
    path: '/app/sql',
    text: 'SQL Editor',
    icon: Icons.DataSources,
    testId: 'nav-item-sql',
  },
  {
    path: '/app/notebooks',
    text: 'Notebooks',
    icon: Icons.NotebooksIcon,
    testId: 'nav-item-notebooks',
  },
  {
    path: '/app/cloud-explorer',
    text: 'Object Explorer',
    icon: Icons.CloudIcon,
    testId: 'nav-item-cloud-explorer',
  },
  {
    path: '/app/data-lake',
    text: 'DataLake',
    icon: Icons.DataLakeSVG,
    testId: 'nav-item-data-lake',
  },
  {
    path: '/app/flows',
    text: 'Flows',
    icon: Icons.FlowsIcon,
    testId: 'nav-item-flows',
  },
];

export const getMainElements = (
  isProjectSelected: boolean,
): SideBarElementType[] => {
  return baseElements.map((element) => {
    if (!isProjectSelected && element.path === '/app') {
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
      icon: Icons.ElectricalServices,
      testId: 'nav-item-connections',
    },
    {
      path: '/app/settings',
      text: 'Settings',
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
