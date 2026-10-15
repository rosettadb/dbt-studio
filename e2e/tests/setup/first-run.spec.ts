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

  test('should start on the dbt version step with Install off', async ({
    electronApp,
  }) => {
    const setupWindow = await findSetupWindow(electronApp);
    if (!setupWindow) throw new Error('Setup window not found');
    await setupWindow.waitForLoadState('domcontentloaded');

    const setupWizard = new SetupWizardPage(setupWindow);

    await expect(setupWizard.stepLabel).toHaveText('Step 1 of 2');
    await setupWizard.expectCurrentStep('cli');
    await expect(
      setupWindow.getByText('Which dbt™ version would you like to install?'),
    ).toBeVisible();
    await expect(setupWindow.getByTestId('setup-dbt-v1')).toBeVisible();
    await expect(setupWindow.getByTestId('setup-dbt-v2')).toBeVisible();

    // Install turns on only after every choice is made
    await expect(setupWindow.getByTestId('setup-install-btn')).toBeDisabled();
    await expect(setupWizard.skipButton).toBeVisible();
  });

  test('should open the versions of dbt 2.x and its built-in adapters', async ({
    electronApp,
  }) => {
    const setupWindow = await findSetupWindow(electronApp);
    if (!setupWindow) throw new Error('Setup window not found');
    await setupWindow.waitForLoadState('domcontentloaded');

    await setupWindow.getByTestId('setup-dbt-v2').click();
    await expect(setupWindow.getByTestId('setup-summary-line')).toHaveText(
      'dbt 2.x',
    );

    // The real version list, or the "Latest" fallback when offline
    const versions = setupWindow.getByTestId('setup-dbt-versions');
    const latestFallback = setupWindow.getByTestId('setup-dbt-version-latest');
    await expect(versions.or(latestFallback)).toBeVisible({ timeout: 30000 });
    await setupWindow
      .locator(
        '[data-testid="setup-dbt-versions"] [role="radio"], [data-testid="setup-dbt-version-latest"]',
      )
      .first()
      .click();

    await expect(
      setupWindow.getByTestId('setup-adapter-included'),
    ).toBeVisible();
  });

  test('should turn Install on after all four steps, with Flowfile ticked', async ({
    electronApp,
  }) => {
    const setupWindow = await findSetupWindow(electronApp);
    if (!setupWindow) throw new Error('Setup window not found');
    await setupWindow.waitForLoadState('domcontentloaded');

    await setupWindow.getByTestId('setup-dbt-v1').click();
    await setupWindow
      .locator(
        '[data-testid="setup-dbt-versions"] [role="radio"], [data-testid="setup-dbt-version-latest"]',
      )
      .first()
      .click({ timeout: 30000 });
    await setupWindow.getByTestId('setup-continue-adapters').click();

    const flowfile = setupWindow.getByLabel('Flowfile');
    await expect(flowfile).not.toBeChecked();
    await flowfile.check();
    await setupWindow.getByTestId('setup-continue-tools').click();

    await expect(setupWindow.getByTestId('setup-summary-tools')).toHaveText(
      'Flowfile',
    );
    await expect(setupWindow.getByTestId('setup-install-btn')).toBeEnabled();
    // The test stops here instead of clicking Install, so nothing downloads.
  });
});
