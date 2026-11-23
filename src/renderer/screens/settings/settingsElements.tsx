import FolderIcon from '@mui/icons-material/Folder';
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';
import VpnKeyIcon from '@mui/icons-material/VpnKey';
import ManageAccountsIcon from '@mui/icons-material/ManageAccounts';
import CloudIcon from '@mui/icons-material/Cloud';
import InfoIcon from '@mui/icons-material/Info';
import AccountTreeIcon from '@mui/icons-material/AccountTree';
import ChecklistIcon from '@mui/icons-material/Checklist';
import MenuBookIcon from '@mui/icons-material/MenuBook';
import BackupOutlinedIcon from '@mui/icons-material/BackupOutlined';
import ExtensionOutlinedIcon from '@mui/icons-material/ExtensionOutlined';
import { SvgIconComponent } from '@mui/icons-material';
import React from 'react';
import { Icon } from '../../components/icon';
import { PythonMonoIcon } from '../../components/notebook/NotebookKindIcon';
import { DbtMonoIcon } from '../../components/icon/DbtMonoIcon';
import { icons } from '../../../../assets';
import { ExtensionsSettings } from '../../components/settings/ExtensionsSettings';
import type { SettingsPage } from '../../../extensionApi/renderer';
import { settingsPages } from '../../../extensionHost/renderer/contributions.renderer';

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
        icon: BackupOutlinedIcon,
        text: 'Backup & Restore',
        path: '/app/settings/backup',
      },
    ],
  },
  {
    label: 'Plugins',
    items: [
      {
        icon: DbtMonoIcon as any,
        text: 'dbt™ Core',
        path: '/app/settings/dbt',
      },
      {
        icon: PythonMonoIcon as any,
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

// Group a registered page lands in when it names none.
export const DEFAULT_PAGE_CATEGORY = 'Extensions';

// Pages added through the settings-page registry (by Studio below, and by
// extensions) are merged into the built-in list: into the group with the
// same label when there is one, otherwise into a group of their own placed
// before the unlabelled last group (Documentation, About).
export const mergeRegisteredPages = (
  pages: ReadonlyArray<SettingsPage>,
): SettingsSidebarCategory[] => {
  const categories = settingsSidebarCategories.map((category) => ({
    ...category,
    items: [...category.items],
  }));
  pages.forEach((page) => {
    const label = page.category ?? DEFAULT_PAGE_CATEGORY;
    const element: SettingsSidebarElement = {
      icon: page.icon as SvgIconComponent,
      text: page.label,
      path: `/app/settings/${page.id}`,
    };
    const existing = categories.find((category) => category.label === label);
    if (existing) {
      existing.items.push(element);
      return;
    }
    const lastIsUnlabelled =
      categories.length > 0 && categories[categories.length - 1].label === '';
    categories.splice(
      lastIsUnlabelled ? categories.length - 1 : categories.length,
      0,
      { label, items: [element] },
    );
  });
  return categories;
};

// Studio's own page for managing extensions.
settingsPages.add({
  id: 'extensions',
  label: 'Extensions',
  description: 'Install extensions and switch them on or off.',
  icon: ExtensionOutlinedIcon,
  category: 'General',
  Component: ExtensionsSettings,
});

// Flat list for backward compatibility
export const settingsSidebarElements: SettingsSidebarElement[] =
  settingsSidebarCategories.flatMap((category) => category.items);
