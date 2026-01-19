/**
 * Project Selection Page Object
 *
 * Page object for the project selection/home screen where users can
 * create, import, or select existing projects.
 */

import { Page, Locator, expect } from '@playwright/test';
import { BasePage } from '../BasePage';
import 'css.escape';

export class ProjectSelectionPage extends BasePage {
  // Container
  readonly container: Locator;

  // Action buttons
  readonly createProjectBtn: Locator;

  readonly importProjectBtn: Locator;

  // Project list
  readonly projectList: Locator;

  readonly searchInput: Locator;

  constructor(page: Page) {
    super(page);
    this.container = this.getByTestId('project-selection');
    this.createProjectBtn = this.getByTestId('create-project-btn');
    this.importProjectBtn = this.getByTestId('import-project-btn');
    this.projectList = this.getByTestId('project-list');
    this.searchInput = this.getByTestId('project-search-input');
  }

  // ==================== Actions ====================

  /**
   * Click the Create Project button
   */
  async clickCreateProject(): Promise<void> {
    await this.createProjectBtn.click();
  }

  /**
   * Click the Import Project button
   */
  async clickImportProject(): Promise<void> {
    await this.importProjectBtn.click();
  }

  /**
   * Select a project by its name
   */
  async selectProject(projectName: string): Promise<void> {
    const projectCard = this.page.locator(
      `[data-testid="project-card-${CSS.escape(projectName)}"]`,
    );
    await projectCard.click();
  }

  /**
   * Double-click a project to open it
   */
  async openProject(projectName: string): Promise<void> {
    const projectCard = this.page.locator(
      `[data-testid="project-card-${CSS.escape(projectName)}"]`,
    );
    await projectCard.dblclick();
  }

  /**
   * Search for projects using the search input
   */
  async searchProjects(query: string): Promise<void> {
    await this.searchInput.fill(query);
  }

  /**
   * Clear the search input
   */
  async clearSearch(): Promise<void> {
    await this.searchInput.clear();
  }

  /**
   * Get all project names from the visible project cards
   */
  async getProjectNames(): Promise<string[]> {
    const cards = this.page.locator('[data-testid^="project-card-"]');
    const count = await cards.count();
    const names: string[] = [];

    // eslint-disable-next-line no-plusplus
    for (let i = 0; i < count; i++) {
      // eslint-disable-next-line no-await-in-loop
      const name = await cards.nth(i).getAttribute('data-project-name');
      if (name) names.push(name);
    }

    return names;
  }

  /**
   * Get the count of visible projects
   */
  async getProjectCount(): Promise<number> {
    const cards = this.page.locator('[data-testid^="project-card-"]');
    return cards.count();
  }

  /**
   * Create and select a project in one go
   * Useful for setting up test state
   */
  async createAndSelectProject(projectName: string): Promise<void> {
    await this.expectToBeVisible();
    await this.clickCreateProject();

    const nameInput = this.page.locator('[data-testid="project-name-input"]');
    await nameInput.fill(projectName);

    const createBtn = this.page.locator(
      '[data-testid="project-create-confirm-btn"]',
    );
    await createBtn.click();

    // Wait for navigation or sidebar to appear indicating success
    await this.page.waitForSelector('[data-testid="sidebar"]', {
      timeout: 10000,
    });
  }

  // ==================== Assertions ====================

  /**
   * Expect the project selection page to be visible
   */
  async expectToBeVisible(): Promise<void> {
    await expect(this.container).toBeVisible();
  }

  /**
   * Expect a specific project to exist in the list
   */
  async expectProjectToExist(projectName: string): Promise<void> {
    const projectCard = this.page.locator(
      `[data-testid="project-card-${CSS.escape(projectName)}"]`,
    );
    await expect(projectCard).toBeVisible();
  }

  /**
   * Expect a specific project to NOT exist in the list
   */
  async expectProjectNotToExist(projectName: string): Promise<void> {
    const projectCard = this.page.locator(
      `[data-testid="project-card-${CSS.escape(projectName)}"]`,
    );
    await expect(projectCard).toBeHidden();
  }

  /**
   * Expect the project list to be empty
   */
  async expectNoProjects(): Promise<void> {
    const cards = this.page.locator('[data-testid^="project-card-"]');
    await expect(cards).toHaveCount(0);
  }

  /**
   * Check if the page is currently visible
   */
  async isVisible(): Promise<boolean> {
    return this.container.isVisible({ timeout: 2000 }).catch(() => false);
  }
}
