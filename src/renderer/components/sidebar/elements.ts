import * as Icons from './icons';

interface SideBarElementType {
  path: string;
  text: string;
  icon: any;
  testId: string;
  disabled?: boolean;
  subItems?: Array<{ path: string; text: string; icon?: any }>;
}

const baseSidebarElements: SideBarElementType[] = [
  {
    path: '/app/connections',
    text: 'Database Connections',
    icon: Icons.ElectricalServices,
    testId: 'nav-item-connections',
  },
  {
    path: '/app/select-project',
    text: 'Projects',
    icon: Icons.SelectProject,
    testId: 'nav-item-projects',
  },
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
    text: 'Cloud Object Explorer',
    icon: Icons.CloudIcon,
    testId: 'nav-item-cloud-explorer',
  },
  {
    path: '/app/data-lake',
    text: 'DataLake',
    icon: Icons.DataLakeSVG,
    testId: 'nav-item-data-lake',
  },
];

export const getSidebarElements = (
  isProjectSelected: boolean,
): SideBarElementType[] => {
  return baseSidebarElements.map((element) => {
    // Disable project-dependent features when no project is selected
    if (
      !isProjectSelected &&
      (element.path === '/app' || element.path === '/app/sql')
    ) {
      return {
        ...element,
        disabled: true,
        tooltip: `${element.text}`,
      };
    }
    return element;
  });
};
