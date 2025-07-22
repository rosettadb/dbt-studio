import * as Icons from './icons';

interface SideBarElementType {
  path: string;
  text: string;
  icon: any;
  disabled?: boolean;
  subItems?: Array<{ path: string; text: string; icon?: any }>;
}

const baseSidebarElements: SideBarElementType[] = [
  {
    path: '/app/connections',
    text: 'Database Connections',
    icon: Icons.Connections,
  },
  {
    path: '/app/select-project',
    text: 'Projects',
    icon: Icons.SelectProject,
  },
  {
    path: '/app',
    text: 'DBT Studio',
    icon: Icons.DBTProjects,
  },
  {
    path: '/app/sql',
    text: 'SQL Editor',
    icon: Icons.SQL,
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
