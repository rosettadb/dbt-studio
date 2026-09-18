/**
 * Schema (Data) Tree Component
 *
 * Page object for the Data tree in the SQL Editor and Notebooks sidebars:
 * connection → schema → table/view → column. Rows expose `data-testid`
 * (`schema-tree-schema`, `schema-tree-table`, `schema-tree-view`,
 * `schema-tree-column`) plus `data-schema` / `data-table` / `data-column`.
 */

import { Page, Locator, expect } from '@playwright/test';
import { BasePage } from '../BasePage';

export type SchemaTreeMenuAction =
  | 'insert-name'
  | 'copy-name'
  | 'copy-qualified-name'
  | 'copy-columns'
  | 'generate-select'
  | 'generate-select-columns'
  | 'generate-count'
  | 'generate-insert'
  | 'generate-select-column'
  | 'generate-select-distinct'
  | 'generate-count-by'
  | 'preview'
  | 'rename'
  | 'refresh';

export class SchemaTreeComponent extends BasePage {
  readonly container: Locator;

  readonly contextMenu: Locator;

  constructor(page: Page) {
    super(page);
    this.container = this.getByTestId('schema-tree');
    this.contextMenu = this.getByTestId('schema-tree-context-menu');
  }

  // ==================== Locators ====================

  schemaRow(schema: string): Locator {
    return this.container.locator(
      `[data-testid="schema-tree-schema"][data-schema="${schema}"]`,
    );
  }

  tableRow(table: string, schema?: string): Locator {
    const schemaAttr = schema ? `[data-schema="${schema}"]` : '';
    return this.container.locator(
      `[data-testid="schema-tree-table"]${schemaAttr}[data-table="${table}"], ` +
        `[data-testid="schema-tree-view"]${schemaAttr}[data-table="${table}"]`,
    );
  }

  columnRow(table: string, column: string): Locator {
    return this.container.locator(
      `[data-testid="schema-tree-column"][data-table="${table}"][data-column="${column}"]`,
    );
  }

  menuItem(action: SchemaTreeMenuAction): Locator {
    return this.page.locator(`[data-testid="schema-tree-menu-${action}"]`);
  }

  // ==================== Actions ====================

  /** Expand a schema node so its tables mount. */
  async expandSchema(schema: string): Promise<void> {
    const row = this.schemaRow(schema);
    await row.waitFor({ state: 'visible', timeout: 15000 });
    // Rows are collapsed by default; a click toggles expansion.
    await row.click();
  }

  /** Expand a table node so its columns mount. */
  async expandTable(table: string, schema?: string): Promise<void> {
    await this.tableRow(table, schema).click();
  }

  /** Right-click a table and pick a context-menu action. */
  async runTableAction(
    table: string,
    action: SchemaTreeMenuAction,
    schema?: string,
  ): Promise<void> {
    await this.tableRow(table, schema).click({ button: 'right' });
    await expect(this.contextMenu).toBeVisible();
    await this.menuItem(action).click();
    await expect(this.contextMenu).toBeHidden();
  }

  /** Right-click a column and pick a context-menu action. */
  async runColumnAction(
    table: string,
    column: string,
    action: SchemaTreeMenuAction,
  ): Promise<void> {
    await this.columnRow(table, column).click({ button: 'right' });
    await expect(this.contextMenu).toBeVisible();
    await this.menuItem(action).click();
    await expect(this.contextMenu).toBeHidden();
  }

  /** Drag a table row onto a drop target (e.g. the Monaco editor). */
  async dragTableTo(
    table: string,
    target: Locator,
    schema?: string,
  ): Promise<void> {
    await this.tableRow(table, schema).dragTo(target);
  }

  // ==================== Assertions ====================

  async expectTableVisible(table: string, schema?: string): Promise<void> {
    await expect(this.tableRow(table, schema)).toBeVisible({ timeout: 15000 });
  }
}
