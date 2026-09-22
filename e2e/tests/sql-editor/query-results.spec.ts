/**
 * SQL Editor Results Tests
 *
 * Goes one step past basic-queries.spec.ts: asserts on the shape of the
 * results (row count, column headers) and on how the results pane recovers
 * between runs. Uses the in-memory DuckDB connection from the seeded fixture.
 */

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

test.describe('SQL Editor Results', () => {
  test.beforeEach(async ({ electronApp }) => {
    const mainWindow = await findStableWindow(electronApp);
    await mainWindow.waitForLoadState('domcontentloaded');

    const appHelper = new AppHelper(electronApp, mainWindow);
    await appHelper.skipSetupIfPresent();

    const projectSelection = new ProjectSelectionPage(mainWindow);
    if (await projectSelection.isVisible()) {
      await projectSelection.selectProject('test_project');
    }

    await expect(mainWindow.locator('[data-testid="sidebar"]')).toBeVisible({
      timeout: 30000,
    });

    const nav = new NavigationSidebarComponent(mainWindow);
    await nav.navigateTo('sql');

    const sqlEditor = new SqlEditorPage(mainWindow);
    const isEditorVisible = await sqlEditor.monacoEditor
      .isVisible({ timeout: 5000 })
      .catch(() => false);

    if (!isEditorVisible) {
      await sqlEditor.selectConnection('test_db');
      await expect(sqlEditor.monacoEditor).toBeVisible({ timeout: 10000 });
    }
  });

  test('should return one row per generated value', async ({ electronApp }) => {
    const mainWindow = await findStableWindow(electronApp);
    const sqlEditor = new SqlEditorPage(mainWindow);

    await sqlEditor.setQuery('SELECT * FROM range(5)');
    await sqlEditor.runQuery();

    await sqlEditor.waitForResults();
    await sqlEditor.expectRowCount(5);
  });

  test('should show column aliases as headers', async ({ electronApp }) => {
    const mainWindow = await findStableWindow(electronApp);
    const sqlEditor = new SqlEditorPage(mainWindow);

    await sqlEditor.setQuery('SELECT 1 AS answer, 2 AS other_value');
    await sqlEditor.runQuery();

    await sqlEditor.waitForResults();
    // Headers are rendered title-cased from the column name
    const headers = sqlEditor.resultsTable.locator('th');
    await expect(headers.filter({ hasText: 'Answer' })).toBeVisible();
    await expect(headers.filter({ hasText: 'Other Value' })).toBeVisible();
    await sqlEditor.expectRowCount(1);
  });

  test('should render cell values', async ({ electronApp }) => {
    const mainWindow = await findStableWindow(electronApp);
    const sqlEditor = new SqlEditorPage(mainWindow);

    await sqlEditor.setQuery("SELECT 'hello' AS greeting, 42 AS number");
    await sqlEditor.runQuery();

    await sqlEditor.waitForResults();
    const firstRow = sqlEditor.resultsTable.locator('tbody tr').first();
    await expect(firstRow).toContainText('hello');
    await expect(firstRow).toContainText('42');
  });

  test('should replace results when a second query runs', async ({
    electronApp,
  }) => {
    const mainWindow = await findStableWindow(electronApp);
    const sqlEditor = new SqlEditorPage(mainWindow);

    await sqlEditor.setQuery('SELECT * FROM range(5)');
    await sqlEditor.runQuery();
    await sqlEditor.waitForResults();
    await sqlEditor.expectRowCount(5);

    await sqlEditor.setQuery('SELECT * FROM range(2)');
    await sqlEditor.runQuery();
    await expect
      .poll(() => sqlEditor.getResultsRowCount(), { timeout: 30000 })
      .toBe(2);
  });

  test('should recover from an error on the next valid query', async ({
    electronApp,
  }) => {
    const mainWindow = await findStableWindow(electronApp);
    const sqlEditor = new SqlEditorPage(mainWindow);
    const errorMessage = mainWindow.locator(
      '[data-testid="sql-error-message"]',
    );

    await sqlEditor.setQuery('SELECT * FROM table_that_does_not_exist');
    await sqlEditor.runQuery();
    await expect(errorMessage).toBeVisible();

    await sqlEditor.setQuery('SELECT 1 AS ok');
    await sqlEditor.runQuery();

    await sqlEditor.waitForResults();
    await expect(errorMessage).toBeHidden();
    await sqlEditor.expectRowCount(1);
  });
});
