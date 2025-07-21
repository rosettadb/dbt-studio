import * as Icons from './icons';

interface SideBarElementType {
  path: string;
  text: string;
  icon: any;
  subItems?: Array<{ path: string; text: string; icon?: any }>;
}

export const getSidebarElements = (
  isProjectSelected: boolean,
): SideBarElementType[] => {
  const elements = [
    {
      path: '/app/connections',
      text: 'Connections',
      icon: Icons.DataSources,
    },
    {
      path: isProjectSelected ? '/app' : '/app/select-project',
      text: 'Projects',
      icon: Icons.DBTProjects,
    },
  ];

  if (isProjectSelected) {
    elements.push({
      path: '/app/sql',
      text: 'SQL',
      icon: Icons.SQL,
    });
  }
  return elements;
};
