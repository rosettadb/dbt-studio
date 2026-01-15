/**
 * SQL Editor Page Object
 *
 * Page object for the SQL Editor screen where users can write and execute
 * SQL queries against their data connections.
 */

import { Page, Locator, expect } from '@playwright/test';
import { BasePage } from '../BasePage';

export class SqlEditorPage extends BasePage {
  // Container
  readonly container: Locator;

  // Editor elements
  readonly editorPane: Locator;

  readonly monacoEditor: Locator;

  // Action buttons
  readonly runQueryBtn: Locator;

  readonly stopQueryBtn: Locator;

  readonly formatBtn: Locator;

  readonly exportBtn: Locator;

  // Results
  readonly resultsPane: Locator;

  readonly resultsTable: Locator;

  // Tabs
  readonly tabBar: Locator;

  readonly newTabBtn: Locator;

  constructor(page: Page) {
    super(page);
    this.container = this.getByTestId('sql-editor-screen');
    this.editorPane = this.getByTestId('sql-editor-pane');
    this.monacoEditor = this.page.locator('.monaco-editor');
    this.runQueryBtn = this.getByTestId('sql-run-query-btn');
    this.stopQueryBtn = this.getByTestId('sql-stop-query-btn');
    this.formatBtn = this.getByTestId('sql-format-btn');
    this.exportBtn = this.getByTestId('sql-export-btn');
    this.resultsPane = this.getByTestId('sql-results-pane');
    this.resultsTable = this.getByTestId('sql-results-table');
    this.tabBar = this.getByTestId('sql-tab-bar');
    this.newTabBtn = this.getByTestId('sql-new-tab-btn');
  }

  // ==================== Actions ====================

  /**
   * Type a query into the Monaco editor
   */
  async typeQuery(query: string): Promise<void> {
    await this.monacoEditor.click();
    await this.page.keyboard.type(query);
  }

  /**
   * Set the query by replacing existing content
   */
  async setQuery(query: string): Promise<void> {
    await this.monacoEditor.click();
    // Select all and replace
    await this.page.keyboard.press('Meta+A');
    await this.page.keyboard.type(query);
  }

  /**
   * Clear the editor content
   */
  async clearQuery(): Promise<void> {
    await this.monacoEditor.click();
    await this.page.keyboard.press('Meta+A');
    await this.page.keyboard.press('Backspace');
  }

  /**
   * Run the current query using the button
   */
  async runQuery(): Promise<void> {
    await this.runQueryBtn.click();
  }

  /**
   * Run the current query using keyboard shortcut
   */
  async runQueryWithKeyboard(): Promise<void> {
    await this.page.keyboard.press('Meta+Enter');
  }

  /**
   * Stop the currently running query
   */
  async stopQuery(): Promise<void> {
    await this.stopQueryBtn.click();
  }

  /**
   * Format the current query
   */
  async formatQuery(): Promise<void> {
    await this.formatBtn.click();
  }

  /**
   * Create a new query tab
   */
  async createNewTab(): Promise<void> {
    await this.newTabBtn.click();
  }

  /**
   * Select a specific tab by index (0-based)
   */
  async selectTab(index: number): Promise<void> {
    const tab = this.tabBar.locator(`[data-testid="sql-tab-${index}"]`);
    await tab.click();
  }

  /**
   * Close a tab by index
   */
  async closeTab(index: number): Promise<void> {
    const closeBtn = this.tabBar.locator(
      `[data-testid="sql-tab-${index}"] [data-testid="tab-close-btn"]`,
    );
    await closeBtn.click();
  }

  /**
   * Export results
   */
  async exportResults(): Promise<void> {
    await this.exportBtn.click();
  }

  /**
   * Wait for query results to appear
   */
  async waitForResults(timeout = 30000): Promise<void> {
    await this.resultsTable.waitFor({ state: 'visible', timeout });
  }

  // ==================== Getters ====================

  /**
   * Get the count of result rows
   */
  async getResultsRowCount(): Promise<number> {
    const rows = this.resultsTable.locator('tbody tr');
    return rows.count();
  }

  /**
   * Get the current query text from the editor
   */
  async getQueryText(): Promise<string> {
    // Get text from Monaco editor's content
    const content = await this.monacoEditor
      .locator('.view-lines')
      .textContent();
    return content || '';
  }

  /**
   * Get the number of open tabs
   */
  async getTabCount(): Promise<number> {
    const tabs = this.tabBar.locator('[data-testid^="sql-tab-"]');
    return tabs.count();
  }

  // ==================== Assertions ====================

  /**
   * Expect the SQL editor screen to be visible
   */
  async expectToBeVisible(): Promise<void> {
    await expect(this.container).toBeVisible();
  }

  /**
   * Expect results to be visible
   */
  async expectResultsToBeVisible(): Promise<void> {
    await expect(this.resultsPane).toBeVisible();
  }

  /**
   * Expect a specific row count in results
   */
  async expectRowCount(expectedCount: number): Promise<void> {
    const count = await this.getResultsRowCount();
    expect(count).toBe(expectedCount);
  }

  /**
   * Expect the run button to be enabled
   */
  async expectRunButtonEnabled(): Promise<void> {
    await expect(this.runQueryBtn).toBeEnabled();
  }

  /**
   * Expect the stop button to be visible (query running)
   */
  async expectQueryRunning(): Promise<void> {
    await expect(this.stopQueryBtn).toBeVisible();
  }

  /**
   * Check if the page is currently visible
   */
  async isVisible(): Promise<boolean> {
    return this.container.isVisible({ timeout: 2000 }).catch(() => false);
  }
}
