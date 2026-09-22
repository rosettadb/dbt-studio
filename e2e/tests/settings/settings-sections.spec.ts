/**
 * Settings Sections Tests
 *
 * Walks the settings side panel and checks each offline-safe section renders
 * its expected content. Sections that hit the network on mount (Local Runner,
 * dbt Core, Python, Rosetta CLI, Flowfile) and Keystore (macOS keychain) are
 * intentionally not opened here.
 */

import { Page } from '@playwright/test';
import { test, expect } from '../../fixtures/electron-seeded.fixture';
import { openProject } from '../../helpers/window.helper';
import { NavigationSidebarComponent } from '../../page-objects/components/NavigationSidebar';

const PROJECT = 'test_project';

const openSettings = async (electronApp: Parameters<typeof openProject>[0]) => {
  const window = await openProject(electronApp, PROJECT);
  const nav = new NavigationSidebarComponent(window);
  await nav.goToSettings();
  await expect(window.getByLabel('Projects Directory')).toBeVisible();
  return window;
};

const openSection = async (window: Page, label: string) => {
  await window.getByText(label, { exact: true }).click();
};

test.describe('Settings', () => {
  test('should land on General with the projects directory', async ({
    electronApp,
    userData,
  }) => {
    const window = await openSettings(electronApp);

    await expect.poll(() => window.url()).toContain('/app/settings/general');
    await expect(window.getByLabel('Projects Directory')).toHaveValue(
      /projects$/,
    );
    expect(userData.length).toBeGreaterThan(0);
    await expect(window.getByText('Current Installation')).toBeVisible();
    await expect(
      window.getByRole('button', { name: 'Check for Updates' }),
    ).toBeVisible();
  });

  test('should list every settings category', async ({ electronApp }) => {
    const window = await openSettings(electronApp);

    // eslint-disable-next-line no-restricted-syntax
    for (const label of [
      'AI Settings',
      'Rosetta Cloud',
      'Keystore',
      'Task Manager',
      'Backup & Restore',
      'dbt™ Core',
      'Python',
      'Rosetta CLI',
      'DuckDB',
      'Flowfile',
      'Local Runner',
      'Documentation',
      'About',
    ]) {
      // eslint-disable-next-line no-await-in-loop
      await expect(window.getByText(label, { exact: true })).toBeVisible();
    }
  });

  test('should show the empty Task Manager', async ({ electronApp }) => {
    const window = await openSettings(electronApp);
    await openSection(window, 'Task Manager');

    await expect(window.getByText('No tasks currently running.')).toBeVisible();
    await expect(window.getByText('No completed tasks yet.')).toBeVisible();
  });

  test('should show Backup & Restore actions', async ({ electronApp }) => {
    const window = await openSettings(electronApp);
    await openSection(window, 'Backup & Restore');

    await expect(window.getByText('Export Backup')).toBeVisible();
    await expect(
      window.getByRole('button', { name: 'Export ZIP' }),
    ).toBeVisible();
    await expect(window.getByText('Import Backup')).toBeVisible();
    await expect(
      window.getByRole('button', { name: 'Select Backup File' }),
    ).toBeVisible();
    // Nothing selected yet, so import cannot run
    await expect(
      window.getByRole('button', { name: 'Import', exact: true }),
    ).toBeDisabled();
  });

  test('should show About with the app version and factory reset', async ({
    electronApp,
  }) => {
    const window = await openSettings(electronApp);
    await openSection(window, 'About');

    // In the unpackaged dev build app.getVersion() reports Electron's own
    // version, while the renderer shows the package version, so match shape
    await expect(
      window.getByText(/^Version \d+\.\d+\.\d+.* \(Official Build\)$/),
    ).toBeVisible();
    await expect(
      window.getByRole('button', { name: 'Reset Factory Settings' }),
    ).toBeVisible();
  });

  test('should show AI Settings with no providers configured', async ({
    electronApp,
  }) => {
    const window = await openSettings(electronApp);
    await openSection(window, 'AI Settings');

    await expect(window.getByText('No AI Providers Configured')).toBeVisible();
    await expect(
      window.getByRole('button', { name: 'Add Your First Provider' }),
    ).toBeVisible();
    await expect(window.getByRole('tab', { name: 'Providers' })).toBeVisible();
    await expect(
      window.getByRole('tab', { name: 'MCP Servers' }),
    ).toBeVisible();
  });

  test('should show the Rosetta Cloud section', async ({ electronApp }) => {
    const window = await openSettings(electronApp);
    await openSection(window, 'Rosetta Cloud');

    // The connected/not-connected state depends on the host keychain (an
    // API key stored there is visible to every test run), so only the
    // always-present card heading is asserted.
    await expect(
      window.getByRole('heading', { name: 'Rosetta Cloud', exact: true }),
    ).toBeVisible();
    await expect(window.getByText('Cloud Dashboard Connection')).toBeVisible();
  });

  test('should switch the theme and persist it', async ({ electronApp }) => {
    const window = await openSettings(electronApp);

    // Snapshot every localStorage entry so the theme key can be found by what
    // changes, rather than by guessing MUI's storage key name.
    // `window` here is the Playwright Page, so use the bare browser global
    const readStorage = () =>
      window.evaluate(() => ({ ...localStorage }) as Record<string, string>);
    const changedEntries = (
      before: Record<string, string>,
      after: Record<string, string>,
    ) =>
      Object.entries(after)
        .filter(([key, value]) => before[key] !== value)
        .map(([, value]) => value)
        .join(' ');

    const initial = await readStorage();
    await window.getByRole('button', { name: 'Dark', exact: true }).click();
    await expect
      .poll(async () => changedEntries(initial, await readStorage()))
      .toContain('dark');

    const afterDark = await readStorage();
    await window.getByRole('button', { name: 'Light', exact: true }).click();
    await expect
      .poll(async () => changedEntries(afterDark, await readStorage()))
      .toContain('light');
  });
});
