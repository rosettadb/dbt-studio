/**
 * Cloud Explorer (Object Explorer) Tests
 *
 * With no cloud sources configured every section renders from the local
 * store, so nothing here needs network access.
 */

import { test, expect } from '../../fixtures/electron-seeded.fixture';
import { openProject } from '../../helpers/window.helper';
import { NavigationSidebarComponent } from '../../page-objects/components/NavigationSidebar';

const PROJECT = 'test_project';

const openExplorer = async (electronApp: Parameters<typeof openProject>[0]) => {
  const window = await openProject(electronApp, PROJECT);
  const nav = new NavigationSidebarComponent(window);
  await nav.goToCloudExplorer();
  await expect(
    window.getByRole('heading', { name: 'Dashboard', exact: true }),
  ).toBeVisible();
  return window;
};

test.describe('Cloud Explorer', () => {
  test('should show the empty dashboard', async ({ electronApp }) => {
    const window = await openExplorer(electronApp);

    await expect
      .poll(() => window.url())
      .toContain('/app/cloud-explorer/dashboard');
    await expect(window.getByText('Total Connections')).toBeVisible();
    await expect(window.getByText('Welcome to Cloud Explorer')).toBeVisible();
    await expect(
      window.getByRole('button', { name: 'Manage Connections' }),
    ).toBeVisible();
  });

  test('should show empty Sources and Recent Items', async ({
    electronApp,
  }) => {
    const window = await openExplorer(electronApp);

    await window.getByText('Sources', { exact: true }).click();
    await expect(window.getByText('No connections found')).toBeVisible();

    await window.getByText('Recent Items', { exact: true }).click();
    await expect(window.getByText('No recent items')).toBeVisible();
    await expect(
      window.getByRole('button', { name: 'Browse Storage' }),
    ).toBeVisible();
  });

  test('should open the new source form and cancel', async ({
    electronApp,
  }) => {
    const window = await openExplorer(electronApp);

    await window.getByRole('button', { name: 'New Source' }).first().click();

    await expect(
      window.getByPlaceholder('My Storage Connection'),
    ).toBeVisible();
    await expect(
      window.getByRole('button', { name: 'Save Connection' }),
    ).toBeVisible();
    await expect(
      window.getByRole('button', { name: 'Test Connection' }),
    ).toBeVisible();

    await window.getByRole('button', { name: 'Cancel' }).click();
    await expect(window.getByPlaceholder('My Storage Connection')).toBeHidden();
  });
});
