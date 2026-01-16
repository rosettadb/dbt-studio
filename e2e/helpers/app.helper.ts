/**
 * Application Helper
 *
 * Utilities for common app-level operations during E2E tests
 */

import * as fs from 'fs';
import * as path from 'path';
import { ElectronApplication, Page } from '@playwright/test';

const SCREENSHOT_DIR = 'test-results/screenshots';

export class AppHelper {
  private electronApp: ElectronApplication;

  private mainWindow: Page;

  constructor(electronApp: ElectronApplication, mainWindow: Page) {
    this.electronApp = electronApp;
    this.mainWindow = mainWindow;
  }

  /**
   * Get all currently open windows
   */
  async getAllWindows(): Promise<Page[]> {
    return this.electronApp.windows();
  }

  /**
   * Wait for a new window to open
   */
  async waitForNewWindow(timeout = 10000): Promise<Page> {
    return new Promise((resolve, reject) => {
      let timer: ReturnType<typeof setTimeout>;

      const handler = (page: Page) => {
        clearTimeout(timer);
        this.electronApp.off('window', handler);
        resolve(page);
      };

      timer = setTimeout(() => {
        this.electronApp.off('window', handler);
        reject(new Error('Timeout waiting for new window'));
      }, timeout);

      this.electronApp.on('window', handler);
    });
  }

  /**
   * Check if the app is showing the setup wizard (first run)
   */
  async isFirstRun(): Promise<boolean> {
    try {
      const setupWizard = this.mainWindow.locator(
        '[data-testid="setup-wizard"], [data-testid="onboarding-wizard"]',
      );
      return await setupWizard.isVisible({ timeout: 2000 });
    } catch {
      return false;
    }
  }

  /**
   * Check if setup is complete and main app is visible
   */
  async isMainAppVisible(): Promise<boolean> {
    try {
      const mainApp = this.mainWindow.locator(
        '[data-testid="main-app"], [data-testid="project-selection"]',
      );
      return await mainApp.isVisible({ timeout: 2000 });
    } catch {
      return false;
    }
  }

  /**
   * Skip the setup wizard if it's currently shown
   */
  async skipSetupIfPresent(): Promise<void> {
    if (await this.isFirstRun()) {
      // First, try to find and click the Skip Setup button (added for E2E testing)
      const skipSetupBtn = this.mainWindow.locator(
        '[data-testid="setup-skip-btn"]',
      );
      const skipSetupVisible = await skipSetupBtn
        .isVisible({ timeout: 2000 })
        .catch(() => false);

      if (skipSetupVisible) {
        await skipSetupBtn.click();
        // Wait for setup to close and main app to appear
        await this.mainWindow.waitForTimeout(1000);
        return;
      }

      // Fallback: Try various skip mechanisms
      const skipSelectors = [
        '[data-testid="setup-skip-all-btn"]',
        '[data-testid="onboarding-skip-btn"]',
        'button:has-text("Skip")',
      ];

      // Try each skip selector
      // eslint-disable-next-line no-restricted-syntax
      for (const selector of skipSelectors) {
        const btn = this.mainWindow.locator(selector);
        // eslint-disable-next-line no-await-in-loop
        const isVisible = await btn
          .isVisible({ timeout: 1000 })
          .catch(() => false);
        if (isVisible) {
          // eslint-disable-next-line no-await-in-loop
          await btn.click();
          // eslint-disable-next-line no-await-in-loop
          await this.mainWindow.waitForTimeout(500);
          return;
        }
      }

      // Last resort: Click through steps (only if buttons are enabled)
      const clickNextUntilDone = async (attempts: number): Promise<void> => {
        if (attempts >= 10 || !(await this.isFirstRun())) return;

        const nextBtn = this.mainWindow.locator(
          '[data-testid="setup-next-btn"], [data-testid="onboarding-next-btn"], [data-testid="setup-finish-btn"]',
        );
        const isVisible = await nextBtn
          .isVisible({ timeout: 1000 })
          .catch(() => false);

        if (isVisible) {
          // Check if button is enabled before clicking
          const isEnabled = await nextBtn
            .isEnabled({ timeout: 500 })
            .catch(() => false);

          if (isEnabled) {
            await nextBtn.click();
            await this.mainWindow.waitForTimeout(500);
            await clickNextUntilDone(attempts + 1);
          }
          // Button is disabled, can't proceed
        }
      };

      await clickNextUntilDone(0);
    }
  }

  /**
   * Get the current screen/route
   */
  async getCurrentScreen(): Promise<string | null> {
    const screens = [
      'setup-wizard',
      'project-selection',
      'project-details',
      'sql-editor',
      'connections',
      'cloud-explorer',
      'data-lake',
      'ai-chat',
      'settings',
    ];

    const results = await Promise.all(
      screens.map(async (screen) => {
        const locator = this.mainWindow.locator(`[data-testid="${screen}"]`);
        const isVisible = await locator
          .isVisible({ timeout: 500 })
          .catch(() => false);
        return isVisible ? screen : null;
      }),
    );

    return results.find((screen) => screen !== null) ?? null;
  }

  /**
   * Get app version from the Electron process
   */
  async getAppVersion(): Promise<string> {
    return this.electronApp.evaluate(async ({ app }) => app.getVersion());
  }

  /**
   * Get the app's user data path
   */
  async getUserDataPath(): Promise<string> {
    return this.electronApp.evaluate(async ({ app }) =>
      app.getPath('userData'),
    );
  }

  /**
   * Take a screenshot of the main window
   */
  async takeScreenshot(name: string): Promise<void> {
    // Ensure screenshot directory exists
    if (!fs.existsSync(SCREENSHOT_DIR)) {
      fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
    }

    await this.mainWindow.screenshot({
      path: path.join(SCREENSHOT_DIR, `${name}-${Date.now()}.png`),
      fullPage: true,
    });
  }

  /**
   * Evaluate JavaScript in the main process
   * Use: appHelper.getElectronApp().evaluate(...)
   */
  getElectronApp(): ElectronApplication {
    return this.electronApp;
  }

  /**
   * Reload the main window
   */
  async reloadWindow(): Promise<void> {
    await this.mainWindow.reload();
    await this.mainWindow.waitForLoadState('domcontentloaded');
  }
}
