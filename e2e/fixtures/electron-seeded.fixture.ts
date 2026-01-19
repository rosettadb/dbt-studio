import { _electron as electron } from 'playwright';
import { test as base, ElectronApplication, Page } from '@playwright/test';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';

export type TestFixtures = {
  electronApp: ElectronApplication;
  mainWindow: Page;
  userData: string;
};

/**
 * Seeded Electron Fixture
 *
 * This fixture pre-seeds a test project and DuckDB connection to enable
 * instant access to SQL Editor and other features without manual setup.
 *
 * Use this fixture for:
 * - SQL Editor tests
 * - Connection tests (when you need an existing connection)
 * - Feature tests that require a project context
 *
 * DO NOT use this for:
 * - Project lifecycle tests (creation, deletion, etc.)
 * - First-run experience tests
 * - Tests that need to start from a clean state
 */
export const test = base.extend<TestFixtures>({
  // biome-ignore lint/complexity/noEmptyPattern: Playwright requires object destructuring
  // eslint-disable-next-line no-empty-pattern
  userData: async ({}, use) => {
    const userDataDir = path.join(
      os.tmpdir(),
      `dbt-studio-test-seeded-${Date.now()}`,
    );
    fs.mkdirSync(userDataDir, { recursive: true });

    const testProject = {
      id: 'test-project-id',
      name: 'test_project',
      path: path.join(userDataDir, 'projects', 'test_project'),
      connectionId: 'test-connection-id',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    // Seed database.json with test project and connection
    const databaseJson = {
      settings: {
        isSetup: 'true',
        pythonPath:
          process.platform === 'win32'
            ? 'C:\\Python39\\python.exe'
            : '/usr/bin/python3',
        dbtPath:
          process.platform === 'win32' ? 'dbt.exe' : '/usr/local/bin/dbt',
        rosettaVersion: '0.0.0-test',
        projectsDirectory: path.join(userDataDir, 'projects'),
        dbtSampleDirectory: path.join(userDataDir, 'dbt_sample'),
        sampleRosettaMainConf: path.join(userDataDir, 'main.conf'),
      },
      projects: [testProject],
      connections: [
        {
          id: 'test-connection-id',
          connection: {
            type: 'duckdb',
            name: 'test_db',
            database_path: ':memory:',
            short_database_path: ':memory:',
          },
        },
      ],
      selectedProject: testProject,
    };

    fs.writeFileSync(
      path.join(userDataDir, 'database.json'),
      JSON.stringify(databaseJson, null, 2),
    );

    // Create project directory structure
    const projectDir = path.join(userDataDir, 'projects', 'test_project');
    const rosettaDir = path.join(projectDir, 'rosetta');
    fs.mkdirSync(rosettaDir, { recursive: true });

    await use(userDataDir);

    // Cleanup
    fs.rmSync(userDataDir, { recursive: true, force: true });
  },

  electronApp: async ({ userData }, use) => {
    const electronApp = await electron.launch({
      args: [
        path.join(__dirname, '../../.erb/dll/main.bundle.dev.js'),
        `--user-data-dir=${userData}`,
        '--disable-gpu',
        '--no-sandbox',
      ],
      env: {
        ...process.env,
        NODE_ENV: 'test',
        E2E_TESTING: 'true',
        USER_DATA_DIR: userData,
      },
    });

    await use(electronApp);
    await electronApp.close();
  },

  mainWindow: async ({ electronApp }, use) => {
    const window = await electronApp.firstWindow();
    await window.waitForLoadState('domcontentloaded');
    await use(window);
  },
});

export { expect } from '@playwright/test';
