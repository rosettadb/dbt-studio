/**
 * Wait Helper
 *
 * Utilities for waiting on various conditions during E2E tests
 */

import { Page, Locator, expect } from '@playwright/test';

export class WaitHelper {
  private page: Page;

  constructor(page: Page) {
    this.page = page;
  }

  /**
   * Wait for loading spinner/overlay to disappear
   */
  async waitForLoading(timeout = 30000): Promise<void> {
    const loadingSelectors = [
      '[data-testid="loading-spinner"]',
      '[data-testid="loading-overlay"]',
      '.MuiCircularProgress-root',
      '.MuiLinearProgress-root',
      '[data-loading="true"]',
    ];

    await Promise.all(
      loadingSelectors.map(async (selector) => {
        const element = this.page.locator(selector);
        const count = await element.count();
        if (count > 0) {
          await element.first().waitFor({ state: 'hidden', timeout });
        }
      }),
    );
  }

  /**
   * Wait for toast notification to appear
   */
  async waitForToast(
    type?: 'success' | 'error' | 'info' | 'warning',
  ): Promise<Locator> {
    const selector = type ? `.Toastify__toast--${type}` : '.Toastify__toast';
    const toast = this.page.locator(selector);
    await toast.waitFor({ state: 'visible', timeout: 10000 });
    return toast;
  }

  /**
   * Wait for success toast
   */
  async waitForSuccessToast(): Promise<Locator> {
    return this.waitForToast('success');
  }

  /**
   * Wait for error toast
   */
  async waitForErrorToast(): Promise<Locator> {
    return this.waitForToast('error');
  }

  /**
   * Wait for modal dialog to open
   */
  async waitForModal(timeout = 10000): Promise<Locator> {
    const modal = this.page.locator(
      '[role="dialog"], .MuiDialog-root, .MuiModal-root',
    );
    await modal.waitFor({ state: 'visible', timeout });
    return modal;
  }

  /**
   * Wait for modal dialog to close
   */
  async waitForModalClose(timeout = 10000): Promise<void> {
    const modal = this.page.locator(
      '[role="dialog"], .MuiDialog-root, .MuiModal-root',
    );
    await modal.waitFor({ state: 'hidden', timeout });
  }

  /**
   * Wait for network idle state
   */
  async waitForNetworkIdle(timeout = 10000): Promise<void> {
    await this.page.waitForLoadState('networkidle', { timeout });
  }

  /**
   * Wait for DOM content loaded
   */
  async waitForDOMReady(): Promise<void> {
    await this.page.waitForLoadState('domcontentloaded');
  }

  /**
   * Wait for a specific URL pattern
   */
  async waitForUrl(pattern: string | RegExp, timeout = 10000): Promise<void> {
    await this.page.waitForURL(pattern, { timeout });
  }

  /**
   * Wait for element to be visible
   */
  async waitForVisible(
    selector: string | Locator,
    timeout = 10000,
  ): Promise<Locator> {
    const locator =
      typeof selector === 'string' ? this.page.locator(selector) : selector;
    await locator.waitFor({ state: 'visible', timeout });
    return locator;
  }

  /**
   * Wait for element to be hidden
   */
  async waitForHidden(
    selector: string | Locator,
    timeout = 10000,
  ): Promise<void> {
    const locator =
      typeof selector === 'string' ? this.page.locator(selector) : selector;
    await locator.waitFor({ state: 'hidden', timeout });
  }

  /**
   * Wait for element to be enabled (clickable)
   */
  async waitForEnabled(
    selector: string | Locator,
    timeout = 10000,
  ): Promise<Locator> {
    const locator =
      typeof selector === 'string' ? this.page.locator(selector) : selector;
    await locator.waitFor({ state: 'visible', timeout });
    await expect(locator).toBeEnabled({ timeout });
    return locator;
  }

  /**
   * Wait for element count to match
   */
  async waitForCount(
    selector: string,
    expectedCount: number,
    timeout = 10000,
  ): Promise<void> {
    const startTime = Date.now();

    const checkCount = async (): Promise<void> => {
      const count = await this.page.locator(selector).count();
      if (count === expectedCount) return;
      if (Date.now() - startTime >= timeout) {
        throw new Error(
          `Timeout waiting for ${selector} to have count ${expectedCount}`,
        );
      }
      await this.page.waitForTimeout(100);
      await checkCount();
    };

    await checkCount();
  }

  /**
   * Wait for element to contain text
   */
  async waitForText(
    selector: string | Locator,
    text: string | RegExp,
    timeout = 10000,
  ): Promise<void> {
    const locator =
      typeof selector === 'string' ? this.page.locator(selector) : selector;

    if (typeof text === 'string') {
      await locator
        .filter({ hasText: text })
        .waitFor({ state: 'visible', timeout });
    } else if (typeof selector !== 'string') {
      await locator
        .filter({ hasText: text })
        .waitFor({ state: 'visible', timeout });
    } else {
      await this.page.waitForFunction(
        ({ sel, pattern, flags }) => {
          const el = document.querySelector(sel);
          return el && new RegExp(pattern, flags).test(el.textContent || '');
        },
        {
          sel: selector,
          pattern: text.source,
          flags: text.flags,
        },
        { timeout },
      );
    }
  }

  /**
   * Retry an action until it succeeds or times out
   */
  async retry<T>(
    action: () => Promise<T>,
    options?: { maxAttempts?: number; delay?: number },
  ): Promise<T> {
    const maxAttempts = options?.maxAttempts ?? 3;
    const delay = options?.delay ?? 1000;

    const tryAction = async (
      attempt: number,
      lastError?: Error,
    ): Promise<T> => {
      if (attempt >= maxAttempts) {
        throw lastError || new Error('Max attempts reached');
      }

      try {
        return await action();
      } catch (error) {
        await this.page.waitForTimeout(delay);
        return tryAction(attempt + 1, error as Error);
      }
    };

    return tryAction(0);
  }
}
