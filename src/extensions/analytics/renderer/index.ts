import {
  STUDIO_WORKSPACES,
  type ExtensionRendererApi,
  type ExtensionRendererModule,
} from '../../../extensionApi/renderer';
import { analyticsDashboardCard } from './contributions';
import { analyticsWorkspaceTab } from './workspaceTab';
import { ipc } from './ipc';

/**
 * UI half of the Analytics extension: the Analytics tab of the SQL Editor
 * and Notebooks screens, and the Home card.
 */
const activate = (api: ExtensionRendererApi): void => {
  // The extension's own code reaches the main process through `api.ipc`.
  ipc.bind(api.ipc);

  api.workspaceTabs.add(STUDIO_WORKSPACES.sql, analyticsWorkspaceTab);
  api.workspaceTabs.add(STUDIO_WORKSPACES.notebooks, analyticsWorkspaceTab);

  api.dashboard.addCard(analyticsDashboardCard);
};

export const analyticsRenderer: ExtensionRendererModule = { activate };
