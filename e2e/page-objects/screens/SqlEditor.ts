/**
 * SQL Editor Page Object
 *
 * Page object for the SQL Editor screen where users can write and execute
 * SQL queries against their data connections.
 */

import { Page, Locator, expect } from '@playwright/test';
import * as os from 'os';
import { BasePage } from '../BasePage';

const modifier = os.platform() === 'darwin' ? 'Meta' : 'Control';

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

  constructor(page: Page) {
    super(page);
    this.container = this.getByTestId('sql-editor-screen');
    this.editorPane = this.getByTestId('sql-editor-pane');
    // Prefer the split editor as it's the primary one, defaulting to first if multiple found
    this.monacoEditor = this.page
      .locator('[data-testid="sql-editor-pane"] .monaco-editor')
      .or(this.page.locator('.monaco-editor').first());
    // The run button is now an icon in the gutter
    this.runQueryBtn = this.page.locator('.run-query-glyph').first();
    this.stopQueryBtn = this.getByTestId('sql-stop-query-btn');
    this.formatBtn = this.getByTestId('sql-format-btn');
    this.exportBtn = this.getByTestId('sql-export-btn');
    this.resultsPane = this.getByTestId('sql-results-pane');
    this.resultsTable = this.getByTestId('sql-results-table');
  }

  // ==================== Actions ====================

  /**
   * Select a connection from the dropdown
   */
  async selectConnection(name: string): Promise<void> {
    const select = this.page.locator('[data-testid="sql-connection-select"]');
    await select.click();
    // In MUI, the menu items are in a portal, so we find them in the body
    const option = this.page
      .locator('.MuiMenuItem-root')
      .filter({ hasText: name })
      .first();
    await option.click();
  }

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
    await this.page.keyboard.press(`${modifier}+A`);
    await this.page.keyboard.type(query);
  }

  /**
   * Clear the editor content
   */
  async clearQuery(): Promise<void> {
    await this.monacoEditor.click();
    await this.page.keyboard.press(`${modifier}+A`);
    await this.page.keyboard.press('Backspace');
  }

  /**
   * Run the current query using the button/icon
   */
  async runQuery(): Promise<void> {
    // Click the run icon in the gutter
    await this.runQueryBtn.click();
  }

  /**
   * Run the current query using keyboard shortcut
   */
  async runQueryWithKeyboard(): Promise<void> {
    await this.monacoEditor.click();
    await this.page.keyboard.press(`${modifier}+Enter`);
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
    // Ensure the editor has focus
    await this.monacoEditor.click();

    // Attempt 1: Global Monaco instance (if available via loader)
    const monacoContent = await this.page.evaluate(() => {
      const { monaco } = window as any;
      if (monaco?.editor) {
        const focused = monaco.editor.getFocusedCodeEditor();
        if (focused) return focused.getValue();

        const models = monaco.editor.getModels();
        if (models.length > 0) return models[models.length - 1].getValue();
      }
      return null;
    });

    if (monacoContent !== null) return monacoContent;

    // Attempt 2: Clipboard (Black-box fallback)
    await this.page.keyboard.press(`${modifier}+A`);
    await this.page.keyboard.press(`${modifier}+C`);

    const clipboardContent = await this.page.evaluate(async () => {
      try {
        return await navigator.clipboard.readText();
      } catch {
        return null;
      }
    });

    if (clipboardContent !== null) return clipboardContent;

    // Attempt 3: DOM Fallback (May be truncated, but better than nothing)
    return (await this.monacoEditor.locator('.view-lines').textContent()) || '';
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
