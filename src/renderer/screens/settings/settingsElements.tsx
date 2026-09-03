import FolderIcon from '@mui/icons-material/Folder';
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';
import VpnKeyIcon from '@mui/icons-material/VpnKey';
import ManageAccountsIcon from '@mui/icons-material/ManageAccounts';
import CloudIcon from '@mui/icons-material/Cloud';
import InfoIcon from '@mui/icons-material/Info';
import AccountTreeIcon from '@mui/icons-material/AccountTree';
import ChecklistIcon from '@mui/icons-material/Checklist';
import TerminalIcon from '@mui/icons-material/Terminal';
import CodeIcon from '@mui/icons-material/Code';
import MenuBookIcon from '@mui/icons-material/MenuBook';
import BackupIcon from '@mui/icons-material/SettingsBackupRestore';
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
  externalUrl?: string;
}

export interface SettingsSidebarCategory {
  label: string;
  items: SettingsSidebarElement[];
}

export const settingsSidebarCategories: SettingsSidebarCategory[] = [
  {
    label: 'General',
    items: [
      {
        icon: ManageAccountsIcon,
        text: 'General',
        path: '/app/settings/general',
      },
      {
        icon: AutoAwesomeIcon,
        text: 'AI Settings',
        path: '/app/settings/ai-providers',
      },
      {
        icon: CloudIcon,
        text: 'Rosetta Cloud',
        path: '/app/settings/profile',
      },
      {
        icon: VpnKeyIcon,
        text: 'Keystore',
        path: '/app/settings/keystore',
      },
      {
        icon: ChecklistIcon,
        text: 'Task Manager',
        path: '/app/settings/task-manager',
      },
      {
        icon: BackupIcon,
        text: 'Backup & Restore',
        path: '/app/settings/backup',
      },
    ],
  },
  {
    label: 'Plugins',
    items: [
      {
        icon: DbtBlackIcon as any,
        text: 'dbt™ Core',
        path: '/app/settings/dbt',
      },
      {
        icon: CodeIcon,
        text: 'Python',
        path: '/app/settings/python',
      },
      {
        icon: FolderIcon,
        text: 'Rosetta CLI',
        path: '/app/settings/rosetta',
      },
      {
        icon: DuckDBIcon as any,
        text: 'DuckDB',
        path: '/app/settings/duckdb',
      },
      {
        icon: AccountTreeIcon as any,
        text: 'Flowfile',
        path: '/app/settings/flowfile',
      },
      {
        icon: TerminalIcon,
        text: 'Local Runner',
        path: '/app/settings/runner',
      },
    ],
  },
  {
    label: '',
    items: [
      {
        icon: MenuBookIcon,
        text: 'Documentation',
        path: '/app/settings/_external_docs',
        externalUrl: 'https://docs.rosettalabs.ai/',
      },
      {
        icon: InfoIcon,
        text: 'About',
        path: '/app/settings/about',
      },
    ],
  },
];

// Flat list for backward compatibility
export const settingsSidebarElements: SettingsSidebarElement[] =
  settingsSidebarCategories.flatMap((category) => category.items);
