/**
 * Setup Wizard Page Object
 *
 * Page object for the onboarding/setup wizard that appears on first launch.
 * Handles navigation through setup steps and completion.
 */

import { Page, Locator, expect } from '@playwright/test';
import { BasePage } from '../BasePage';

export class SetupWizardPage extends BasePage {
  // Container
  readonly wizardContainer: Locator;

  // Step indicators
  readonly welcomeStep: Locator;

  readonly cliInstallStep: Locator;

  readonly pythonSetupStep: Locator;

  readonly completionStep: Locator;

  // Navigation buttons
  readonly nextButton: Locator;

  readonly backButton: Locator;

  readonly skipButton: Locator;

  readonly finishButton: Locator;

  constructor(page: Page) {
    super(page);
    this.wizardContainer = this.getByTestId('setup-wizard');
    this.welcomeStep = this.getByTestId('setup-step-welcome');
    this.cliInstallStep = this.getByTestId('setup-step-cli');
    this.pythonSetupStep = this.getByTestId('setup-step-python');
    this.completionStep = this.getByTestId('setup-step-complete');
    this.nextButton = this.getByTestId('setup-next-btn');
    this.backButton = this.getByTestId('setup-back-btn');
    this.skipButton = this.getByTestId('setup-skip-btn');
    this.finishButton = this.getByTestId('setup-finish-btn');
  }

  // ==================== Actions ====================

  /**
   * Click the Next button to proceed to the next step
   */
  async clickNext(): Promise<void> {
    await this.nextButton.click();
  }

  /**
   * Click the Back button to go to the previous step
   */
  async clickBack(): Promise<void> {
    await this.backButton.click();
  }

  /**
   * Click the Skip button to skip the current step
   */
  async clickSkip(): Promise<void> {
    await this.skipButton.click();
  }

  /**
   * Click the Finish button to complete the wizard
   */
  async clickFinish(): Promise<void> {
    await this.finishButton.click();
  }

  /**
   * Complete the entire wizard by skipping through all steps
   * Useful for tests that don't focus on the setup process
   */
  async completeWizard(): Promise<void> {
    // Try to skip through all steps
    let attempts = 0;
    const maxAttempts = 10;

    while (attempts < maxAttempts) {
      attempts += 1;

      // Check if we're done (wizard not visible)
      // eslint-disable-next-line no-await-in-loop
      const isVisible = await this.wizardContainer
        .isVisible({ timeout: 1000 })
        .catch(() => false);

      if (!isVisible) {
        break;
      }

      // Try skip button first
      // eslint-disable-next-line no-await-in-loop
      const skipVisible = await this.skipButton
        .isVisible({ timeout: 500 })
        .catch(() => false);

      if (skipVisible) {
        // eslint-disable-next-line no-await-in-loop
        await this.skipButton.click();
        // eslint-disable-next-line no-await-in-loop
        await this.page.waitForTimeout(500);
        // eslint-disable-next-line no-continue
        continue;
      }

      // Try next button
      // eslint-disable-next-line no-await-in-loop
      const nextVisible = await this.nextButton
        .isVisible({ timeout: 500 })
        .catch(() => false);

      if (nextVisible) {
        // eslint-disable-next-line no-await-in-loop
        await this.nextButton.click();
        // eslint-disable-next-line no-await-in-loop
        await this.page.waitForTimeout(500);
        // eslint-disable-next-line no-continue
        continue;
      }

      // Try finish button
      // eslint-disable-next-line no-await-in-loop
      const finishVisible = await this.finishButton
        .isVisible({ timeout: 500 })
        .catch(() => false);

      if (finishVisible) {
        // eslint-disable-next-line no-await-in-loop
        await this.finishButton.click();
        // eslint-disable-next-line no-await-in-loop
        await this.page.waitForTimeout(500);
        break;
      }

      // Wait a bit before trying again
      // eslint-disable-next-line no-await-in-loop
      await this.page.waitForTimeout(500);
    }
  }

  // ==================== Assertions ====================

  /**
   * Expect the wizard container to be visible
   */
  async expectToBeVisible(): Promise<void> {
    await expect(this.wizardContainer).toBeVisible();
  }

  /**
   * Expect the wizard to not be visible (completed or skipped)
   */
  async expectToBeHidden(): Promise<void> {
    await expect(this.wizardContainer).toBeHidden();
  }

  /**
   * Expect a specific step to be the current/visible step
   */
  async expectCurrentStep(
    step: 'welcome' | 'cli' | 'python' | 'complete',
  ): Promise<void> {
    const stepMap = {
      welcome: this.welcomeStep,
      cli: this.cliInstallStep,
      python: this.pythonSetupStep,
      complete: this.completionStep,
    };
    await expect(stepMap[step]).toBeVisible();
  }

  /**
   * Check if the wizard is currently visible
   */
  async isVisible(): Promise<boolean> {
    return this.wizardContainer.isVisible({ timeout: 2000 }).catch(() => false);
  }
}
