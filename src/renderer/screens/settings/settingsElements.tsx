import FolderIcon from '@mui/icons-material/Folder';
import PsychologyIcon from '@mui/icons-material/Psychology';
import ManageAccountsIcon from '@mui/icons-material/ManageAccounts';
import InfoIcon from '@mui/icons-material/Info';
import SystemUpdateAltIcon from '@mui/icons-material/SystemUpdateAlt';
import { SvgIconComponent } from '@mui/icons-material';

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
    icon: FolderIcon,
    text: 'dbt™',
    path: '/app/settings/dbt',
  },
  {
    icon: FolderIcon,
    text: 'Rosetta',
    path: '/app/settings/rosetta',
  },
  {
    icon: PsychologyIcon,
    text: 'AI Providers',
    path: '/app/settings/ai-providers',
  },
  {
    icon: SystemUpdateAltIcon,
    text: 'Installation Information',
    path: '/app/settings/installation',
  },
  {
    icon: InfoIcon,
    text: 'About',
    path: '/app/settings/about',
  },
];
