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
 * Land on the Home screen (dashboard) with setup skipped. Home is the app's
 * default route, so this simply waits for the workspace overview to mount.
 */
export const openHome = async (
  electronApp: ElectronApplication,
): Promise<Page> => {
  const window = await findStableWindow(electronApp);
  await window.waitForLoadState('domcontentloaded');

  const appHelper = new AppHelper(electronApp, window);
  await appHelper.skipSetupIfPresent();

  await window.waitForSelector('[data-tour="tour-workspace-overview"]', {
    timeout: 10000,
  });
  return window;
};

/**
 * Land on the project selection screen with setup skipped. The app opens on
 * the Home screen, so when the selection screen is not already mounted we take
 * the "Open Project" shortcut from Home.
 */
export const openProjectSelection = async (
  electronApp: ElectronApplication,
): Promise<Page> => {
  const window = await findStableWindow(electronApp);
  await window.waitForLoadState('domcontentloaded');

  const appHelper = new AppHelper(electronApp, window);
  await appHelper.skipSetupIfPresent();

  const selection = window.locator('[data-testid="project-selection"]');
  const home = window.locator('[data-tour="tour-workspace-overview"]');

  await Promise.race([
    selection.waitFor({ state: 'visible', timeout: 10000 }),
    home.waitFor({ state: 'visible', timeout: 10000 }),
  ]);

  if (await home.isVisible().catch(() => false)) {
    await appHelper.dismissQuickStartTourIfPresent();
    await window.locator('[data-tour="tour-open-project-btn"]').click();
  }

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

  // The app opens on the Home screen, so enter the selected project's
  // workspace to mount the project-scoped chrome (file tree, dbt actions).
  await window.locator('[data-testid="nav-item-files"]').click();
  return window;
};
