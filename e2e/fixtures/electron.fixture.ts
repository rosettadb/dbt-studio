/**
 * Electron E2E Test Fixture
 *
 * This fixture provides isolated Electron app instances for each test.
 * Features:
 * - Isolated userData directory per test
 * - Proper app launch and cleanup
 * - Environment variables for test mode
 */

import { _electron as electron } from 'playwright';
import { test as base, ElectronApplication, Page } from '@playwright/test';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';

// Type definitions for our fixtures
export type ElectronFixtures = {
  /** Isolated user data directory for this test */
  userData: string;
  /** The Electron application instance */
  electronApp: ElectronApplication;
  /** The main browser window */
  mainWindow: Page;
};

/**
 * Extended test with Electron fixtures
 */
export const test = base.extend<ElectronFixtures>({
  // Create isolated userData directory for each test
  // eslint-disable-next-line no-empty-pattern
  userData: async ({}, use, testInfo) => {
    const testName = testInfo.title.replace(/[^a-zA-Z0-9]/g, '_');
    const userDataDir = path.join(
      os.tmpdir(),
      `dbt-studio-e2e-${testName}-${Date.now()}`,
    );

    // Create the directory
    fs.mkdirSync(userDataDir, { recursive: true });

    // Use the directory for the test
    await use(userDataDir);

    // Cleanup after test (comment out for debugging)
    try {
      fs.rmSync(userDataDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  },

  // Launch Electron app
  electronApp: async ({ userData }, use) => {
    // Path to the main bundle
    const mainBundlePath = path.join(
      __dirname,
      '../../.erb/dll/main.bundle.dev.js',
    );

    // Verify bundle exists
    if (!fs.existsSync(mainBundlePath)) {
      throw new Error(
        `Main bundle not found at ${mainBundlePath}. Run "npm run prestart" first.`,
      );
    }

    // Launch the Electron app
    const electronApp = await electron.launch({
      args: [
        mainBundlePath,
        `--user-data-dir=${userData}`,
        '--disable-gpu',
        '--no-sandbox',
        '--disable-dev-shm-usage',
      ],
      env: {
        ...process.env,
        NODE_ENV: 'test',
        E2E_TESTING: 'true',
        USER_DATA_DIR: userData,
        // Disable auto-updates in tests
        ELECTRON_NO_UPDATER: '1',
        // Disable analytics in tests
        DISABLE_ANALYTICS: '1',
      },
    });

    // Use the app for the test
    await use(electronApp);

    // Close the app after test
    await electronApp.close();
  },

  // Get the main window
  mainWindow: async ({ electronApp }, use) => {
    // Wait for the first window to open
    const window = await electronApp.firstWindow();

    // Wait for the window to be ready
    await window.waitForLoadState('domcontentloaded');

    // Optional: Wait a bit for React to mount
    await window.waitForTimeout(1000);

    // Use the window for the test
    await use(window);
  },
});

// Re-export expect for convenience
export { expect } from '@playwright/test';
