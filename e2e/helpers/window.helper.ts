/**
 * Window Helper
 *
 * Shared helpers for locating the app window after the splash screen closes
 * and for landing inside the main app with the seeded project open.
 */

import { Page, ElectronApplication, expect } from '@playwright/test';
import { AppHelper } from './app.helper';
import { ProjectSelectionPage } from '../page-objects/screens/ProjectSelection';

/**
 * Find the stable app window (setup or main), waiting for it to open if the
 * splash screen is still showing.
 */
export const findStableWindow = async (
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

  return electronApp.waitForEvent('window', {
    predicate,
    timeout: 30000,
  });
};

/**
 * Land on the project selection screen with setup skipped.
 */
export const openProjectSelection = async (
  electronApp: ElectronApplication,
): Promise<Page> => {
  const window = await findStableWindow(electronApp);
  await window.waitForLoadState('domcontentloaded');

  const appHelper = new AppHelper(electronApp, window);
  await appHelper.skipSetupIfPresent();

  await window.waitForSelector('[data-testid="project-selection"]', {
    timeout: 10000,
  });
  return window;
};

/**
 * Land inside the main app with the given project selected. Works with the
 * seeded fixture (which already has `selectedProject`) and with the plain
 * fixture plus `extraProjects`.
 */
export const openProject = async (
  electronApp: ElectronApplication,
  projectName: string,
): Promise<Page> => {
  const window = await findStableWindow(electronApp);
  await window.waitForLoadState('domcontentloaded');

  const appHelper = new AppHelper(electronApp, window);
  await appHelper.skipSetupIfPresent();

  const projectSelection = new ProjectSelectionPage(window);
  if (await projectSelection.isVisible()) {
    await projectSelection.selectProject(projectName);
  }

  await expect(window.locator('[data-testid="sidebar"]')).toBeVisible({
    timeout: 30000,
  });
  return window;
};
