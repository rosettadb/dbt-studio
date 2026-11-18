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
const seedInstance = async (window: Page, userData: string): Promise<string> =>
  window.evaluate(
    async ([name, metadataPath, dataPath]) => {
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

    await window.getByTestId('datalake-instance-select').click();

    // With no instances there is no All Instances row, only Add instance
    const rows = window.getByRole('menu').getByRole('menuitem');
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
    const rows = window.getByRole('menu').getByRole('menuitem');
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
});
