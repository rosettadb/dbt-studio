/**
 * Connections Tests
 *
 * Listing, editing, validating, creating, and deleting database connections.
 * DuckDB is used for the create path because it needs no external service.
 */

import * as path from 'path';
import { Page } from '@playwright/test';
import { test, expect } from '../../fixtures/electron-seeded.fixture';
import { openProject } from '../../helpers/window.helper';
import { NavigationSidebarComponent } from '../../page-objects/components/NavigationSidebar';

const PROJECT = 'test_project';

const openConnections = async (
  electronApp: Parameters<typeof openProject>[0],
) => {
  const window = await openProject(electronApp, PROJECT);
  const nav = new NavigationSidebarComponent(window);
  await nav.goToConnections();
  await expect(
    window.getByRole('heading', { name: 'Connections', exact: true }),
  ).toBeVisible();
  return window;
};

const connectionCard = (window: Page, name: string) =>
  window.getByRole('main').locator('.MuiCard-root').filter({ hasText: name });

const openNewDuckDbForm = async (window: Page) => {
  await window.getByRole('button', { name: 'New Connection' }).first().click();
  await expect(window.getByText('Create New Connection')).toBeVisible();
  await window.getByRole('heading', { name: 'DuckDB', exact: true }).click();
  await expect(window.getByText('Setup connection')).toBeVisible();
};

test.describe('Connections', () => {
  test('should show the seeded connection details', async ({ electronApp }) => {
    const window = await openConnections(electronApp);

    const card = connectionCard(window, 'test_db');
    await expect(card).toBeVisible();
    await expect(card.getByText('DuckDB')).toBeVisible();
    await expect(card.getByText('Path: :memory:')).toBeVisible();
    await expect(card.getByText('Used by projects:')).toBeVisible();
    await expect(card.getByText(PROJECT)).toBeVisible();
  });

  test('should not allow deleting a connection that a project uses', async ({
    electronApp,
  }) => {
    const window = await openConnections(electronApp);

    const card = connectionCard(window, 'test_db');
    await expect(card.getByRole('button', { name: 'Delete' })).toBeDisabled();
  });

  test('should open the edit form and return with Cancel', async ({
    electronApp,
  }) => {
    const window = await openConnections(electronApp);

    await connectionCard(window, 'test_db')
      .getByRole('button', { name: 'Edit' })
      .click();

    await expect(window.getByText('Setup connection')).toBeVisible();
    await expect(window.getByLabel('Connection Name')).toHaveValue('test_db');

    await window.getByRole('button', { name: 'Cancel' }).click();
    await expect(
      window.getByRole('heading', { name: 'Connections', exact: true }),
    ).toBeVisible();
  });

  test('should offer every supported database type', async ({
    electronApp,
  }) => {
    const window = await openConnections(electronApp);

    await window
      .getByRole('button', { name: 'New Connection' })
      .first()
      .click();
    await expect(window.getByText('Create New Connection')).toBeVisible();

    // eslint-disable-next-line no-restricted-syntax
    for (const type of [
      'PostgreSQL',
      'Snowflake',
      'BigQuery',
      'Redshift',
      'Databricks',
      'DuckDB',
      'SQLite',
      'Kinetica',
    ]) {
      // eslint-disable-next-line no-await-in-loop
      await expect(
        window.getByRole('heading', { name: type, exact: true }),
      ).toBeVisible();
    }
  });

  test('should gate Test Connection on a database path', async ({
    electronApp,
  }) => {
    const window = await openConnections(electronApp);
    await openNewDuckDbForm(window);

    await expect(window.getByLabel('Connection Name')).toHaveValue(
      'DuckDB Connection',
    );
    const testBtn = window.getByRole('button', { name: 'Test Connection' });
    await expect(testBtn).toBeDisabled();

    await window.getByLabel('Database File Path').fill('/tmp/anything.duckdb');
    await expect(testBtn).toBeEnabled();
  });

  test('should reject a duplicate connection name', async ({ electronApp }) => {
    const window = await openConnections(electronApp);
    await openNewDuckDbForm(window);

    await window.getByLabel('Connection Name').fill('test_db');
    await window.getByLabel('Database File Path').fill('/tmp/dup.duckdb');
    await window.getByRole('button', { name: 'Save' }).click();

    await expect(
      window
        .locator('.Toastify__toast--error')
        .filter({ hasText: 'A connection with this name already exists' }),
    ).toBeVisible();
    // Still on the form
    await expect(window.getByText('Setup connection')).toBeVisible();
  });

  test('should reject an empty connection name', async ({ electronApp }) => {
    const window = await openConnections(electronApp);
    await openNewDuckDbForm(window);

    await window.getByLabel('Connection Name').fill('');
    await window.getByLabel('Database File Path').fill('/tmp/empty.duckdb');
    await window.getByRole('button', { name: 'Save' }).click();

    await expect(
      window
        .locator('.Toastify__toast--error')
        .filter({ hasText: 'Connection name cannot be empty' }),
    ).toBeVisible();
  });

  test('should create and then delete a DuckDB connection', async ({
    electronApp,
    userData,
  }) => {
    const window = await openConnections(electronApp);
    await openNewDuckDbForm(window);

    await window.getByLabel('Connection Name').fill('e2e_duck');
    await window
      .getByLabel('Database File Path')
      .fill(path.join(userData, 'e2e.duckdb'));
    await window.getByRole('button', { name: 'Save' }).click();

    await expect(
      window
        .locator('.Toastify__toast--success')
        .filter({ hasText: 'DuckDB connection configured successfully!' }),
    ).toBeVisible();
    await expect(window.getByText('Database Connections (2)')).toBeVisible();

    const card = connectionCard(window, 'e2e_duck');
    await expect(card).toBeVisible();
    const deleteBtn = card.getByRole('button', { name: 'Delete' });
    await expect(deleteBtn).toBeEnabled();
    await deleteBtn.click();

    const dialog = window.getByRole('dialog').filter({
      hasText: 'Delete Connection',
    });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText('"e2e_duck"')).toBeVisible();
    await dialog.getByRole('button', { name: 'Delete' }).click();

    await expect(dialog).toBeHidden();
    await expect(window.getByText('Database Connections (1)')).toBeVisible();
    await expect(card).toBeHidden();
  });
});
