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

/**
 * Seeds a Python notebook through the app's own IPC so the add-cell tests
 * have something to open. The Create dialog is gated on an installed
 * interpreter, and the unsupported version here makes the background
 * environment setup fail fast instead of downloading Python; the editor
 * still renders the cells with an "Environment setup failed" banner.
 */
const seedPythonNotebook = async (
  window: Page,
  name: string,
): Promise<void> => {
  await window.evaluate(
    ([connectionId, notebookName]) =>
      (window as any).electron.ipcRenderer.invoke(
        'pythonNotebooks:create',
        connectionId,
        { name: notebookName, pythonVersion: '0.0.0-e2e' },
      ),
    ['test-connection-id', name],
  );
};

const openSeededNotebook = async (
  electronApp: Parameters<typeof openProject>[0],
  name: string,
): Promise<Page> => {
  const window = await openProject(electronApp, PROJECT);
  await seedPythonNotebook(window, name);

  const nav = new NavigationSidebarComponent(window);
  await nav.goToNotebooks();
  await window.locator('[data-testid="notebooks-connection-select"]').click();
  await window
    .locator('.MuiMenuItem-root')
    .filter({ hasText: 'test_db' })
    .first()
    .click();

  await window
    .locator('[data-testid="notebook-tree-item-python"]')
    .filter({ hasText: name })
    .click();
  await expect(
    window.locator('[data-testid="python-notebook-editor"]'),
  ).toBeVisible();
  return window;
};

const cell = (window: Page, index: number) =>
  window.locator(`[data-testid="python-cell-${index}"]`);

/** The persistent "Add cell" bar below the last cell (last bar in DOM order). */
const trailingInsertBar = (window: Page) =>
  window
    .locator('[data-testid="python-notebook-editor"] .cell-insert-bar')
    .last();

const cellType = (window: Page, index: number) =>
  window.locator(`[data-testid="python-cell-type-${index}"]`);

test.describe('Notebook cells', () => {
  test('should open a seeded notebook with its initial Python cell and a persistent add-cell bar', async ({
    electronApp,
  }) => {
    const window = await openSeededNotebook(electronApp, 'Cells Notebook');

    // A new notebook starts with one empty code cell
    await expect(cell(window, 0)).toBeVisible();
    await expect(cellType(window, 0)).toHaveAttribute(
      'aria-label',
      'Python cell',
    );
    await expect(cell(window, 1)).toHaveCount(0);

    // The trailing bar is always expanded: Code / SQL / Text are visible
    // without hovering
    await expect(window.getByText('Add cell', { exact: true })).toBeVisible();
    const bar = trailingInsertBar(window);
    await expect(bar.getByRole('button', { name: 'Code' })).toBeVisible();
    await expect(bar.getByRole('button', { name: 'SQL' })).toBeVisible();
    await expect(bar.getByRole('button', { name: 'Text' })).toBeVisible();
  });

  test('should append SQL and text cells from the trailing add-cell bar', async ({
    electronApp,
  }) => {
    const window = await openSeededNotebook(electronApp, 'Append Notebook');
    const bar = trailingInsertBar(window);

    await bar.getByRole('button', { name: 'SQL' }).click();
    await expect(cell(window, 1)).toBeVisible();
    await expect(cellType(window, 1)).toHaveAttribute('aria-label', 'SQL cell');

    await trailingInsertBar(window)
      .getByRole('button', { name: 'Text' })
      .click();
    await expect(cell(window, 2)).toBeVisible();
    await expect(cellType(window, 2)).toHaveAttribute(
      'aria-label',
      'Markdown cell',
    );

    // The original cell is untouched and still first
    await expect(cellType(window, 0)).toHaveAttribute(
      'aria-label',
      'Python cell',
    );
    await expect(cell(window, 3)).toHaveCount(0);
  });

  test('should insert a cell between cells from the hover divider', async ({
    electronApp,
  }) => {
    const window = await openSeededNotebook(electronApp, 'Insert Notebook');
    const editor = window.locator('[data-testid="python-notebook-editor"]');

    // Two cells so a divider bar exists between them
    await trailingInsertBar(window)
      .getByRole('button', { name: 'SQL' })
      .click();
    await expect(cell(window, 1)).toBeVisible();

    // Bars in DOM order: before cell 0, between cell 0 and 1, trailing.
    // The divider buttons only show on hover.
    const between = editor.locator('.cell-insert-bar').nth(1);
    await expect(between.getByRole('button', { name: 'Text' })).toBeHidden();
    await between.hover();
    await between.getByRole('button', { name: 'Text' }).click();

    // Inserted at index 1, pushing the SQL cell to index 2
    await expect(cellType(window, 0)).toHaveAttribute(
      'aria-label',
      'Python cell',
    );
    await expect(cellType(window, 1)).toHaveAttribute(
      'aria-label',
      'Markdown cell',
    );
    await expect(cellType(window, 2)).toHaveAttribute('aria-label', 'SQL cell');
  });
});

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

  test('should only create Python notebooks', async ({ electronApp }) => {
    const window = await openNotebooksWithConnection(electronApp);

    await window.getByRole('button', { name: 'Create New Notebook' }).click();
    const dialog = window.getByRole('dialog');

    // No SQL/Python choice any more: every notebook needs a managed
    // interpreter, so the runtime picker is always shown.
    await expect(
      dialog.locator('[data-testid="create-notebook-kind"]'),
    ).toBeHidden();
    await expect(
      dialog.locator('[data-testid="python-runtime-select"]'),
    ).toBeVisible();

    // Until an interpreter is installed the Create button stays disabled
    // even with a name.
    await dialog.getByLabel('Notebook Name').fill('Py Notebook');
    await expect(
      dialog.locator('[data-testid="create-notebook-confirm"]'),
    ).toBeDisabled();
    await expect(dialog.getByRole('button', { name: 'Install' })).toBeVisible();

    await dialog.getByRole('button', { name: 'Cancel' }).click();
    await expect(dialog).toBeHidden();
  });
});
