import type {
  ExtensionRendererApi,
  ExtensionRendererModule,
} from '../../../extensionApi/renderer';
import SqlScreen from './SqlScreen';
import { sqlDashboardCard, sqlNavigationItem } from './contributions';

/**
 * UI half of the SQL Editor extension: the SQL Editor screen with its
 * sidebar entry and Home card.
 */
const activate = (api: ExtensionRendererApi): void => {
  api.navigation.addItem(sqlNavigationItem);

  api.screens.add({
    id: 'sql',
    paths: ['sql'],
    Component: SqlScreen,
    // The data lake's query history lives in the SQL Editor.
    redirects: [{ from: 'data-lake/history', to: '/app/sql' }],
    assistant: true,
  });

  api.dashboard.addCard(sqlDashboardCard);
};

export const sqlRenderer: ExtensionRendererModule = { activate };
