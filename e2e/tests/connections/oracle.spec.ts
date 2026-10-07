/** Opt-in live Oracle coverage. Requires BIG_T from Plan 82's test fixture. */
import fs from 'fs/promises';
import path from 'path';
import { test, expect } from '../../fixtures/electron-seeded.fixture';
import { openProject } from '../../helpers/window.helper';
import { NavigationSidebarComponent } from '../../page-objects/components/NavigationSidebar';
import { SqlEditorPage } from '../../page-objects/screens/SqlEditor';
import type {
  ConnectionModel,
  QueryResponseType,
} from '../../../src/types/backend';
import type { CellOutput, Notebook } from '../../../src/types/notebooks';

const host = process.env.ORACLE_E2E_HOST;

test.describe('Oracle query connection (live)', () => {
  test.skip(
    !host,
    'Set ORACLE_E2E_HOST and the Oracle test credentials to run',
  );
  test('creates, tests, queries, cancels, pages and deletes an Oracle connection', async ({
    electronApp,
    userData,
  }) => {
    test.setTimeout(180000);
    const page = await openProject(electronApp, 'test_project');
    const nav = new NavigationSidebarComponent(page);
    const name = `oracle-e2e-${Date.now()}`;
    await nav.goToConnections();
    await page.getByRole('button', { name: 'New Connection' }).first().click();
    await page.getByRole('heading', { name: 'Oracle', exact: true }).click();
    await page.getByLabel('Connection Name').fill(name);
    await page.getByLabel('Host', { exact: false }).fill(host!);
    await page
      .getByLabel('Port', { exact: false })
      .fill(process.env.ORACLE_E2E_PORT || '1521');
    await page
      .getByLabel('Service name')
      .fill(process.env.ORACLE_E2E_SERVICE || 'FREEPDB1');
    await page
      .getByLabel('Username')
      .fill(process.env.ORACLE_E2E_USER || 'STUDIO');
    await page
      .getByLabel('Password', { exact: true })
      .fill(process.env.ORACLE_E2E_PASSWORD || '');
    await page.getByRole('button', { name: 'Test Connection' }).click();
    await expect(
      page
        .getByRole('status')
        .filter({ hasText: 'Connection test successful' }),
    ).toBeVisible();
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    const card = page
      .getByRole('main')
      .locator('.MuiCard-root')
      .filter({ hasText: name });
    await expect(card).toBeVisible();
    const models = (await page.evaluate(() =>
      window.electron.ipcRenderer.invoke('connector:list', false),
    )) as ConnectionModel[];
    const model = models.find((item) => item.connection.name === name)!;
    const persisted = JSON.parse(
      await fs.readFile(path.join(userData, 'database.json'), 'utf8'),
    );
    expect(
      persisted.connections.find(
        (item: ConnectionModel) => item.id === model.id,
      ).connection.password,
    ).toBe('');
    const wrongPassword = `wrong-${Date.now()}`;
    const authError = await page.evaluate(
      async ({ connection, password }) => {
        try {
          await window.electron.ipcRenderer.invoke('connector:test', {
            ...connection,
            password,
          });
          return '';
        } catch (error) {
          return String(error);
        }
      },
      { connection: model.connection, password: wrongPassword },
    );
    expect(authError).toContain('ORA-01017');
    expect(authError).not.toContain(wrongPassword);
    const table = `E2E_ORA_${Date.now()}`;
    const query = (sql: string) =>
      page.evaluate(
        ({ connectionId, statement }) =>
          window.electron.ipcRenderer.invoke('connector:executeQuery', {
            connectionId,
            query: statement,
          }),
        { connectionId: model.id, statement: sql },
      ) as Promise<QueryResponseType>;
    try {
      expect(await query(`CREATE TABLE ${table} (ID NUMBER)`)).toMatchObject({
        success: true,
        commandType: 'DDL',
      });
      expect(await query(`INSERT INTO ${table} VALUES (1);`)).toMatchObject({
        success: true,
        commandType: 'DML',
        rowCount: 1,
      });
      expect(await query('BEGIN NULL; END;\n/')).toMatchObject({
        success: true,
        commandType: 'PLSQL',
      });
      const values = await query(
        'SELECT 1 A, 2 A, 9007199254740993 EXACT_VALUE FROM DUAL;',
      );
      expect(values.success).toBe(true);
      expect(values.fields).toHaveLength(3);
      expect(String((values.data?.[0] as any).A)).toBe('1');
      expect(String((values.data?.[0] as any).A_1)).toBe('2');
      expect((values.data?.[0] as any).EXACT_VALUE).toBe('9007199254740993');
      const notebook = (await page.evaluate(
        (id) =>
          window.electron.ipcRenderer.invoke(
            'notebooks:create',
            id,
            'Oracle paging',
          ),
        model.id,
      )) as Notebook;
      const fetchPage = (offset: number) =>
        page.evaluate(
          ({ id, notebookId, start }) =>
            window.electron.ipcRenderer.invoke(
              'notebooks:fetchCellPage',
              id,
              notebookId,
              'cell',
              'SELECT * FROM BIG_T ORDER BY ID;',
              20,
              start,
            ),
          { id: model.id, notebookId: notebook.id, start: offset },
        ) as Promise<CellOutput>;
      const first = await fetchPage(0);
      const second = await fetchPage(20);
      const back = await fetchPage(0);
      expect(first.type).toBe('table');
      expect(first.totalRows).toBeGreaterThan(10000);
      expect(second.data?.[0]).not.toEqual(first.data?.[0]);
      expect(back.data).toEqual(first.data);
      const cancel = (await page.evaluate(async (id) => {
        const queryId = `oracle-cancel-${Date.now()}`;
        const running = window.electron.ipcRenderer.invoke(
          'connector:executeQuery',
          {
            connectionId: id,
            queryId,
            query: 'BEGIN DBMS_SESSION.SLEEP(60); END;',
          },
        );
        await new Promise((resolve) => {
          setTimeout(resolve, 2000);
        });
        await window.electron.ipcRenderer.invoke(
          'connector:cancel-query',
          queryId,
        );
        return running;
      }, model.id)) as QueryResponseType;
      expect(cancel).toMatchObject({
        success: false,
        error: 'Query cancelled',
      });
      expect(await query('SELECT 1 FROM DUAL')).toMatchObject({
        success: true,
      });
      await nav.goToSqlEditor();
      const select = page.getByTestId('sql-connection-select');
      await select.click();
      await page
        .locator('.MuiMenuItem-root')
        .filter({ hasText: name })
        .first()
        .click();
      const editor = new SqlEditorPage(page);
      await editor.setQuery('BEGIN NULL; END;\n/');
      await editor.runQuery();
      await expect(
        page
          .getByText('Command executed successfully', { exact: false })
          .first(),
      ).toBeVisible();
      await editor.setQuery(`SELECT * FROM NOPE_${Date.now()}`);
      await editor.runQuery();
      await expect(page.getByText(/ORA-00942/).first()).toBeVisible();
      await editor.setQuery('SELECT * FROM BIG_T');
      await editor.runQuery();
      await expect(
        page.getByText('Showing the first 10,000 rows', { exact: true }),
      ).toBeVisible();
    } finally {
      await query(`DROP TABLE ${table} PURGE`);
      await page.evaluate(
        (id) => window.electron.ipcRenderer.invoke('connector:delete', id),
        model.id,
      );
    }
    await nav.goToConnections();
    await expect(card).toBeHidden();
  });
});
