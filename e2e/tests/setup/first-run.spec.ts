import * as fs from 'fs';
import * as path from 'path';
import { Page, ElectronApplication } from '@playwright/test';
import { test as base, expect } from '../../fixtures/electron.fixture';
import { SetupWizardPage } from '../../page-objects/screens/SetupWizard';
import { CURRENT_SCHEMA_VERSION } from '../../../src/main/database/migrations';

const test = base.extend<{ seedSetupStep: 'runner' | null }>({
  seedSetupStep: [null, { option: true }],

  // Seed database.json before the app launches so the wizard resumes at the
  // requested step (isSetup stays 'false' so the setup window still opens).
  userData: async ({ userData, seedSetupStep }, use) => {
    if (seedSetupStep === 'runner') {
      // The wizard only checks that these paths are non-empty, but main.ts
      // re-embeds Python when pythonPath doesn't exist on disk, so point at a
      // binary that is guaranteed to exist to avoid a download during tests.
      const settings = {
        schemaVersion: CURRENT_SCHEMA_VERSION,
        settings: {
          isSetup: 'false',
          pythonPath: process.execPath,
          dbtPath: process.execPath,
        },
        projects: [],
        connections: [],
      };
      fs.writeFileSync(
        path.join(userData, 'database.json'),
        JSON.stringify(settings, null, 2),
      );
    }
    await use(userData);
  },
});

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

  test('should show CLI install step initially', async ({ electronApp }) => {
    const setupWindow = await findSetupWindow(electronApp);
    if (!setupWindow) throw new Error('Setup window not found');
    await setupWindow.waitForLoadState('domcontentloaded');

    const setupWizard = new SetupWizardPage(setupWindow);

    // The first step corresponds to CLI install in the actual app
    await expect(setupWizard.cliInstallStep).toBeVisible();

    // Verify install button is present
    const installBtn = setupWindow.getByTestId('setup-install-btn');
    await expect(installBtn).toBeVisible();

    // verify Next button is present but disabled (until install)
    await expect(setupWizard.nextButton).toBeVisible();
    await expect(setupWizard.nextButton).toBeDisabled();
  });

  // TODO: Add test for completing wizard once we have a mock strategy for installation
});

test.describe('First Run Experience - Local Runner step', () => {
  test.use({ seedSetupStep: 'runner' });

  test('should show local runner install step after python and dbt are set', async ({
    electronApp,
  }) => {
    const setupWindow = await findSetupWindow(electronApp);
    if (!setupWindow) throw new Error('Setup window not found');
    await setupWindow.waitForLoadState('domcontentloaded');

    const setupWizard = new SetupWizardPage(setupWindow);
    await setupWizard.expectToBeVisible();

    // With pythonPath and dbtPath seeded, the wizard resumes at the runner step
    await setupWizard.expectCurrentStep('runner');
    await expect(setupWizard.cliInstallStep).toBeHidden();
    await expect(setupWizard.completionStep).toBeHidden();

    // Verify runner install button is present
    const installBtn = setupWindow.getByTestId('setup-install-runner-btn');
    await expect(installBtn).toBeVisible();

    // Next button is present but disabled until the runner is installed
    await expect(setupWizard.nextButton).toBeVisible();
    await expect(setupWizard.nextButton).toBeDisabled();

    // Skip is still available as an escape hatch
    await expect(setupWizard.skipButton).toBeVisible();
  });
});
