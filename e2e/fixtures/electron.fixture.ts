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
import { CURRENT_SCHEMA_VERSION } from '../../src/main/database/migrations';

// Type definitions for our fixtures
export type ElectronFixtures = {
  /** Isolated user data directory for this test */
  userData: string;
  /** Whether to automatically skip the setup wizard by seeding database.json */
  autoSkipSetup: boolean;
  /**
   * Project names to seed into database.json before the app launches. Each
   * gets a minimal project directory + dbt_project.yml created automatically.
   * Use this instead of writing to database.json after the app is already
   * running — the app only ever re-reads the file on its own operations, so
   * an external write made while it's live has no defined way to be picked
   * up short of restarting it.
   */
  extraProjects: string[];
  /** The Electron application instance */
  electronApp: ElectronApplication;
  /** The main browser window */
  mainWindow: Page;
};

/**
 * Extended test with Electron fixtures
 */
export const test = base.extend<ElectronFixtures>({
  // Default to skipping setup for convenience in most tests
  autoSkipSetup: [true, { option: true }],
  extraProjects: [[], { option: true }],

  // Create isolated userData directory for each test
  // biome-ignore lint/complexity/noEmptyPattern: Playwright requires object destructuring
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
  electronApp: async ({ userData, autoSkipSetup, extraProjects }, use) => {
    // Helper to seed database if skipping setup
    if (autoSkipSetup) {
      // Create projects directory
      fs.mkdirSync(path.join(userData, 'projects'), { recursive: true });

      // Copy assets to userData (dbt_sample, main.conf)
      const assetsDir = path.join(__dirname, '../../assets');
      const dbtSampleSrc = path.join(assetsDir, 'dbt_sample');
      const mainConfSrc = path.join(assetsDir, 'main.conf');

      if (fs.existsSync(dbtSampleSrc)) {
        fs.cpSync(dbtSampleSrc, path.join(userData, 'dbt_sample'), {
          recursive: true,
        });
      }
      if (fs.existsSync(mainConfSrc)) {
        fs.cpSync(mainConfSrc, path.join(userData, 'main.conf'));
      }

      const dbPath = path.join(userData, 'database.json');

      const seededProjects = extraProjects.map((name) => {
        const projectPath = path.join(userData, 'projects', name);
        fs.mkdirSync(projectPath, { recursive: true });
        fs.writeFileSync(
          path.join(projectPath, 'dbt_project.yml'),
          `name: ${name}\nversion: 1.0.0\nconfig-version: 2\n`,
        );
        return {
          id: `${name}-id`,
          name,
          path: projectPath,
          createdAt: new Date().toISOString(),
          isExtracted: false,
        };
      });

      const settings = {
        schemaVersion: CURRENT_SCHEMA_VERSION,
        settings: {
          isSetup: 'true',
          pythonPath:
            process.platform === 'win32'
              ? 'C:\\Python39\\python.exe'
              : '/usr/bin/python3',
          dbtPath:
            process.platform === 'win32' ? 'dbt.exe' : '/usr/local/bin/dbt',
          rosettaVersion: '0.0.0-test',
          projectsDirectory: path.join(userData, 'projects'),
          dbtSampleDirectory: path.join(userData, 'dbt_sample'),
          sampleRosettaMainConf: path.join(userData, 'main.conf'),
        },
        projects: seededProjects,
        connections: [],
      };
      fs.writeFileSync(dbPath, JSON.stringify(settings, null, 2));
    }

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
    // In CI environments, Electron runs headless automatically via Playwright
    const electronApp = await electron.launch({
      args: [
        mainBundlePath,
        `--user-data-dir=${userData}`,
        '--disable-gpu',
        '--no-sandbox',
        '--disable-dev-shm-usage',
        // Additional CI-friendly flags
        '--disable-software-rasterizer',
        '--disable-extensions',
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
        // Ensure headless operation in CI
        ...(process.env.CI === 'true' && {
          ELECTRON_DISABLE_GPU: '1',
        }),
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
