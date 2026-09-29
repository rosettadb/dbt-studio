/**
 * Quick Start Tour Component
 *
 * Page object for the custom onboarding tour overlay shown on the Home screen
 * (dashboard) for users with no projects. It has no testids, so it is located
 * through its visible text and the "Skip tour" icon title.
 */

import { Page, Locator, expect } from '@playwright/test';
import { BasePage } from '../BasePage';

export const TOUR_SEEN_STORAGE_KEY = 'dbt-studio-quickstart-tour-seen';

export const TOUR_TOTAL_STEPS = 7;

export class QuickStartTourComponent extends BasePage {
  /** The "x" icon in the popover header */
  readonly skipTourIcon: Locator;

  constructor(page: Page) {
    super(page);
    this.skipTourIcon = this.page.getByTitle('Skip tour');
  }

  /** Step counter text such as "1 / 7" */
  stepCounter(step: number): Locator {
    return this.page.getByText(`${step} / ${TOUR_TOTAL_STEPS}`, {
      exact: true,
    });
  }

  button(name: string): Locator {
    return this.page.getByRole('button', { name, exact: true });
  }

  async next(): Promise<void> {
    await this.button('Next').click();
  }

  async back(): Promise<void> {
    await this.button('Back').click();
  }

  async letsGo(): Promise<void> {
    await this.button("Let's Go!").click();
  }

  async skip(): Promise<void> {
    await this.button('Skip').click();
  }

  async done(): Promise<void> {
    await this.button('Done').click();
  }

  async closeWithIcon(): Promise<void> {
    await this.skipTourIcon.click();
  }

  async expectStep(step: number): Promise<void> {
    await expect(this.stepCounter(step)).toBeVisible();
  }

  async expectVisible(): Promise<void> {
    await expect(this.skipTourIcon).toBeVisible();
  }

  async expectHidden(): Promise<void> {
    await expect(this.skipTourIcon).toBeHidden();
  }

  async isVisible(): Promise<boolean> {
    return this.skipTourIcon.isVisible({ timeout: 2000 }).catch(() => false);
  }

  /** Whether the "seen" flag has been persisted to localStorage */
  async hasBeenMarkedSeen(): Promise<boolean> {
    return this.page.evaluate(
      (key) => window.localStorage.getItem(key) === 'true',
      TOUR_SEEN_STORAGE_KEY,
    );
  }
}
