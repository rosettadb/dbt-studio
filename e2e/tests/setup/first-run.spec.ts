import { Page, ElectronApplication } from '@playwright/test';
import { test, expect } from '../../fixtures/electron.fixture';
import { SetupWizardPage } from '../../page-objects/screens/SetupWizard';

test.use({ autoSkipSetup: false });

// Helper to find the setup window
const findSetupWindow = async (
  electronApp: ElectronApplication,
): Promise<Page | null> => {
  const windows = electronApp.windows();
  const existing = windows.find((window) => {
    const url = window.url();
    // Accept valid setup URL or error URL (to debug)
    return (
      url.includes('/setup') ||
      url.startsWith('file:') ||
      url.startsWith('chrome-error:')
    );
  });
  if (existing) return existing;

  // Waiting for setup window...
  try {
    return await electronApp.waitForEvent('window', {
      predicate: (w) => {
        const url = w.url();
        return (
          url.includes('/setup') ||
          url.startsWith('file:') ||
          url.startsWith('chrome-error:')
        );
      },
      timeout: 30000,
    });
  } catch (e) {
    return null;
  }
};

test.describe('First Run Experience', () => {
  test('should show setup wizard on first launch', async ({ electronApp }) => {
    const setupWindow = await findSetupWindow(electronApp);

    if (!setupWindow) {
      throw new Error('Setup window failed to appear.');
    }

    // Setup Window detected
    const url = setupWindow.url();

    if (url.startsWith('chrome-error:')) {
      throw new Error(`Setup window failed to load content. URL: ${url}`);
    }

    // Ensure the window load state is ready
    await setupWindow.waitForLoadState('domcontentloaded');

    const setupWizard = new SetupWizardPage(setupWindow);
    await setupWizard.expectToBeVisible();
  });

  test('should open with everything collapsed and 1.x picked', async ({
    electronApp,
  }) => {
    const setupWindow = await findSetupWindow(electronApp);
    if (!setupWindow) throw new Error('Setup window not found');
    await setupWindow.waitForLoadState('domcontentloaded');

    const setupWizard = new SetupWizardPage(setupWindow);

    await expect(setupWizard.stepLabel).toHaveText('Step 1 of 2');
    await setupWizard.expectCurrentStep('cli');
    await expect(
      setupWindow.getByLabel('dbt 1.x', { exact: true }),
    ).toBeChecked();
    // The picked row shows its newest version, or "Latest" when offline.
    await expect(setupWindow.getByTestId('setup-dbt-v1-summary')).toHaveText(
      /latest/i,
      { timeout: 30000 },
    );
    await expect(setupWindow.getByTestId('setup-adapters-summary')).toHaveText(
      'All 7 selected',
    );
    await expect(setupWindow.getByTestId('setup-tools-summary')).toHaveText(
      'None',
    );
    await expect(
      setupWindow.getByTestId('setup-adapter-checkboxes'),
    ).toBeHidden();

    // Install is one click away; nothing installs until it's clicked
    await expect(setupWindow.getByTestId('setup-install-btn')).toBeEnabled();
    await expect(setupWizard.skipButton).toBeVisible();
  });

  test('should open dbt 2.x with its versions and built-in adapters', async ({
    electronApp,
  }) => {
    const setupWindow = await findSetupWindow(electronApp);
    if (!setupWindow) throw new Error('Setup window not found');
    await setupWindow.waitForLoadState('domcontentloaded');

    await setupWindow.getByTestId('setup-dbt-v2-header').click();

    await expect(
      setupWindow.getByLabel('dbt 2.x', { exact: true }),
    ).toBeChecked();
    await expect(setupWindow.getByTestId('setup-adapters-summary')).toHaveText(
      '5 included with 2.x',
    );

    await setupWindow.getByTestId('setup-adapters-header').click();
    await expect(
      setupWindow.getByTestId('setup-adapter-included'),
    ).toBeVisible();
  });

  test('should pick Flowfile under Optional tools on the same page', async ({
    electronApp,
  }) => {
    const setupWindow = await findSetupWindow(electronApp);
    if (!setupWindow) throw new Error('Setup window not found');
    await setupWindow.waitForLoadState('domcontentloaded');

    await setupWindow.getByTestId('setup-tools-header').click();
    const flowfile = setupWindow.getByLabel('Flowfile');
    await expect(flowfile).not.toBeChecked();
    await flowfile.check();

    await expect(setupWindow.getByTestId('setup-tools-summary')).toHaveText(
      'Flowfile',
    );
    // The test stops here instead of clicking Install, so nothing downloads.
  });
});
