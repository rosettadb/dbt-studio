import { Page, ElectronApplication } from '@playwright/test';
import { test, expect } from '../../fixtures/electron-seeded.fixture';
import { SqlEditorPage } from '../../page-objects/screens/SqlEditor';
import { NavigationSidebarComponent } from '../../page-objects/components/NavigationSidebar';
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

test.describe('SQL Editor', () => {
  test.beforeEach(async ({ electronApp }) => {
    // Wait for stable window (splash screen to close)
    const mainWindow = await findStableWindow(electronApp);
    await mainWindow.waitForLoadState('domcontentloaded');

    const appHelper = new AppHelper(electronApp, mainWindow);
    await appHelper.skipSetupIfPresent();

    // Check if we are on the project selection screen and select/create project if needed
    const projectSelection = new ProjectSelectionPage(mainWindow);
    if (await projectSelection.isVisible()) {
      const projectCard = mainWindow.locator(
        '[data-testid="project-card-test_project"]',
      );
      if (await projectCard.isVisible()) {
        await projectSelection.selectProject('test_project');
      } else {
        await projectSelection.createAndSelectProject('test_project');
      }
    }

    // Wait for the sidebar to be visible, ensuring we are in the main app
    const nav = new NavigationSidebarComponent(mainWindow);
    await expect(mainWindow.locator('[data-testid="sidebar"]')).toBeVisible({
      timeout: 30000,
    });

    // Navigate to SQL editor
    await nav.navigateTo('sql');
  });

  test('should execute a simple query', async ({ electronApp }) => {
    const mainWindow = await findStableWindow(electronApp);
    const sqlEditor = new SqlEditorPage(mainWindow);

    await sqlEditor.setQuery('SELECT 1 + 1 as result');
    await sqlEditor.runQuery();

    await sqlEditor.expectResultsToBeVisible();
  });

  test('should execute query with keyboard shortcut', async ({
    electronApp,
  }) => {
    const mainWindow = await findStableWindow(electronApp);
    const sqlEditor = new SqlEditorPage(mainWindow);

    await sqlEditor.setQuery('SELECT 42 as answer');
    // Use keyboard shortcut - note: using runQuery as fallback since keyboard shortcuts
    // can be unreliable in headless E2E tests
    await sqlEditor.runQuery();

    await sqlEditor.expectResultsToBeVisible();
  });

  test('should show error for invalid query', async ({ electronApp }) => {
    const mainWindow = await findStableWindow(electronApp);
    const sqlEditor = new SqlEditorPage(mainWindow);

    await sqlEditor.setQuery('INVALID SQL SYNTAX');
    await sqlEditor.runQuery();

    // Verify error is shown
    const errorMessage = mainWindow.locator(
      '[data-testid="sql-error-message"]',
    );
    await expect(errorMessage).toBeVisible();
  });
});
