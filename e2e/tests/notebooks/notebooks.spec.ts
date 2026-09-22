/**
 * Notebooks Tests
 *
 * Selecting a connection, the empty state, and creating a notebook with a
 * cell. Notebook data is stored in the local SQLite database.
 */

import { Page } from '@playwright/test';
import { test, expect } from '../../fixtures/electron-seeded.fixture';
import { openProject } from '../../helpers/window.helper';
import { NavigationSidebarComponent } from '../../page-objects/components/NavigationSidebar';

const PROJECT = 'test_project';

const openNotebooksWithConnection = async (
  electronApp: Parameters<typeof openProject>[0],
): Promise<Page> => {
  const window = await openProject(electronApp, PROJECT);
  const nav = new NavigationSidebarComponent(window);
  await nav.goToNotebooks();

  const select = window.locator('[data-testid="notebooks-connection-select"]');
  await expect(select).toBeVisible();
  await select.click();
  await window
    .locator('.MuiMenuItem-root')
    .filter({ hasText: 'test_db' })
    .first()
    .click();

  await expect(window.getByRole('tab', { name: 'Notebooks' })).toBeVisible();
  return window;
};

test.describe('Notebooks', () => {
  test('should ask for a connection before showing the sidebar', async ({
    electronApp,
  }) => {
    const window = await openProject(electronApp, PROJECT);
    const nav = new NavigationSidebarComponent(window);
    await nav.goToNotebooks();

    await expect(
      window.getByText('Select a connection to view schema and notebooks'),
    ).toBeVisible();
    await expect(window.getByRole('tab', { name: 'Notebooks' })).toBeHidden();
  });

  test('should show sidebar tabs and the empty state after selecting a connection', async ({
    electronApp,
  }) => {
    const window = await openNotebooksWithConnection(electronApp);

    await expect(window.getByRole('tab', { name: 'Data' })).toBeVisible();
    await expect(window.getByRole('tab', { name: 'Analytics' })).toBeVisible();
    await expect(window.getByPlaceholder('Search notebooks...')).toBeVisible();
    await expect(window.getByText('No Notebook Open')).toBeVisible();
    await expect(
      window.getByRole('button', { name: 'Create New Notebook' }),
    ).toBeVisible();
  });

  test('should require a name to create a notebook', async ({
    electronApp,
  }) => {
    const window = await openNotebooksWithConnection(electronApp);

    await window.getByRole('button', { name: 'Create New Notebook' }).click();
    const dialog = window.getByRole('dialog');
    await expect(dialog.getByText('Create New Notebook')).toBeVisible();
    await expect(dialog.getByRole('button', { name: 'Create' })).toBeDisabled();

    await dialog.getByRole('button', { name: 'Cancel' }).click();
    await expect(dialog).toBeHidden();
  });

  test('should create a notebook and add a cell', async ({ electronApp }) => {
    const window = await openNotebooksWithConnection(electronApp);

    await window.getByRole('button', { name: 'Create New Notebook' }).click();
    const dialog = window.getByRole('dialog');
    await dialog.getByLabel('Notebook Name').fill('E2E Notebook');
    await dialog.getByRole('button', { name: 'Create' }).click();
    await expect(dialog).toBeHidden();

    // The new notebook opens in a tab with its toolbar and no cells yet
    await expect(
      window.getByRole('tab', { name: /E2E Notebook/ }),
    ).toBeVisible();
    const addCell = window.getByRole('button', { name: 'Add new cell' });
    await expect(addCell).toBeVisible();
    await expect(window.getByText('[1]', { exact: true })).toBeHidden();

    await addCell.click();

    // A first SQL cell appears with its index badge and editor. (The
    // "N cells" chip in the toolbar reflects the persisted notebook and lags
    // behind local edits, so it is not asserted on.)
    await expect(window.getByText('[1]', { exact: true })).toBeVisible();
    await expect(
      window.getByText('SQL', { exact: true }).first(),
    ).toBeVisible();
    await expect(
      window.getByRole('button', { name: 'Add Cell', exact: true }),
    ).toBeVisible();

    // It is listed in the sidebar too
    await expect(
      window.getByRole('treeitem', { name: 'E2E Notebook' }),
    ).toBeVisible();
  });
});
