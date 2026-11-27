import { Page, ElectronApplication } from '@playwright/test';
import { test, expect } from '../../fixtures/electron-seeded.fixture';
import { SqlEditorPage } from '../../page-objects/screens/SqlEditor';
import { SchemaTreeComponent } from '../../page-objects/components/SchemaTree';
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

  return electronApp.waitForEvent('window', { predicate, timeout: 30000 });
};

// The seeded DuckDB connection is in-memory and empty, so each test creates
// its own table first. Running DDL refreshes the schema tree automatically.
const TABLE = 'e2e_orders';

const createSampleTable = async (sqlEditor: SqlEditorPage) => {
  await sqlEditor.setQuery(
    `CREATE TABLE ${TABLE} AS SELECT 1 AS id, 10 AS total UNION ALL SELECT 2, 20`,
  );
  await sqlEditor.runQuery();
  await sqlEditor.clearQuery();
};

test.describe('SQL Editor - Data tree interactions', () => {
  test.beforeEach(async ({ electronApp }) => {
    const mainWindow = await findStableWindow(electronApp);
    await mainWindow.waitForLoadState('domcontentloaded');

    const appHelper = new AppHelper(electronApp, mainWindow);
    await appHelper.skipSetupIfPresent();

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

    const nav = new NavigationSidebarComponent(mainWindow);
    await expect(mainWindow.locator('[data-testid="sidebar"]')).toBeVisible({
      timeout: 30000,
    });
    await nav.navigateTo('sql');

    const sqlEditor = new SqlEditorPage(mainWindow);
    const isEditorVisible = await sqlEditor.monacoEditor
      .isVisible({ timeout: 5000 })
      .catch(() => false);
    if (!isEditorVisible) {
      await sqlEditor.selectConnection('test_db');
      await expect(sqlEditor.monacoEditor).toBeVisible({ timeout: 10000 });
    }

    await createSampleTable(sqlEditor);
  });

  test('right-click → Generate SELECT inserts a statement for the table', async ({
    electronApp,
  }) => {
    const mainWindow = await findStableWindow(electronApp);
    const sqlEditor = new SqlEditorPage(mainWindow);
    const tree = new SchemaTreeComponent(mainWindow);

    await tree.expandSchema('main');
    await tree.expectTableVisible(TABLE);

    await tree.runTableAction(TABLE, 'generate-select');

    const text = await sqlEditor.getQueryText();
    expect(text).toContain(`FROM main.${TABLE}`);
    expect(text).toContain('LIMIT 100');
  });

  test('right-click → Preview data runs a query and shows results', async ({
    electronApp,
  }) => {
    const mainWindow = await findStableWindow(electronApp);
    const sqlEditor = new SqlEditorPage(mainWindow);
    const tree = new SchemaTreeComponent(mainWindow);

    await tree.expandSchema('main');
    await tree.expectTableVisible(TABLE);

    await tree.runTableAction(TABLE, 'preview');

    await sqlEditor.expectResultsToBeVisible();
    // Preview must not touch the editor content
    expect((await sqlEditor.getQueryText()).trim()).toBe('');
  });

  test('right-click on a column → Insert name inserts the column', async ({
    electronApp,
  }) => {
    const mainWindow = await findStableWindow(electronApp);
    const sqlEditor = new SqlEditorPage(mainWindow);
    const tree = new SchemaTreeComponent(mainWindow);

    await tree.expandSchema('main');
    await tree.expandTable(TABLE);
    await tree.runColumnAction(TABLE, 'total', 'insert-name');

    expect(await sqlEditor.getQueryText()).toContain('total');
  });

  test('dragging a table into the editor inserts its qualified name', async ({
    electronApp,
  }) => {
    const mainWindow = await findStableWindow(electronApp);
    const sqlEditor = new SqlEditorPage(mainWindow);
    const tree = new SchemaTreeComponent(mainWindow);

    await tree.expandSchema('main');
    await tree.expectTableVisible(TABLE);

    await tree.dragTableTo(TABLE, sqlEditor.monacoEditor);

    expect(await sqlEditor.getQueryText()).toContain(`main.${TABLE}`);
  });

  test('right-click a schema → Show ER diagram draws its tables and keys', async ({
    electronApp,
  }) => {
    const mainWindow = await findStableWindow(electronApp);
    const sqlEditor = new SqlEditorPage(mainWindow);
    const tree = new SchemaTreeComponent(mainWindow);

    // One real foreign key; the sample table has no link.
    // runQuery doesn't wait for the query, so each CREATE waits until its
    // table shows in the tree: the second one references the first.
    const createTable = async (table: string, statement: string) => {
      await sqlEditor.setQuery(statement);
      await sqlEditor.runQuery();
      await tree.expectTableVisible(table);
      await sqlEditor.clearQuery();
    };
    await tree.expandSchema('main');
    await tree.expectTableVisible(TABLE);
    await createTable(
      'e2e_customers',
      'CREATE TABLE e2e_customers (id INTEGER PRIMARY KEY, name VARCHAR)',
    );
    await createTable(
      'e2e_invoices',
      'CREATE TABLE e2e_invoices (id INTEGER, customer_id INTEGER REFERENCES e2e_customers(id))',
    );

    await tree.runSchemaAction('main', 'er-diagram');

    const diagram = mainWindow.getByTestId('er-diagram-modal');
    await expect(diagram).toBeVisible();
    await Promise.all(
      [TABLE, 'e2e_customers', 'e2e_invoices'].map((table) =>
        expect(
          diagram.locator('.react-flow__node').filter({ hasText: table }),
        ).toBeVisible(),
      ),
    );
    // A real key, so nothing is matched by name.
    await expect(diagram).toContainText('3 tables · 1 relationships');
    await expect(diagram).not.toContainText('matched by name');

    await mainWindow.keyboard.press('Escape');
    await expect(diagram).toBeHidden();
  });
});
