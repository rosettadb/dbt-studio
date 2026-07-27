import FolderIcon from '@mui/icons-material/Folder';
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';
import VpnKeyIcon from '@mui/icons-material/VpnKey';
import ManageAccountsIcon from '@mui/icons-material/ManageAccounts';
import CloudIcon from '@mui/icons-material/Cloud';
import InfoIcon from '@mui/icons-material/Info';
import AccountTreeIcon from '@mui/icons-material/AccountTree';
import ChecklistIcon from '@mui/icons-material/Checklist';
import ExtensionIcon from '@mui/icons-material/Extension';
import StorageIcon from '@mui/icons-material/Storage';
import SecurityIcon from '@mui/icons-material/Security';
import SettingsIcon from '@mui/icons-material/Settings';
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

export interface SettingsCategory {
  name: string;
  icon: SvgIconComponent;
  items: SettingsSidebarElement[];
}

export const settingsCategories: SettingsCategory[] = [
  {
    name: 'General',
    icon: SettingsIcon,
    items: [
      {
        icon: ManageAccountsIcon,
        text: 'General',
        path: '/app/settings/general',
      },
    ],
  },
  {
    name: 'Plugins',
    icon: ExtensionIcon,
    items: [
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
        icon: AccountTreeIcon as any,
        text: 'Flowfile',
        path: '/app/settings/flowfile',
      },
    ],
  },
  {
    name: 'AI',
    icon: AutoAwesomeIcon,
    items: [
      {
        icon: AutoAwesomeIcon,
        text: 'AI Settings',
        path: '/app/settings/ai-providers',
      },
    ],
  },
  {
    name: 'Data',
    icon: StorageIcon,
    items: [
      {
        icon: DuckDBIcon as any,
        text: 'DuckDB',
        path: '/app/settings/duckdb',
      },
    ],
  },
  {
    name: 'Cloud',
    icon: CloudIcon,
    items: [
      {
        icon: CloudIcon,
        text: 'Rosetta Cloud',
        path: '/app/settings/profile',
      },
    ],
  },
  {
    name: 'Security',
    icon: SecurityIcon,
    items: [
      {
        icon: VpnKeyIcon,
        text: 'Keystore',
        path: '/app/settings/keystore',
      },
    ],
  },
  {
    name: 'System',
    icon: SettingsIcon,
    items: [
      {
        icon: ChecklistIcon,
        text: 'Task Manager',
        path: '/app/settings/task-manager',
      },
      {
        icon: InfoIcon,
        text: 'About',
        path: '/app/settings/about',
      },
    ],
  },
];
