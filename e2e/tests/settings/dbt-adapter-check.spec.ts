/**
 * dbt Core settings: the spinner left of Install All Adapters.
 *
 * The dbt version list (PyPI) and the installed package check (pip) are
 * replaced in the main process, so the page stays offline and the check
 * stays open until the test lets it finish.
 */

import { ElectronApplication } from '@playwright/test';
import { test, expect } from '../../fixtures/electron-seeded.fixture';
import { openProject } from '../../helpers/window.helper';
import { NavigationSidebarComponent } from '../../page-objects/components/NavigationSidebar';

const mockDbtMainProcess = (electronApp: ElectronApplication) =>
  electronApp.evaluate(({ ipcMain }) => {
    const state: { finishChecks: (() => void)[]; released: boolean } = {
      finishChecks: [],
      released: false,
    };
    (global as any).dbtAdapterCheckE2E = state;

    ipcMain.removeHandler('dbt:versions:list');
    ipcMain.handle('dbt:versions:list', () => ({
      versions: [],
      latestStable: null,
      currentVersion: null,
    }));

    ipcMain.removeHandler('dbt:packages:installed');
    // Checks wait until the test releases them; later ones answer at once.
    ipcMain.handle('dbt:packages:installed', () =>
      state.released
        ? { packages: {} }
        : new Promise((resolve) => {
            state.finishChecks.push(() => resolve({ packages: {} }));
          }),
    );
  });

const finishPackageChecks = (electronApp: ElectronApplication) =>
  electronApp.evaluate(() => {
    const state = (global as any).dbtAdapterCheckE2E;
    state.released = true;
    state.finishChecks.forEach((finish: () => void) => finish());
  });

test.describe('dbt Core settings', () => {
  test('spins left of Install All Adapters while installed packages are checked', async ({
    electronApp,
  }) => {
    const window = await openProject(electronApp, 'test_project');
    await mockDbtMainProcess(electronApp);
    await new NavigationSidebarComponent(window).goToSettings();
    await window.getByText('dbt™ Core', { exact: true }).click();

    const spinner = window.getByRole('progressbar', {
      name: 'Checking installed packages',
    });
    await expect(spinner).toBeVisible();
    // Same header slot as the button, right before it.
    await expect(
      spinner.locator('xpath=following-sibling::*[1]'),
    ).toHaveAccessibleName('Install All Adapters');

    await finishPackageChecks(electronApp);
    await expect(spinner).toHaveCount(0);
    await expect(
      window.getByRole('button', { name: 'Install All Adapters' }),
    ).toBeVisible();
  });
});
