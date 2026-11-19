/**
 * Cloud Explorer (Object Explorer) Tests
 *
 * With no cloud sources configured every section renders from the local
 * store, so nothing here needs network access. The source picker tests save
 * a fake MinIO source in the test's own app data; its endpoint refuses
 * connections locally, so opening it never reaches the network either.
 */

import { Page } from '@playwright/test';
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

const SEEDED_SOURCE = { id: 'e2e-source-id', name: 'E2E Source' };

// Saves a source through the same IPC call the New Source form uses
const seedSource = async (window: Page): Promise<void> => {
  await window.evaluate(
    ([id, name]) =>
      (window as any).electron.ipcRenderer.invoke('source:create', {
        id,
        name,
        provider: 'minio',
        config: { endpoint: 'http://127.0.0.1:9', accessKeyId: 'e2e' },
        created: new Date(),
      }),
    [SEEDED_SOURCE.id, SEEDED_SOURCE.name],
  );
};

const openExplorerWithSource = async (
  electronApp: Parameters<typeof openProject>[0],
): Promise<Page> => {
  const window = await openProject(electronApp, PROJECT);
  await seedSource(window);
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

test.describe('Cloud Explorer source picker', () => {
  test('should offer only Add source when there are no sources', async ({
    electronApp,
  }) => {
    const window = await openExplorer(electronApp);

    await window.getByTestId('object-explorer-source-select').click();

    // With no sources there is no All Sources row, only Add source
    const rows = window
      .getByRole('menu')
      .locator('[role="menuitem"], [role="menuitemradio"]');
    await expect(rows).toHaveText(['Add source']);

    await rows.first().click();
    await expect(
      window.getByPlaceholder('My Storage Connection'),
    ).toBeVisible();
  });

  test('should open a source picked from the list', async ({ electronApp }) => {
    const window = await openExplorerWithSource(electronApp);
    const picker = window.getByTestId('object-explorer-source-select');

    await picker.click();
    const rows = window
      .getByRole('menu')
      .locator('[role="menuitem"], [role="menuitemradio"]');
    await expect(rows).toHaveText([
      'All Sources',
      SEEDED_SOURCE.name,
      'Add source',
    ]);

    await rows.filter({ hasText: SEEDED_SOURCE.name }).click();

    await expect
      .poll(() => window.url())
      .toContain(`/app/cloud-explorer/buckets/${SEEDED_SOURCE.id}`);
    await expect(picker).toHaveText(SEEDED_SOURCE.name);
  });

  test('should open the Sources page from All Sources', async ({
    electronApp,
  }) => {
    const window = await openExplorerWithSource(electronApp);

    await window.getByTestId('object-explorer-source-select').click();
    await window.getByRole('menuitem', { name: 'All Sources' }).click();

    await expect
      .poll(() => window.url())
      .toContain('/app/cloud-explorer/connections');
  });
});
