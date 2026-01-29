import { PlaywrightTestConfig } from '@playwright/test';
import * as path from 'path';

const isCI = !!process.env.CI;

const config: PlaywrightTestConfig = {
  testDir: './e2e/tests',
  timeout: isCI ? 120000 : 60000, // 2 min CI, 1 min local
  expect: {
    timeout: 30000,
  },

  // Electron tests must run serially
  fullyParallel: false,
  workers: 1,

  // Retry configuration
  retries: isCI ? 2 : 0,

  // Reporter configuration
  reporter: [
    ['list'],
    ['html', { outputFolder: 'test-results/html', open: 'never' }],
    ['json', { outputFile: 'test-results/results.json' }],
    ...(isCI ? [['github'] as const] : []),
  ],

  // Global test settings
  use: {
    trace: isCI ? 'on' : 'on-first-retry',
    screenshot: 'only-on-failure',
    video: isCI ? 'on' : 'on-first-retry',
  },

  // Output directory for artifacts
  outputDir: 'test-results/artifacts',

  // Global setup/teardown
  globalSetup: path.join(__dirname, 'e2e/global-setup.ts'),

  // Project configuration (can be extended for different test types)
  projects: [
    {
      name: 'electron',
      testMatch: '**/*.spec.ts',
    },
    {
      name: 'smoke',
      testMatch: '**/*.smoke.spec.ts',
    },
  ],
};

export default config;
