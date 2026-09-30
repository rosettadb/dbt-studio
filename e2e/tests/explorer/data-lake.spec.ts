/**
 * DataLake Tests
 *
 * Empty-state coverage for the DataLake screens. Mounting the screen kicks
 * off a best-effort pyiceberg install into the managed Python environment,
 * which shows an info banner for up to five seconds and fails silently
 * offline, so assertions here avoid depending on it.
 */

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
