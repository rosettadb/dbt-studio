import FolderIcon from '@mui/icons-material/Folder';
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';
import ManageAccountsIcon from '@mui/icons-material/ManageAccounts';
import CloudIcon from '@mui/icons-material/Cloud';
import InfoIcon from '@mui/icons-material/Info';
import MemoryIcon from '@mui/icons-material/Memory';
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

// DuckDB icon wrapper
const DuckDBIcon: React.FC<{ fontSize?: string; color?: string }> = ({
  fontSize = 'small',
  color = 'inherit',
}) => (
  <Icon
    src={icons.duckdb}
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
    icon: AutoAwesomeIcon,
    text: 'AI Settings',
    path: '/app/settings/ai-providers',
  },
  {
    icon: MemoryIcon,
    text: 'Agent Memory',
    path: '/app/settings/memory',
  },
  {
    icon: DuckDBIcon as any,
    text: 'DuckDB',
    path: '/app/settings/duckdb',
  },
  {
    icon: CloudIcon,
    text: 'Rosetta Cloud',
    path: '/app/settings/profile',
  },
  {
    icon: InfoIcon,
    text: 'About',
    path: '/app/settings/about',
  },
];
