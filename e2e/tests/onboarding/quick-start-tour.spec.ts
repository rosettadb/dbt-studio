/**
 * Quick Start Tour Tests
 *
 * The tour auto-opens on the project selection screen when there are no
 * projects and it has not been seen before. Its overlay blocks the whole
 * page until it is skipped or completed. The fixture suppresses it by
 * default; these specs opt back in.
 */

import { test, expect } from '../../fixtures/electron.fixture';
import { openProjectSelection } from '../../helpers/window.helper';
import { QuickStartTourComponent } from '../../page-objects/components/QuickStartTour';
import { ProjectSelectionPage } from '../../page-objects/screens/ProjectSelection';

test.describe('Quick Start Tour', () => {
  test.use({ skipQuickStartTour: false });

  test('should open automatically for a new user with no projects', async ({
    electronApp,
  }) => {
    const window = await openProjectSelection(electronApp);
    const tour = new QuickStartTourComponent(window);

    await tour.expectVisible();
    await expect(window.getByText(/Welcome to DBT Studio!/)).toBeVisible();
    await tour.expectStep(1);
    await expect(tour.button('Skip')).toBeVisible();
    await expect(tour.button("Let's Go!")).toBeVisible();
    expect(await tour.hasBeenMarkedSeen()).toBe(false);
  });

  test('should block the page underneath until dismissed', async ({
    electronApp,
  }) => {
    const window = await openProjectSelection(electronApp);
    const tour = new QuickStartTourComponent(window);
    const projectSelection = new ProjectSelectionPage(window);

    await tour.expectVisible();

    // The overlay intercepts pointer events, so a normal click never lands
    await expect(
      projectSelection.createProjectBtn.click({ timeout: 1500 }),
    ).rejects.toThrow();

    await tour.skip();
    await tour.expectHidden();

    // Now the page is interactive again
    await projectSelection.clickCreateProject();
    await expect(
      window.locator('[data-testid="project-name-input"]'),
    ).toBeVisible();
  });

  test('should step forward and back through the tour', async ({
    electronApp,
  }) => {
    const window = await openProjectSelection(electronApp);
    const tour = new QuickStartTourComponent(window);

    await tour.expectStep(1);
    await tour.letsGo();
    await tour.expectStep(2);
    await expect(
      window.getByRole('heading', { name: 'Your Projects' }),
    ).toBeVisible();

    await tour.next();
    await tour.expectStep(3);
    await expect(
      window.getByRole('heading', { name: 'Create a New Project' }),
    ).toBeVisible();

    await tour.back();
    await tour.expectStep(2);
  });

  test('should mark the tour as seen when skipped', async ({ electronApp }) => {
    const window = await openProjectSelection(electronApp);
    const tour = new QuickStartTourComponent(window);

    await tour.expectVisible();
    await tour.skip();

    await tour.expectHidden();
    expect(await tour.hasBeenMarkedSeen()).toBe(true);
  });

  test('should close with the skip icon at any step', async ({
    electronApp,
  }) => {
    const window = await openProjectSelection(electronApp);
    const tour = new QuickStartTourComponent(window);

    await tour.letsGo();
    await tour.expectStep(2);
    await tour.closeWithIcon();

    await tour.expectHidden();
    expect(await tour.hasBeenMarkedSeen()).toBe(true);
  });

  test('should finish with Done on the last step', async ({ electronApp }) => {
    const window = await openProjectSelection(electronApp);
    const tour = new QuickStartTourComponent(window);

    await tour.letsGo();
    // Steps 2..6 advance with Next; step 7 is the last
    // eslint-disable-next-line no-plusplus
    for (let step = 2; step < 7; step++) {
      // eslint-disable-next-line no-await-in-loop
      await tour.expectStep(step);
      // eslint-disable-next-line no-await-in-loop
      await tour.next();
    }
    await tour.expectStep(7);
    await expect(window.getByText(/You're All Set!/)).toBeVisible();

    await tour.done();
    await tour.expectHidden();
    expect(await tour.hasBeenMarkedSeen()).toBe(true);
  });

  test.describe('with an existing project', () => {
    test.use({ extraProjects: ['Existing_Project'] });

    test('should not open when the user already has projects', async ({
      electronApp,
    }) => {
      const window = await openProjectSelection(electronApp);
      const tour = new QuickStartTourComponent(window);

      // Give the 700ms auto-open timer a chance to fire
      await window.waitForTimeout(1500);
      await tour.expectHidden();
      // The app self-heals the flag so the tour never nags an existing user
      expect(await tour.hasBeenMarkedSeen()).toBe(true);
    });
  });
});

test.describe('Quick Start Tour - fixture default', () => {
  test('should be suppressed by the fixture for ordinary specs', async ({
    electronApp,
  }) => {
    const window = await openProjectSelection(electronApp);
    const tour = new QuickStartTourComponent(window);

    await window.waitForTimeout(1500);
    await tour.expectHidden();
    expect(await tour.hasBeenMarkedSeen()).toBe(true);
  });
});
