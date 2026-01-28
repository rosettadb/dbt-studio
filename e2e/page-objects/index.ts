/**
 * Page Objects Index
 *
 * Export all page objects from a single location
 */

// Base
export { BasePage } from './BasePage';

// Screens
export { SetupWizardPage } from './screens/SetupWizard';
export { ProjectSelectionPage } from './screens/ProjectSelection';
export { SqlEditorPage } from './screens/SqlEditor';
export { ConnectionsPage, type ConnectionType } from './screens/Connections';

// Components
export { FileTreeComponent } from './components/FileTree';
export {
  NavigationSidebarComponent,
  type NavItem,
} from './components/NavigationSidebar';
