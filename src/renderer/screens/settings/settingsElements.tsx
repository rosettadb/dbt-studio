import FolderIcon from '@mui/icons-material/Folder';
import PsychologyIcon from '@mui/icons-material/Psychology';
import ManageAccountsIcon from '@mui/icons-material/ManageAccounts';
import PersonIcon from '@mui/icons-material/Person';
import InfoIcon from '@mui/icons-material/Info';
import { SvgIconComponent } from '@mui/icons-material';
import React from 'react';
import { Icon } from '../../components/icon';
import { icons } from '../../../../assets';

// Custom icon wrapper to make custom SVG icons compatible with Material-UI icon interface
const DbtBlackIcon: React.FC<{ fontSize?: string; color?: string }> = ({
  fontSize = 'small',
  color = 'inherit',
}) => (
  <Icon
    src={icons.dbtBlack}
    width={fontSize === 'small' ? 16 : 20}
    height={fontSize === 'small' ? 16 : 20}
    color={color === 'primary' ? 'currentColor' : color}
  />
);

export interface SettingsSidebarElement {
  icon: SvgIconComponent;
  text: string;
  path: string;
}

export const settingsSidebarElements: SettingsSidebarElement[] = [
  {
    icon: ManageAccountsIcon,
    text: 'General',
    path: '/app/settings/general',
  },

  {
    icon: DbtBlackIcon as any,
    text: 'dbt™ Core',
    path: '/app/settings/dbt',
  },
  {
    icon: FolderIcon,
    text: 'Rosetta CLI',
    path: '/app/settings/rosetta',
  },
  {
    icon: PsychologyIcon,
    text: 'AI Providers',
    path: '/app/settings/ai-providers',
  },
  {
    icon: PersonIcon,
    text: 'Profile',
    path: '/app/settings/profile',
  },
  {
    icon: InfoIcon,
    text: 'About',
    path: '/app/settings/about',
  },
];
