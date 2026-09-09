import { Page, ElectronApplication } from '@playwright/test';
import { test, expect } from '../../fixtures/electron.fixture';
import { ProjectSelectionPage } from '../../page-objects/screens/ProjectSelection';
import { AppHelper } from '../../helpers/app.helper';

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

test.describe('Project Lifecycle', () => {
  test.beforeEach(async ({ electronApp }) => {
    // Wait for stable window (splash screen to close)
    const stableWindow = await findStableWindow(electronApp);
    await stableWindow.waitForLoadState('domcontentloaded');

    const appHelper = new AppHelper(electronApp, stableWindow);
    await appHelper.skipSetupIfPresent();

    // Wait for project selection screen to be visible
    await stableWindow.waitForSelector('[data-testid="project-selection"]', {
      timeout: 10000,
    });
  });

  test('should create a new project', async ({ electronApp }) => {
    const stableWindow = await findStableWindow(electronApp);
    const projectSelection = new ProjectSelectionPage(stableWindow);

    await projectSelection.clickCreateProject();

    // Fill project creation form
    const nameInput = stableWindow.locator(
      '[data-testid="project-name-input"]',
    );
    await nameInput.fill('Test_Project');

    const createBtn = stableWindow.locator(
      '[data-testid="project-create-confirm-btn"]',
    );
    await createBtn.click();

    // Verify project was created and app loaded (sidebar visible)
    const sidebar = stableWindow.locator('[data-testid="sidebar"]');
    await expect(sidebar).toBeVisible();
  });

  test.describe('with an existing project seeded', () => {
    // Seeded into database.json before the app launches (see
    // electron.fixture.ts) rather than written to the file mid-test — the
    // app only re-reads database.json on its own operations, so a write
    // made to it while the app is already running has no defined way to be
    // observed short of restarting the app.
    test.use({ extraProjects: ['Test_Project'] });

    test('should open existing project', async ({ electronApp }) => {
      const stableWindow = await findStableWindow(electronApp);
      const projectSelection = new ProjectSelectionPage(stableWindow);

      await projectSelection.selectProject('Test_Project');

      // Verify project details screen is shown (or main app)
      const sidebar = stableWindow.locator('[data-testid="sidebar"]');
      await expect(sidebar).toBeVisible();
    });

    test('should delete a project', async ({ electronApp }) => {
      const stableWindow = await findStableWindow(electronApp);

      // Get project card for verification
      const projectCard = stableWindow.locator(
        '[data-testid="project-card-Test_Project"]',
      );

      // Click options button
      const optionsBtn = stableWindow.locator(
        '[data-testid="project-options-Test_Project"]',
      );
      await optionsBtn.click();

      // Click delete option
      const deleteOption = stableWindow.locator(
        '[data-testid="context-menu-delete"]',
      );
      await deleteOption.click();

      // Confirm deletion
      const confirmBtn = stableWindow.locator(
        '[data-testid="confirm-delete-btn"]',
      );
      await confirmBtn.click();

      // Verify project is removed
      await expect(projectCard).not.toBeVisible();
    });
  });
});
