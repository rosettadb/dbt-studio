/**
 * Application Helper
 *
 * Utilities for common app-level operations during E2E tests
 */

import { ElectronApplication, Page } from '@playwright/test';

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
      const timer = setTimeout(() => {
        reject(new Error('Timeout waiting for new window'));
      }, timeout);

      this.electronApp.on('window', (page) => {
        clearTimeout(timer);
        resolve(page);
      });
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
      // Try various skip mechanisms
      const skipSelectors = [
        '[data-testid="setup-skip-all-btn"]',
        '[data-testid="setup-skip-btn"]',
        '[data-testid="onboarding-skip-btn"]',
        'button:has-text("Skip")',
      ];

      // Try each skip selector
      await skipSelectors.reduce(async (promise, selector) => {
        await promise;
        const btn = this.mainWindow.locator(selector);
        const isVisible = await btn
          .isVisible({ timeout: 1000 })
          .catch(() => false);
        if (isVisible) {
          await btn.click();
          await this.mainWindow.waitForTimeout(500);
        }
      }, Promise.resolve());

      // Click through any remaining steps using recursion
      const clickNextUntilDone = async (attempts: number): Promise<void> => {
        if (attempts >= 10 || !(await this.isFirstRun())) return;

        const nextBtn = this.mainWindow.locator(
          '[data-testid="setup-next-btn"], [data-testid="onboarding-next-btn"], button:has-text("Next"), button:has-text("Continue")',
        );
        const isVisible = await nextBtn
          .isVisible({ timeout: 1000 })
          .catch(() => false);
        if (isVisible) {
          await nextBtn.click();
          await this.mainWindow.waitForTimeout(500);
        }
        await clickNextUntilDone(attempts + 1);
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
    await this.mainWindow.screenshot({
      path: `test-results/screenshots/${name}-${Date.now()}.png`,
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
