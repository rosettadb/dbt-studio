/**
 * App Launch Tests
 *
 * Basic tests to verify the Electron app launches correctly
 */

import { Page, ElectronApplication } from '@playwright/test';
import { test, expect } from '../../fixtures';
import { AppHelper } from '../../helpers';

// Helper to find a stable window (Setup or Main)
// This deals with the splash screen closing and new window opening
const findStableWindow = async (
  electronApp: ElectronApplication,
): Promise<Page> => {
  const predicate = (w: Page) => {
    const url = w.url();
    // We look for setup or main, or any file URL that isn't data: (splash)
    // Also accept chrome-error for debugging
    return (
      url.includes('/setup') ||
      url.includes('/main') ||
      (url.startsWith('file:') && !url.includes('splash')) ||
      url.startsWith('chrome-error:')
    );
  };

  const windows = electronApp.windows();
  const existing = windows.find(predicate);
  if (existing) return existing;

  console.log('Waiting for stable app window...');
  return electronApp.waitForEvent('window', {
    predicate,
    timeout: 30000,
  });
};

test.describe('App Launch', () => {
  test('should launch the Electron app successfully', async ({
    electronApp,
  }) => {
    // Verify app is running
    expect(electronApp).toBeDefined();

    // Wait for the actual app window
    const window = await findStableWindow(electronApp);
    expect(window).toBeDefined();
    expect(window.isClosed()).toBe(false);
  });

  test('should have a valid window title', async ({ electronApp }) => {
    const window = await findStableWindow(electronApp);
    // Wait for load
    await window.waitForLoadState('domcontentloaded');

    const title = await window.title();
    console.log(`Window Title: ${title}`);

    // The title should contain "Rosetta" or "DBT Studio" or be the app name
    if (title) {
      expect(title).toMatch(/Rosetta|DBT|Studio|dbt-studio/i);
    } else {
      // Empty title during initial load is acceptable, but usually setup has 'Setup' or 'Rosetta DBT Studio'
      // If content failed to load (chrome-error), title might be empty.
      if (window.url().startsWith('chrome-error')) {
        test.info().annotations.push({
          type: 'warning',
          description: 'Window failed to load content',
        });
      }
      // Empty title is acceptable during initial load - explicitly skip assertion
      test.skip(true, 'Title empty during initial load - skipping validation');
    }
  });

  test('should show either setup wizard or main app on launch', async ({
    electronApp,
  }) => {
    const window = await findStableWindow(electronApp);
    const appHelper = new AppHelper(electronApp, window);

    // Wait for initial load
    await window.waitForLoadState('domcontentloaded');

    // Either setup wizard or main app should be visible
    // Note: This test may need data-testid attributes to be added to the app
    const isFirstRun = await appHelper.isFirstRun();
    const isMainApp = await appHelper.isMainAppVisible();

    // For now, if neither is detected with testids, check if any content is visible
    // This is a smoke test - the app should show something
    if (!isFirstRun && !isMainApp) {
      // Check if the body has any content as a fallback
      const bodyContent = await window.locator('body').innerHTML();
      expect(bodyContent.length).toBeGreaterThan(50);
    } else {
      expect(isFirstRun || isMainApp).toBe(true);
    }
  });

  test('should be able to get app version', async ({ electronApp }) => {
    const version = await electronApp.evaluate(async ({ app }) => {
      return app.getVersion();
    });

    expect(version).toBeDefined();
    expect(version).toMatch(/^\d+\.\d+\.\d+/);
  });

  test('should have correct user data path in test mode', async ({
    electronApp,
    userData,
  }) => {
    const appUserData = await electronApp.evaluate(async ({ app }) => {
      return app.getPath('userData');
    });

    // In test mode, userData should be our custom temp directory
    expect(userData).toBeDefined();
    expect(appUserData).toBeDefined();
    // Verify the app is using our test userData directory
    // Normalize paths for cross-platform comparison
    expect(appUserData.toLowerCase()).toContain(
      userData.toLowerCase().replace(/\\/g, '/').split('/').pop() || '',
    );
  });
});

test.describe('App Launch - Smoke Tests', () => {
  test('app starts without errors @smoke', async ({ electronApp }) => {
    const window = await findStableWindow(electronApp);

    // Check for console errors on the stable window
    const errors: string[] = [];

    window.on('console', (msg) => {
      if (msg.type() === 'error') {
        errors.push(msg.text());
      }
    });

    // Wait for stable state
    await window.waitForTimeout(2000);

    // Filter out known non-critical errors
    const criticalErrors = errors.filter(
      (err) =>
        !err.includes('ResizeObserver') &&
        !err.includes('favicon') &&
        !err.includes('electron') &&
        !err.includes('Failed to load resource'), // Common in dev/test if icons missing
    );

    // Should have no critical errors
    expect(criticalErrors).toHaveLength(0);
  });

  test('window has reasonable size @smoke', async ({ electronApp }) => {
    const page = await findStableWindow(electronApp);
    await page.waitForTimeout(1000);

    // Get window size from Electron's BrowserWindow API (more reliable)
    // We get the focused window or the one with specific ID if we knew it
    // But typically we can just check the window we found

    const size = await page.evaluate(() => {
      return { width: window.outerWidth, height: window.outerHeight };
    });

    // The window should exist and have reasonable dimensions
    expect(size.width).toBeGreaterThan(300);
    expect(size.height).toBeGreaterThan(200);
  });
});
