/**
 * Project Selection Screen Tests
 *
 * Covers listing, searching, validation, and the two removal paths
 * (delete from disk vs. remove from list only) on the project selection
 * screen. Projects are seeded through the `extraProjects` fixture option so
 * they exist before the app launches.
 */

import * as fs from 'fs';
import * as path from 'path';
import { Page, ElectronApplication } from '@playwright/test';
import { test, expect } from '../../fixtures/electron.fixture';
import { ProjectSelectionPage } from '../../page-objects/screens/ProjectSelection';
import { openProjectSelection } from '../../helpers/window.helper';

// Helper to find a stable window (after splash screen closes)
const findStableWindow = async (
  electronApp: ElectronApplication,
): Promise<Page> => {
  const predicate = (w: Page) => {
    const url = w.url();
    return (
      url.includes('/setup') ||
      url.includes('/main') ||
      (url.startsWith('file:') && !url.includes('splash')) ||
      url.startsWith('chrome-error:')
    );
  };

  const windows = electronApp.windows();
  const existing = windows.find(predicate);
  if (existing) return existing;

  // eslint-disable-next-line no-console
  console.log('Waiting for stable app window...');
  return electronApp.waitForEvent('window', {
    predicate,
    timeout: 30000,
  });
};

const errorToast = (page: Page, text: string) =>
  page.locator('.Toastify__toast--error').filter({ hasText: text });

test.describe('Project Selection', () => {
  test.beforeEach(async ({ electronApp }) => {
    await openProjectSelection(electronApp);
  });

  test.describe('with no projects', () => {
    test('should show the empty state', async ({ electronApp }) => {
      const stableWindow = await findStableWindow(electronApp);
      const projectSelection = new ProjectSelectionPage(stableWindow);

      await expect(stableWindow.getByText('No Projects found')).toBeVisible();
      await projectSelection.expectNoProjects();
      await expect(projectSelection.createProjectBtn).toBeVisible();
      await expect(projectSelection.importProjectBtn).toBeVisible();
    });

    test('should return to the list when cancelling a new project', async ({
      electronApp,
    }) => {
      const stableWindow = await findStableWindow(electronApp);
      const projectSelection = new ProjectSelectionPage(stableWindow);

      await projectSelection.clickCreateProject();
      await expect(
        stableWindow.locator('[data-testid="project-name-input"]'),
      ).toBeVisible();

      await stableWindow.getByRole('button', { name: 'Cancel' }).click();

      await expect(projectSelection.createProjectBtn).toBeVisible();
      await expect(
        stableWindow.locator('[data-testid="project-name-input"]'),
      ).toBeHidden();
    });

    test('should reject a project name shorter than 3 characters', async ({
      electronApp,
    }) => {
      const stableWindow = await findStableWindow(electronApp);
      const projectSelection = new ProjectSelectionPage(stableWindow);

      await projectSelection.clickCreateProject();
      await stableWindow
        .locator('[data-testid="project-name-input"]')
        .fill('ab');
      await stableWindow
        .locator('[data-testid="project-create-confirm-btn"]')
        .click();

      await expect(
        errorToast(stableWindow, 'at least 3 characters'),
      ).toBeVisible();
      // Still on the form
      await expect(
        stableWindow.locator('[data-testid="project-name-input"]'),
      ).toBeVisible();
    });

    test('should reject a project name with invalid characters', async ({
      electronApp,
    }) => {
      const stableWindow = await findStableWindow(electronApp);
      const projectSelection = new ProjectSelectionPage(stableWindow);

      await projectSelection.clickCreateProject();
      await stableWindow
        .locator('[data-testid="project-name-input"]')
        .fill('my project');
      await stableWindow
        .locator('[data-testid="project-create-confirm-btn"]')
        .click();

      await expect(
        errorToast(stableWindow, 'must start with a letter'),
      ).toBeVisible();
    });
  });

  test.describe('with seeded projects', () => {
    test.use({ extraProjects: ['Alpha_Project', 'Beta_Project'] });

    test('should list all seeded projects', async ({ electronApp }) => {
      const stableWindow = await findStableWindow(electronApp);
      const projectSelection = new ProjectSelectionPage(stableWindow);

      await projectSelection.expectProjectToExist('Alpha_Project');
      await projectSelection.expectProjectToExist('Beta_Project');
      expect(await projectSelection.getProjectCount()).toBe(2);
    });

    test('should show "No connection" for a project without a connection', async ({
      electronApp,
    }) => {
      const stableWindow = await findStableWindow(electronApp);

      const card = stableWindow.locator(
        '[data-testid="project-card-Alpha_Project"]',
      );
      await expect(card.getByText('No connection')).toBeVisible();
    });

    test('should filter projects by search query', async ({ electronApp }) => {
      const stableWindow = await findStableWindow(electronApp);
      const projectSelection = new ProjectSelectionPage(stableWindow);

      // Search is case-insensitive
      await projectSelection.searchProjects('alpha');
      await projectSelection.expectProjectToExist('Alpha_Project');
      await projectSelection.expectProjectNotToExist('Beta_Project');

      // No match shows the search empty state
      await projectSelection.searchProjects('does-not-exist');
      await expect(
        stableWindow.getByText('No Matching Projects'),
      ).toBeVisible();

      // Clearing restores the full list
      await projectSelection.clearSearch();
      await projectSelection.expectProjectToExist('Alpha_Project');
      await projectSelection.expectProjectToExist('Beta_Project');
    });

    test('should reject a duplicate project name regardless of case', async ({
      electronApp,
    }) => {
      const stableWindow = await findStableWindow(electronApp);
      const projectSelection = new ProjectSelectionPage(stableWindow);

      await projectSelection.clickCreateProject();
      await stableWindow
        .locator('[data-testid="project-name-input"]')
        .fill('alpha_project');
      await stableWindow
        .locator('[data-testid="project-create-confirm-btn"]')
        .click();

      await expect(errorToast(stableWindow, 'already exists')).toBeVisible();
    });

    test('should remove a project from the list without deleting its folder', async ({
      electronApp,
      userData,
    }) => {
      const stableWindow = await findStableWindow(electronApp);
      const projectSelection = new ProjectSelectionPage(stableWindow);
      const projectDir = path.join(userData, 'projects', 'Alpha_Project');
      expect(fs.existsSync(projectDir)).toBe(true);

      await stableWindow
        .locator('[data-testid="project-options-Alpha_Project"]')
        .click();
      await stableWindow
        .locator('[data-testid="context-menu-remove-from-list"]')
        .click();
      await stableWindow
        .locator('[data-testid="confirm-remove-from-list-btn"]')
        .click();

      await projectSelection.expectProjectNotToExist('Alpha_Project');
      await projectSelection.expectProjectToExist('Beta_Project');
      expect(fs.existsSync(projectDir)).toBe(true);
    });

    test('should delete a project and its folder on disk', async ({
      electronApp,
      userData,
    }) => {
      const stableWindow = await findStableWindow(electronApp);
      const projectSelection = new ProjectSelectionPage(stableWindow);
      const projectDir = path.join(userData, 'projects', 'Beta_Project');
      expect(fs.existsSync(projectDir)).toBe(true);

      await stableWindow
        .locator('[data-testid="project-options-Beta_Project"]')
        .click();
      await stableWindow.locator('[data-testid="context-menu-delete"]').click();
      await stableWindow.locator('[data-testid="confirm-delete-btn"]').click();

      await projectSelection.expectProjectNotToExist('Beta_Project');
      await projectSelection.expectProjectToExist('Alpha_Project');
      await expect.poll(() => fs.existsSync(projectDir)).toBe(false);
    });

    test('should cancel deletion and keep the project', async ({
      electronApp,
    }) => {
      const stableWindow = await findStableWindow(electronApp);
      const projectSelection = new ProjectSelectionPage(stableWindow);

      await stableWindow
        .locator('[data-testid="project-options-Alpha_Project"]')
        .click();
      await stableWindow.locator('[data-testid="context-menu-delete"]').click();
      await stableWindow.getByRole('button', { name: 'Cancel' }).click();

      await expect(
        stableWindow.locator('[data-testid="confirm-delete-btn"]'),
      ).toBeHidden();
      await projectSelection.expectProjectToExist('Alpha_Project');
    });
  });
});
