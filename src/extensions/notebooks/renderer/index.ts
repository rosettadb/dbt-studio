import type {
  ExtensionRendererApi,
  ExtensionRendererModule,
} from '../../../extensionApi/renderer';
import NotebooksScreen from './NotebooksScreen';
import {
  notebooksDashboardCard,
  notebooksNavigationItem,
} from './contributions';

/**
 * UI half of the Notebooks extension: the Notebooks screen with its sidebar
 * entry and Home card.
 */
const activate = (api: ExtensionRendererApi): void => {
  api.navigation.addItem(notebooksNavigationItem);

  api.screens.add({
    id: 'notebooks',
    paths: ['notebooks'],
    Component: NotebooksScreen,
    assistant: true,
  });

  api.dashboard.addCard(notebooksDashboardCard);
};

export const notebooksRenderer: ExtensionRendererModule = { activate };
