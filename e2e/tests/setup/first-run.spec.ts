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

  test('should start on the dbt choice with 1.x and its adapters', async ({
    electronApp,
  }) => {
    const setupWindow = await findSetupWindow(electronApp);
    if (!setupWindow) throw new Error('Setup window not found');
    await setupWindow.waitForLoadState('domcontentloaded');

    const setupWizard = new SetupWizardPage(setupWindow);

    await expect(setupWizard.stepLabel).toHaveText('Step 1 of 3');
    await setupWizard.expectCurrentStep('cli');
    await expect(
      setupWindow.getByLabel('dbt Core 1.x', { exact: true }),
    ).toBeChecked();
    await expect(
      setupWindow.getByTestId('setup-adapter-checkboxes'),
    ).toBeVisible();

    // Each card has its own version dropdown; only the chosen card's is
    // active. It shows the newest version, or "Latest" when offline.
    await expect(setupWindow.getByTestId('setup-dbt-version-v1')).toHaveText(
      /latest/i,
      { timeout: 30000 },
    );
    await expect(setupWindow.getByTestId('setup-dbt-version-v2')).toHaveClass(
      /Mui-disabled/,
    );

    // Nothing installs on the choice pages; Back only shows from step 2
    await expect(setupWizard.nextButton).toBeEnabled();
    await expect(setupWizard.backButton).toBeHidden();
    await expect(setupWizard.skipButton).toBeVisible();
  });

  test('should show the built-in adapters when dbt 2.x is chosen', async ({
    electronApp,
  }) => {
    const setupWindow = await findSetupWindow(electronApp);
    if (!setupWindow) throw new Error('Setup window not found');
    await setupWindow.waitForLoadState('domcontentloaded');

    await setupWindow.getByTestId('setup-dbt-v2').click();

    await expect(
      setupWindow.getByLabel('dbt Core 2.x', { exact: true }),
    ).toBeChecked();
    await expect(
      setupWindow.getByTestId('setup-adapter-included'),
    ).toBeVisible();
    await expect(
      setupWindow.getByTestId('setup-adapter-checkboxes'),
    ).toBeHidden();
  });

  test('should go to the Flowfile step and back, keeping the dbt choice', async ({
    electronApp,
  }) => {
    const setupWindow = await findSetupWindow(electronApp);
    if (!setupWindow) throw new Error('Setup window not found');
    await setupWindow.waitForLoadState('domcontentloaded');

    const setupWizard = new SetupWizardPage(setupWindow);
    await setupWindow.getByTestId('setup-dbt-v2').click();
    await setupWizard.clickNext();

    // Flowfile is optional and off by default; this step starts the installs,
    // so the test stops here instead of clicking Install.
    await expect(setupWizard.stepLabel).toHaveText('Step 2 of 3');
    await setupWizard.expectCurrentStep('flowfile');
    await expect(setupWindow.getByLabel('Flowfile')).not.toBeChecked();
    await expect(setupWindow.getByTestId('setup-install-btn')).toBeEnabled();

    await setupWizard.clickBack();
    await expect(setupWizard.stepLabel).toHaveText('Step 1 of 3');
    await expect(
      setupWindow.getByLabel('dbt Core 2.x', { exact: true }),
    ).toBeChecked();
  });
});
