import * as Icons from './icons';

interface SideBarElementType {
  path: string;
  text: string;
  icon: any;
  subItems?: Array<{ path: string; text: string; icon?: any }>;
}

export const sidebarElements: SideBarElementType[] = [
  {
    path: '/app',
    text: 'Projects',
    icon: Icons.DataSources,
  },
  {
    path: '/app/sql',
    text: 'SQL',
    icon: Icons.SQL,
  },
];
