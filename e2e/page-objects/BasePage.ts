/**
 * Base Page Object
 *
 * Abstract base class for all page objects.
 * Provides common utilities and locator helpers.
 */

import { Page, Locator } from '@playwright/test';

export abstract class BasePage {
  protected readonly page: Page;

  constructor(page: Page) {
    this.page = page;
  }

  // ==================== Wait Helpers ====================

  /**
   * Wait for page to be fully loaded
   */
  async waitForPageLoad(): Promise<void> {
    await this.page.waitForLoadState('networkidle');
  }

  /**
   * Wait for an element to be visible
   */
  async waitForElement(
    selector: string,
    options?: { timeout?: number },
  ): Promise<Locator> {
    const locator = this.page.locator(selector);
    await locator.waitFor({
      state: 'visible',
      timeout: options?.timeout ?? 10000,
    });
    return locator;
  }

  /**
   * Wait for element to be hidden
   */
  async waitForElementHidden(
    selector: string,
    options?: { timeout?: number },
  ): Promise<void> {
    const locator = this.page.locator(selector);
    await locator.waitFor({
      state: 'hidden',
      timeout: options?.timeout ?? 10000,
    });
  }

  /**
   * Wait for loading indicators to disappear
   */
  async waitForLoading(): Promise<void> {
    const loadingIndicators = [
      '[data-testid="loading-spinner"]',
      '[data-testid="loading-overlay"]',
      '.MuiCircularProgress-root',
    ];

    await Promise.all(
      loadingIndicators.map(async (selector) => {
        const locator = this.page.locator(selector);
        const count = await locator.count();
        if (count > 0) {
          await locator.first().waitFor({ state: 'hidden', timeout: 30000 });
        }
      }),
    );
  }

  // ==================== Locator Helpers ====================

  /**
   * Get element by data-testid attribute
   */
  getByTestId(testId: string): Locator {
    return this.page.locator(`[data-testid="${testId}"]`);
  }

  /**
   * Get element by role
   */
  getByRole(
    role: Parameters<Page['getByRole']>[0],
    options?: Parameters<Page['getByRole']>[1],
  ): Locator {
    return this.page.getByRole(role, options);
  }

  /**
   * Get element by text content
   */
  getByText(text: string | RegExp): Locator {
    return this.page.getByText(text);
  }

  /**
   * Get element by placeholder
   */
  getByPlaceholder(placeholder: string | RegExp): Locator {
    return this.page.getByPlaceholder(placeholder);
  }

  /**
   * Get element by label
   */
  getByLabel(label: string | RegExp): Locator {
    return this.page.getByLabel(label);
  }

  // ==================== Screenshot Helpers ====================

  /**
   * Take a screenshot of the current page
   */
  async takeScreenshot(name: string): Promise<void> {
    await this.page.screenshot({
      path: `test-results/screenshots/${name}-${Date.now()}.png`,
      fullPage: true,
    });
  }

  // ==================== Interaction Helpers ====================

  /**
   * Click element with retry logic
   */
  async clickWithRetry(
    locator: Locator,
    options?: { maxRetries?: number; delay?: number },
  ): Promise<void> {
    const maxRetries = options?.maxRetries ?? 3;
    const delay = options?.delay ?? 500;

    const tryClick = async (attempt: number): Promise<void> => {
      try {
        await locator.click({ timeout: 5000 });
      } catch (error) {
        if (attempt >= maxRetries - 1) throw error;
        await this.page.waitForTimeout(delay);
        await tryClick(attempt + 1);
      }
    };

    await tryClick(0);
  }

  /**
   * Fill input with clear first
   */
  // eslint-disable-next-line class-methods-use-this
  async fillInput(locator: Locator, value: string): Promise<void> {
    await locator.click();
    await locator.clear();
    await locator.fill(value);
  }

  // ==================== Modal Helpers ====================

  /**
   * Wait for modal to open
   */
  async waitForModal(): Promise<Locator> {
    const modal = this.page.locator('[role="dialog"], .MuiModal-root');
    await modal.waitFor({ state: 'visible' });
    return modal;
  }

  /**
   * Wait for modal to close
   */
  async waitForModalClosed(): Promise<void> {
    const modal = this.page.locator('[role="dialog"], .MuiModal-root');
    await modal.waitFor({ state: 'hidden' });
  }

  // ==================== Toast Helpers ====================

  /**
   * Wait for toast notification
   */
  async waitForToast(
    type?: 'success' | 'error' | 'info' | 'warning',
  ): Promise<Locator> {
    const selector = type ? `.Toastify__toast--${type}` : '.Toastify__toast';
    const toast = this.page.locator(selector);
    await toast.waitFor({ state: 'visible' });
    return toast;
  }

  /**
   * Dismiss all toasts
   */
  async dismissToasts(): Promise<void> {
    const closeButtons = this.page.locator('.Toastify__close-button');
    // Click until none remain (list shrinks as we dismiss)
    /* eslint-disable no-await-in-loop */
    while ((await closeButtons.count()) > 0) {
      await closeButtons.first().click();
      await this.page.waitForTimeout(100); // Small delay to allow UI update
    }
    /* eslint-enable no-await-in-loop */
  }
}
