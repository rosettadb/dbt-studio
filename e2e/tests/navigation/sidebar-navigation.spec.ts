/**
 * Sidebar Navigation Tests
 *
 * Verifies that every main navigation item is present once a project is
 * open, and that clicking through lands on the expected screen. Uses the
 * seeded fixture so a project and a DuckDB connection already exist.
 */

import { Page, ElectronApplication } from '@playwright/test';
import { test, expect } from '../../fixtures/electron-seeded.fixture';
import {
  NavigationSidebarComponent,
  NAV_ITEMS,
} from '../../page-objects/components/NavigationSidebar';
import { ProjectSelectionPage } from '../../page-objects/screens/ProjectSelection';
import { AppHelper } from '../../helpers/app.helper';

// Helper to find a stable window (after splash screen closes)
const findStableWindow = async (
  electronApp: ElectronApplication,
): Promise<Page> => {
  const predicate = (w: Page) => {
    const url = w.url();
    return (
      url.includes('/setup') ||
      url.includes('/main') ||
      (url.startsWith('file:') && !url.includes('splash')) ||
      url.startsWith('chrome-error:')
    );
  };

  const windows = electronApp.windows();
  const existing = windows.find(predicate);
  if (existing) return existing;

  // eslint-disable-next-line no-console
  console.log('Waiting for stable app window...');
  return electronApp.waitForEvent('window', {
    predicate,
    timeout: 30000,
  });
};

test.describe('Sidebar Navigation', () => {
  test.beforeEach(async ({ electronApp }) => {
    const mainWindow = await findStableWindow(electronApp);
    await mainWindow.waitForLoadState('domcontentloaded');

    const appHelper = new AppHelper(electronApp, mainWindow);
    await appHelper.skipSetupIfPresent();

    // Land in the main app with the seeded project selected
    const projectSelection = new ProjectSelectionPage(mainWindow);
    if (await projectSelection.isVisible()) {
      await projectSelection.selectProject('test_project');
    }

    await expect(mainWindow.locator('[data-testid="sidebar"]')).toBeVisible({
      timeout: 30000,
    });
  });

  test('should show every navigation item', async ({ electronApp }) => {
    const mainWindow = await findStableWindow(electronApp);
    const nav = new NavigationSidebarComponent(mainWindow);

    await nav.expectToBeVisible();
    // eslint-disable-next-line no-restricted-syntax
    for (const item of NAV_ITEMS) {
      // eslint-disable-next-line no-await-in-loop
      await nav.expectNavItemVisible(item);
    }
  });

  test('should open the SQL editor', async ({ electronApp }) => {
    const mainWindow = await findStableWindow(electronApp);
    const nav = new NavigationSidebarComponent(mainWindow);

    await nav.goToSqlEditor();

    // The screen-level testid lives on AppLayout, which does not forward it,
    // so the connection selector in the SQL side panel is the screen marker.
    await expect(
      mainWindow.locator('[data-testid="sql-connection-select"]'),
    ).toBeVisible();
    await nav.expectActiveItem('sql');
  });

  test('should open Connections and list the seeded connection', async ({
    electronApp,
  }) => {
    const mainWindow = await findStableWindow(electronApp);
    const nav = new NavigationSidebarComponent(mainWindow);

    await nav.goToConnections();

    await expect(
      mainWindow.getByRole('heading', { name: 'Connections', exact: true }),
    ).toBeVisible();
    await expect(
      mainWindow.getByText('Database Connections (1)'),
    ).toBeVisible();
    // The name also appears in the side panel list, so scope to the card grid
    await expect(
      mainWindow.getByRole('main').getByText('test_db'),
    ).toBeVisible();
    await nav.expectActiveItem('connections');
  });

  test('should open Notebooks with a connection selector', async ({
    electronApp,
  }) => {
    const mainWindow = await findStableWindow(electronApp);
    const nav = new NavigationSidebarComponent(mainWindow);

    await nav.goToNotebooks();

    await expect(
      mainWindow.locator('[data-testid="notebooks-connection-select"]'),
    ).toBeVisible();
    await nav.expectActiveItem('notebooks');
  });

  test('should open Settings and switch to the About section', async ({
    electronApp,
  }) => {
    const mainWindow = await findStableWindow(electronApp);
    const nav = new NavigationSidebarComponent(mainWindow);

    await nav.goToSettings();
    await nav.expectActiveItem('settings');

    // Settings categories are listed in the side panel
    await expect(mainWindow.getByText('Local Runner')).toBeVisible();
    await expect(mainWindow.getByText('About', { exact: true })).toBeVisible();

    await mainWindow.getByText('About', { exact: true }).click();

    await expect(
      mainWindow.getByText(/Version .+ \(Official Build\)/),
    ).toBeVisible();
  });

  test('should keep the SQL editor state when navigating away and back', async ({
    electronApp,
  }) => {
    const mainWindow = await findStableWindow(electronApp);
    const nav = new NavigationSidebarComponent(mainWindow);

    const sqlScreenMarker = mainWindow.locator(
      '[data-testid="sql-connection-select"]',
    );

    await nav.goToSqlEditor();
    await expect(sqlScreenMarker).toBeVisible();

    await nav.goToConnections();
    await expect(
      mainWindow.getByRole('heading', { name: 'Connections', exact: true }),
    ).toBeVisible();
    await expect(sqlScreenMarker).toBeHidden();

    await nav.goToSqlEditor();
    await expect(sqlScreenMarker).toBeVisible();
    await nav.expectActiveItem('sql');
    await nav.expectNotActiveItem('connections');
  });
});
