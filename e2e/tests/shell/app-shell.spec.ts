/**
 * App Shell Tests
 *
 * The chrome around every screen: the top menu's project switcher and cloud
 * login button, the status bar, and the AI assistant panel (without a
 * configured provider).
 */

import { test, expect } from '../../fixtures/electron-seeded.fixture';
import { openProject } from '../../helpers/window.helper';
import { NavigationSidebarComponent } from '../../page-objects/components/NavigationSidebar';

const PROJECT = 'test_project';

test.describe('App Shell', () => {
  test('should show the selected project in the top menu', async ({
    electronApp,
  }) => {
    const window = await openProject(electronApp, PROJECT);

    await expect(
      window.getByRole('button', { name: new RegExp(PROJECT) }).first(),
    ).toBeVisible();
    // The dbt actions split button is only shown once a project is selected
    await expect(
      window.getByRole('button', { name: 'Project', exact: true }),
    ).toBeVisible();
    // Note: the cloud login/dashboard button is not asserted because its
    // state comes from the host keychain, which is shared across test runs.
  });

  test('should navigate to all projects from the project switcher', async ({
    electronApp,
  }) => {
    const window = await openProject(electronApp, PROJECT);

    await window
      .getByRole('button', { name: new RegExp(PROJECT) })
      .first()
      .click();
    await window.getByRole('menuitem', { name: 'All Projects' }).click();

    await expect(
      window.locator('[data-testid="project-selection"]'),
    ).toBeVisible();
    await expect(
      window.locator(`[data-testid="project-card-${PROJECT}"]`),
    ).toBeVisible();
  });

  test('should show version information in the status bar', async ({
    electronApp,
  }) => {
    const window = await openProject(electronApp, PROJECT);

    // The status bar shows the package version (app.getVersion() reports
    // Electron's version in the unpackaged dev build), so match the shape
    await expect(window.getByText(/^v\d+\.\d+\.\d+/)).toBeVisible();
    await expect(window.getByText(/Rosetta:\s*0\.0\.0-test/)).toBeVisible();
    await expect(window.getByText(/dbt:/)).toBeVisible();
    await expect(window.getByText(/Python:/)).toBeVisible();
  });

  test('should open the AI assistant and point to provider settings', async ({
    electronApp,
  }) => {
    // The assistant pane is mounted by the workspace screens (SQL/Notebooks/
    // project details), so open it from the SQL editor.
    const window = await openProject(electronApp, PROJECT);
    const nav = new NavigationSidebarComponent(window);
    await nav.goToSqlEditor();

    await window.getByRole('button', { name: 'AI Assistant (beta)' }).click();

    // First open asks about agent memory. The dialog is rendered inline in
    // the chat pane (no portal), and MUI marks that subtree aria-hidden while
    // it is open, so role-based queries cannot see its buttons; match by text.
    await expect(window.getByText('AI Agent Memory')).toBeVisible();
    const keepOff = window.getByText('Keep memory off', { exact: true });
    await expect(keepOff).toBeVisible();
    await keepOff.click();
    await expect(window.getByText('AI Agent Memory')).toBeHidden();

    await expect(window.getByText('No AI providers configured')).toBeVisible();
    await window
      .getByRole('button', { name: 'Open AI Provider Settings' })
      .click();

    await expect
      .poll(() => window.url())
      .toContain('/app/settings/ai-providers');
    await expect(window.getByText('No AI Providers Configured')).toBeVisible();
  });
});
