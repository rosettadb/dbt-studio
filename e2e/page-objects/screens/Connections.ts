/**
 * Connections Page Object
 *
 * Page object for the database connections screen where users can
 * add, edit, test, and manage database connections.
 */

import { Page, Locator, expect } from '@playwright/test';
import { BasePage } from '../BasePage';

export type ConnectionType =
  | 'postgresql'
  | 'snowflake'
  | 'bigquery'
  | 'redshift'
  | 'databricks'
  | 'duckdb'
  | 'mysql'
  | 'mssql';

export class ConnectionsPage extends BasePage {
  // Container
  readonly container: Locator;

  // Action buttons
  readonly addConnectionBtn: Locator;

  // Connection list
  readonly connectionList: Locator;

  readonly connectionTypeSelector: Locator;

  // Form elements
  readonly testConnectionBtn: Locator;

  readonly saveConnectionBtn: Locator;

  readonly cancelBtn: Locator;

  // Status indicators
  readonly testSuccessIndicator: Locator;

  readonly testFailureIndicator: Locator;

  constructor(page: Page) {
    super(page);
    this.container = this.getByTestId('connections-screen');
    this.addConnectionBtn = this.getByTestId('add-connection-btn');
    this.connectionList = this.getByTestId('connection-list');
    this.connectionTypeSelector = this.getByTestId('connection-type-selector');
    this.testConnectionBtn = this.getByTestId('connection-test-btn');
    this.saveConnectionBtn = this.getByTestId('connection-save-btn');
    this.cancelBtn = this.getByTestId('connection-cancel-btn');
    this.testSuccessIndicator = this.getByTestId('connection-test-success');
    this.testFailureIndicator = this.getByTestId('connection-test-failure');
  }

  // ==================== Actions ====================

  /**
   * Click the Add Connection button
   */
  async clickAddConnection(): Promise<void> {
    await this.addConnectionBtn.click();
  }

  /**
   * Select a connection type from the type selector
   */
  async selectConnectionType(type: ConnectionType): Promise<void> {
    const typeBtn = this.page.locator(
      `[data-testid="connection-type-${type}"]`,
    );
    await typeBtn.click();
  }

  /**
   * Fill out the connection form with the provided config
   */
  async fillConnectionForm(config: Record<string, string>): Promise<void> {
    // eslint-disable-next-line no-restricted-syntax
    for (const [field, value] of Object.entries(config)) {
      const input = this.getByTestId(`connection-input-${field}`);
      // eslint-disable-next-line no-await-in-loop
      await input.fill(value);
    }
  }

  /**
   * Fill a specific form field
   */
  async fillField(fieldName: string, value: string): Promise<void> {
    const input = this.getByTestId(`connection-input-${fieldName}`);
    await input.fill(value);
  }

  /**
   * Test the current connection configuration
   */
  async testConnection(): Promise<void> {
    await this.testConnectionBtn.click();
  }

  /**
   * Save the current connection
   */
  async saveConnection(): Promise<void> {
    await this.saveConnectionBtn.click();
  }

  /**
   * Cancel the current connection form
   */
  async cancelConnection(): Promise<void> {
    await this.cancelBtn.click();
  }

  /**
   * Select an existing connection from the list
   */
  async selectConnection(connectionName: string): Promise<void> {
    const connection = this.page.locator(
      `[data-testid="connection-item-${connectionName}"]`,
    );
    await connection.click();
  }

  /**
   * Edit an existing connection
   */
  async editConnection(connectionName: string): Promise<void> {
    const editBtn = this.page.locator(
      `[data-testid="connection-item-${connectionName}"] [data-testid="connection-edit-btn"]`,
    );
    await editBtn.click();
  }

  /**
   * Delete an existing connection
   */
  async deleteConnection(connectionName: string): Promise<void> {
    const deleteBtn = this.page.locator(
      `[data-testid="connection-item-${connectionName}"] [data-testid="connection-delete-btn"]`,
    );
    await deleteBtn.click();
  }

  /**
   * Wait for connection test to complete
   */
  async waitForTestResult(timeout = 30000): Promise<'success' | 'failure'> {
    const success = this.testSuccessIndicator;
    const failure = this.testFailureIndicator;

    await Promise.race([
      success.waitFor({ state: 'visible', timeout }),
      failure.waitFor({ state: 'visible', timeout }),
    ]);

    if (await success.isVisible()) {
      return 'success';
    }
    return 'failure';
  }

  // ==================== Getters ====================

  /**
   * Get all connection names from the list
   */
  async getConnectionNames(): Promise<string[]> {
    const items = this.page.locator('[data-testid^="connection-item-"]');
    const names: string[] = [];
    const count = await items.count();

    // eslint-disable-next-line no-plusplus
    for (let i = 0; i < count; i++) {
      // eslint-disable-next-line no-await-in-loop
      const name = await items.nth(i).getAttribute('data-connection-name');
      if (name) names.push(name);
    }

    return names;
  }

  /**
   * Get the count of connections
   */
  async getConnectionCount(): Promise<number> {
    const items = this.page.locator('[data-testid^="connection-item-"]');
    return items.count();
  }

  // ==================== Assertions ====================

  /**
   * Expect the connections screen to be visible
   */
  async expectToBeVisible(): Promise<void> {
    await expect(this.container).toBeVisible();
  }

  /**
   * Expect a connection test to succeed
   */
  async expectConnectionSuccess(): Promise<void> {
    await expect(this.testSuccessIndicator).toBeVisible();
  }

  /**
   * Expect a connection test to fail
   */
  async expectConnectionFailure(): Promise<void> {
    await expect(this.testFailureIndicator).toBeVisible();
  }

  /**
   * Expect a connection to exist in the list
   */
  async expectConnectionInList(name: string): Promise<void> {
    const connection = this.page.locator(
      `[data-testid="connection-item-${name}"]`,
    );
    await expect(connection).toBeVisible();
  }

  /**
   * Expect a connection to NOT exist in the list
   */
  async expectConnectionNotInList(name: string): Promise<void> {
    const connection = this.page.locator(
      `[data-testid="connection-item-${name}"]`,
    );
    await expect(connection).toBeHidden();
  }

  /**
   * Check if the page is currently visible
   */
  async isVisible(): Promise<boolean> {
    return this.container.isVisible({ timeout: 2000 }).catch(() => false);
  }
}
