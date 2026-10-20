/**
 * Db2 Connection Tests (opt-in)
 *
 * Needs a reachable Db2 LUW 11.1+ server, so it runs only when DB2_E2E_HOST
 * is set; CI has no Db2 and skips it. See plan 74 for a Docker recipe.
 *
 *   DB2_E2E_HOST=127.0.0.1 DB2_E2E_PORT=50000 DB2_E2E_DATABASE=TESTDB \
 *   DB2_E2E_USER=db2inst1 DB2_E2E_PASSWORD='...' \
 *   npm run test:e2e -- e2e/tests/connections/db2.spec.ts
 *
 * The large-result test also needs a table with more than 10,000 rows, named
 * by DB2_E2E_BIG_TABLE (default BIG_T).
 */

import * as fs from 'fs';
import * as path from 'path';
import { ElectronApplication, Page } from '@playwright/test';
import { test, expect } from '../../fixtures/electron-seeded.fixture';
import { openProject } from '../../helpers/window.helper';
import { NavigationSidebarComponent } from '../../page-objects/components/NavigationSidebar';
import { SqlEditorPage } from '../../page-objects/screens/SqlEditor';

const env = {
  host: process.env.DB2_E2E_HOST ?? '',
  port: process.env.DB2_E2E_PORT ?? '50000',
  database: process.env.DB2_E2E_DATABASE ?? 'TESTDB',
  user: process.env.DB2_E2E_USER ?? 'db2inst1',
  password: process.env.DB2_E2E_PASSWORD ?? '',
  bigTable: process.env.DB2_E2E_BIG_TABLE ?? 'BIG_T',
};

const CONNECTION = 'db2_e2e';
const PROJECT = 'test_project';

test.skip(!env.host, 'Set DB2_E2E_HOST to run the Db2 connection tests');

/**
 * Remove the secrets the Db2 form wrote to the OS keychain, through the app's
 * own secure-storage channel (the only place with keytar loaded).
 */
const cleanupKeychain = async (electronApp: ElectronApplication) => {
  const window = electronApp.windows().find((w) => !w.url().includes('splash'));
  if (!window) return;
  await window.evaluate(async (name) => {
    const { ipcRenderer } = (window as any).electron;
    await ipcRenderer.invoke('secure-storage:delete', {
      account: `db-user-${name}`,
    });
    await ipcRenderer.invoke('secure-storage:delete', {
      account: `db-password-${name}`,
    });
  }, CONNECTION);
};

const openDb2Form = async (window: Page) => {
  const nav = new NavigationSidebarComponent(window);
  await nav.goToConnections();
  await window.getByRole('button', { name: 'New Connection' }).first().click();
  await expect(window.getByText('Create New Connection')).toBeVisible();
  await window.getByRole('heading', { name: 'IBM Db2', exact: true }).click();
  await expect(window.getByText('Setup connection')).toBeVisible();
};

const field = (window: Page, name: string) =>
  window.getByRole('main').locator(`input[name="${name}"]`);

const fillDb2Form = async (window: Page, password: string) => {
  await field(window, 'name').fill(CONNECTION);
  await field(window, 'host').fill(env.host);
  await field(window, 'port').fill(env.port);
  await field(window, 'database').fill(env.database);
  await field(window, 'username').fill(env.user);
  await field(window, 'password').fill(password);
};

const toast = (
  window: Page,
  kind: 'success' | 'error',
  text: string | RegExp,
) => window.locator(`.Toastify__toast--${kind}`).filter({ hasText: text });

test.describe('Db2 connection', () => {
  test.afterEach(async ({ electronApp }) => {
    await cleanupKeychain(electronApp);
  });

  test('shows the Db2 error for a wrong password and rejects ; in passwords', async ({
    electronApp,
  }) => {
    const window = await openProject(electronApp, PROJECT);
    await openDb2Form(window);
    await fillDb2Form(window, 'definitely-wrong');

    await window.getByRole('button', { name: 'Test Connection' }).click();
    await expect(toast(window, 'error', /SQL30082N/)).toBeVisible({
      timeout: 30000,
    });

    await field(window, 'password').fill('has;semicolon');
    await window.getByRole('button', { name: 'Test Connection' }).click();
    await expect(
      toast(window, 'error', 'cannot send a password that contains ;'),
    ).toBeVisible();
  });

  test('creates a connection, keeps the password out of database.json, and queries it', async ({
    electronApp,
    userData,
  }) => {
    const window = await openProject(electronApp, PROJECT);
    await openDb2Form(window);
    await fillDb2Form(window, env.password);

    await window.getByRole('button', { name: 'Test Connection' }).click();
    await expect(
      toast(window, 'success', 'Connection test successful!'),
    ).toBeVisible({
      timeout: 30000,
    });

    await window.getByRole('button', { name: 'Save' }).click();
    await expect(
      toast(window, 'success', 'Db2 connection created successfully!'),
    ).toBeVisible();

    const card = window
      .getByRole('main')
      .locator('.MuiCard-root')
      .filter({ hasText: CONNECTION });
    await expect(card).toBeVisible();
    await expect(card.getByText(`Host: ${env.host}:${env.port}`)).toBeVisible();

    const stored = JSON.parse(
      fs.readFileSync(path.join(userData, 'database.json'), 'utf8'),
    );
    const saved = stored.connections.find(
      (c: any) => c.connection.name === CONNECTION,
    );
    expect(saved.connection.type).toBe('db2');
    expect(saved.connection.password).toBe('');
    expect(JSON.stringify(stored)).not.toContain(env.password);

    const nav = new NavigationSidebarComponent(window);
    await nav.navigateTo('sql');
    const sqlEditor = new SqlEditorPage(window);
    await sqlEditor.selectConnection(CONNECTION);
    await expect(sqlEditor.monacoEditor).toBeVisible({ timeout: 10000 });

    await sqlEditor.setQuery(`SELECT * FROM ${env.bigTable}`);
    await sqlEditor.runQuery();
    await sqlEditor.expectResultsToBeVisible();
    await expect(window.getByTestId('sql-results-truncated')).toHaveText(
      'Showing the first 10,000 rows',
      { timeout: 30000 },
    );

    await sqlEditor.setQuery('SELECT * FROM DOES_NOT_EXIST_E2E');
    await sqlEditor.runQuery();
    await expect(window.getByTestId('sql-error-message')).toContainText(
      'SQL0204N',
      { timeout: 30000 },
    );
  });
});
