/**
 * DataLake Tests
 *
 * Empty-state coverage for the DataLake screens. Mounting the screen kicks
 * off a best-effort pyiceberg install into the managed Python environment,
 * which shows an info banner for up to five seconds and fails silently
 * offline, so assertions here avoid depending on it. The instance picker
 * tests save a DuckLake instance in the test's own app data folder.
 */

import * as path from 'path';
import { Page } from '@playwright/test';
import { test, expect } from '../../fixtures/electron-seeded.fixture';
import { openProject } from '../../helpers/window.helper';
import { NavigationSidebarComponent } from '../../page-objects/components/NavigationSidebar';

const PROJECT = 'test_project';

const openDataLake = async (electronApp: Parameters<typeof openProject>[0]) => {
  const window = await openProject(electronApp, PROJECT);
  const nav = new NavigationSidebarComponent(window);
  await nav.goToDataLake();
  await expect(
    window.getByRole('heading', { name: 'DataLake Dashboard' }),
  ).toBeVisible();
  return window;
};

const SEEDED_INSTANCE_NAME = 'E2E_Lake';

// Saves an instance through the same IPC call the Create DataLake form uses.
// The app picks the id, so it is returned for the URL check.
//
// Prerequisite: creating an instance first sets up DuckDB's "ducklake"
// extension, which must be bundled, already installed, or installable from
// the network on the machine running the tests.
const seedInstance = async (window: Page, userData: string): Promise<string> =>
  window.evaluate(
    async ([name, metadataPath, dataPath]) => {
      try {
        const instance = await (window as any).electron.ipcRenderer.invoke(
          'ducklake:instance:create',
          {
            name,
            dataPath,
            catalog: { type: 'duckdb', duckdb: { metadataPath } },
            storage: { type: 'local', local: { path: dataPath } },
          },
        );
        return instance.id as string;
      } catch (error) {
        throw new Error(
          'Could not create the test DuckLake instance. These tests need ' +
            "DuckDB's ducklake extension (bundled, installed, or installable " +
            `from the network): ${(error as Error).message}`,
        );
      }
    },
    [
      SEEDED_INSTANCE_NAME,
      path.join(userData, 'e2e_lake.duckdb'),
      path.join(userData, 'e2e_lake_data'),
    ],
  );

const openDataLakeWithInstance = async (
  electronApp: Parameters<typeof openProject>[0],
  userData: string,
): Promise<{ window: Page; instanceId: string }> => {
  const window = await openProject(electronApp, PROJECT);
  const instanceId = await seedInstance(window, userData);
  const nav = new NavigationSidebarComponent(window);
  await nav.goToDataLake();
  await expect(
    window.getByRole('heading', { name: 'DataLake Dashboard' }),
  ).toBeVisible();
  return { window, instanceId };
};

// Runs one statement in the instance through the same IPC call as the SQL
// screen. DuckLake has no keys, so the diagram matches links by name.
const runInInstance = async (
  window: Page,
  instanceId: string,
  query: string,
): Promise<void> => {
  const result = await window.evaluate(
    ([id, sql]) =>
      (window as any).electron.ipcRenderer.invoke('ducklake:query:execute', {
        instanceId: id,
        query: sql,
      }),
    [instanceId, query],
  );
  if (!result?.success) {
    throw new Error(`DuckLake query failed: ${result?.error ?? 'unknown'}`);
  }
};

// Seeds two linked tables and opens the instance page.
const openInstanceWithLinkedTables = async (
  electronApp: Parameters<typeof openProject>[0],
  userData: string,
): Promise<Page> => {
  const { window, instanceId } = await openDataLakeWithInstance(
    electronApp,
    userData,
  );
  await runInInstance(
    window,
    instanceId,
    'CREATE TABLE e2e_customers (id INTEGER, name VARCHAR)',
  );
  await runInInstance(
    window,
    instanceId,
    // e2e_customer_id → e2e_customers.id
    'CREATE TABLE e2e_orders (id INTEGER, e2e_customer_id INTEGER)',
  );

  await window.getByTestId('datalake-instance-select').click();
  await window
    .getByRole('menu')
    .locator('[role="menuitem"], [role="menuitemradio"]')
    .filter({ hasText: SEEDED_INSTANCE_NAME })
    .click();
  await expect
    .poll(() => window.url())
    .toContain(`/app/data-lake/duck-lake/instances/${instanceId}`);
  return window;
};

test.describe('DataLake', () => {
  test('should show the empty dashboard', async ({ electronApp }) => {
    const window = await openDataLake(electronApp);

    await expect(window.getByText('Welcome to DataLake')).toBeVisible();
    await expect(
      window.getByRole('button', { name: 'Create DataLake' }),
    ).toBeVisible();
  });

  test('should show empty instances list', async ({ electronApp }) => {
    const window = await openDataLake(electronApp);

    await window.getByText('DataLakes', { exact: true }).click();

    await expect(
      window.getByRole('heading', { name: 'DataLake Instances', exact: true }),
    ).toBeVisible();
    await expect(window.getByText('No DataLake Instances')).toBeVisible();
  });

  test('should offer only Add instance in the empty instance picker', async ({
    electronApp,
  }) => {
    const window = await openDataLake(electronApp);

    // Both instance lists load successfully and are empty, so the picker
    // below shows a real empty list rather than a failed or pending one
    await expect
      .poll(() =>
        window.evaluate(async () => {
          const { invoke } = (window as any).electron.ipcRenderer;
          const [duckLake, iceberg] = await Promise.all([
            invoke('ducklake:instance:list'),
            invoke('iceberg:list'),
          ]);
          return [duckLake.length, iceberg.length];
        }),
      )
      .toEqual([0, 0]);

    await window.getByTestId('datalake-instance-select').click();

    // With no instances there is no All Instances row, only Add instance
    const rows = window
      .getByRole('menu')
      .locator('[role="menuitem"], [role="menuitemradio"]');
    await expect(rows).toHaveText(['Add instance']);

    await rows.first().click();
    await expect(window.getByText('Create New DataLake')).toBeVisible();
  });

  test('should open an instance picked from the instance picker', async ({
    electronApp,
    userData,
  }) => {
    const { window, instanceId } = await openDataLakeWithInstance(
      electronApp,
      userData,
    );
    const picker = window.getByTestId('datalake-instance-select');

    await picker.click();
    const rows = window
      .getByRole('menu')
      .locator('[role="menuitem"], [role="menuitemradio"]');
    await expect(rows).toHaveText([
      'All Instances',
      SEEDED_INSTANCE_NAME,
      'Add instance',
    ]);

    await rows.filter({ hasText: SEEDED_INSTANCE_NAME }).click();

    await expect
      .poll(() => window.url())
      .toContain(`/app/data-lake/duck-lake/instances/${instanceId}`);
    await expect(picker).toHaveText(SEEDED_INSTANCE_NAME);
  });

  test('should open the instances page from All Instances', async ({
    electronApp,
    userData,
  }) => {
    const { window } = await openDataLakeWithInstance(electronApp, userData);

    await window.getByTestId('datalake-instance-select').click();
    await window.getByRole('menuitem', { name: 'All Instances' }).click();

    await expect.poll(() => window.url()).toContain('/app/data-lake/instances');
    await expect(
      window.getByRole('heading', { name: 'DataLake Instances', exact: true }),
    ).toBeVisible();
  });

  test('should offer lake types with unreleased ones disabled', async ({
    electronApp,
  }) => {
    const window = await openDataLake(electronApp);

    await window.getByRole('button', { name: 'New DataLake' }).click();

    await expect(window.getByText('Create New DataLake')).toBeVisible();
    // Each lake type is a card with an h2 heading; Iceberg carries a BETA chip
    await expect(
      window.getByRole('heading', { name: 'DuckLake', exact: true }),
    ).toBeVisible();
    await expect(
      window.getByRole('heading', { name: /^Apache Iceberg/ }),
    ).toBeVisible();
    await expect(
      window.getByRole('heading', { name: 'Delta Lake', exact: true }),
    ).toBeVisible();
    await expect(
      window.getByRole('heading', { name: 'Apache Hudi', exact: true }),
    ).toBeVisible();
  });

  test('should show an ER diagram of the instance tables', async ({
    electronApp,
    userData,
  }) => {
    const window = await openInstanceWithLinkedTables(electronApp, userData);

    await window.getByTestId('data-lake-er-diagram-button').click();

    const diagram = window.getByTestId('er-diagram-modal');
    await expect(diagram).toBeVisible();
    await expect(diagram).toContainText(SEEDED_INSTANCE_NAME);
    await Promise.all(
      ['e2e_customers', 'e2e_orders'].map((table) =>
        expect(
          diagram.locator('.react-flow__node').filter({ hasText: table }),
        ).toBeVisible(),
      ),
    );
    await expect(diagram).toContainText(
      '2 tables · 1 relationships (1 matched by name)',
    );

    await window.keyboard.press('Escape');
    await expect(diagram).toBeHidden();
  });

  test("should show a table's linked tables in its ER Diagram tab", async ({
    electronApp,
    userData,
  }) => {
    const window = await openInstanceWithLinkedTables(electronApp, userData);

    await window.getByRole('row').filter({ hasText: 'e2e_orders' }).click();
    await expect.poll(() => window.url()).toContain('/tables/e2e_orders');

    await window.getByRole('tab', { name: 'ER Diagram' }).click();

    const diagram = window.getByTestId('table-er-diagram');
    await expect(diagram).toBeVisible();
    await expect(
      window.getByText(/^e2e_orders and the 1 table linked to it\./),
    ).toBeVisible();
    await Promise.all(
      ['e2e_customers', 'e2e_orders'].map((table) =>
        expect(
          diagram.locator('.react-flow__node').filter({ hasText: table }),
        ).toBeVisible(),
      ),
    );
  });
});
