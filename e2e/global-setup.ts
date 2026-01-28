/**
 * Global setup for E2E tests
 * This runs once before all tests
 */

import * as fs from 'fs';
import * as path from 'path';

async function globalSetup() {
  // eslint-disable-next-line no-console
  console.log('🚀 Running global E2E test setup...');

  // Ensure test-results directory exists
  const testResultsDir = path.join(__dirname, '../test-results');
  const artifactsDir = path.join(testResultsDir, 'artifacts');
  const screenshotsDir = path.join(testResultsDir, 'screenshots');

  [testResultsDir, artifactsDir, screenshotsDir].forEach((dir) => {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  });

  // Verify the app build exists
  const mainBundlePath = path.join(__dirname, '../.erb/dll/main.bundle.dev.js');
  if (!fs.existsSync(mainBundlePath)) {
    // eslint-disable-next-line no-console
    console.warn(
      '⚠️  Warning: Main bundle not found. Run "npm run prestart" or "npm run build" first.',
    );
  }

  // eslint-disable-next-line no-console
  console.log('✅ Global setup complete');
}

export default globalSetup;
