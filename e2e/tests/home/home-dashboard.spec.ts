/**
 * Home Screen (Dashboard) Tests
 *
 * The Home header (search, Connect to Cloud, Settings) replaces the top bar,
 * the Recent Projects New Project button opens the new project form, and the
 * page scales to fit the window so it never scrolls. Uses the seeded fixture,
 * so a project exists and the page fits the window (the quick start tour,
 * shown only with no projects, keeps it unscaled).
 */

import { ElectronApplication, Page } from '@playwright/test';
import { test, expect } from '../../fixtures/electron-seeded.fixture';
import { openHome } from '../../helpers/window.helper';

const header = (window: Page) =>
  window.locator('[data-tour="tour-workspace-overview"]');

// The search icon's tooltip text is its name
const searchButtons = (window: Page) =>
  window.getByRole('button', { name: 'Search (Ctrl+K)' });

const resizeAppWindow = async (
  electronApp: ElectronApplication,
  width: number,
  height: number,
) => {
  await electronApp.evaluate(
    ({ BrowserWindow }, [contentWidth, contentHeight]) => {
      BrowserWindow.getAllWindows().forEach((appWindow) => {
        appWindow.unmaximize();
        appWindow.setContentSize(contentWidth, contentHeight);
      });
    },
    [width, height],
  );
};

const homePageScale = (window: Page) =>
  window.evaluate(() =>
    parseFloat(
      getComputedStyle(
        document.querySelector('[data-tour="tour-workspace-overview"]')!
          .parentElement!,
      ).getPropertyValue('zoom'),
    ),
  );

// Whether the page, or the app area around it, has a vertical scrollbar
const homeScrolls = (window: Page) =>
  window.evaluate(() => {
    const page = document.querySelector(
      '[data-tour="tour-workspace-overview"]',
    )!.parentElement!;
    const pageWindow = page.parentElement!;
    const appArea = pageWindow.parentElement!;
    return [pageWindow, appArea].some(
      (element) => element.scrollHeight > element.clientHeight,
    );
  });

test.describe('Home', () => {
  test('shows search, Connect to Cloud and Settings in its header instead of a top bar', async ({
    electronApp,
  }) => {
    const window = await openHome(electronApp);

    const search = header(window).getByRole('button', {
      name: 'Search (Ctrl+K)',
    });
    const cloud = header(window).getByRole('button', {
      name: /Connect to Cloud/,
    });
    const settings = header(window).getByRole('button', { name: 'Settings' });
    await expect(search).toBeVisible();
    await expect(cloud).toBeVisible();
    await expect(settings).toBeVisible();

    // Left to right: search, Connect to Cloud, Settings
    const [searchBox, cloudBox, settingsBox] = await Promise.all([
      search.boundingBox(),
      cloud.boundingBox(),
      settings.boundingBox(),
    ]);
    expect(searchBox!.x).toBeLessThan(cloudBox!.x);
    expect(cloudBox!.x).toBeLessThan(settingsBox!.x);

    // No top bar on Home, so the header's search is the only one
    await expect(searchButtons(window)).toHaveCount(1);

    // A project screen still has its top bar with search
    await window.locator('[data-testid="nav-item-files"]').click();
    await expect(header(window)).toBeHidden();
    await expect(searchButtons(window)).toHaveCount(1);
  });

  test('opens the new project form from Recent Projects', async ({
    electronApp,
  }) => {
    const window = await openHome(electronApp);

    await window.locator('[data-tour="tour-open-project-btn"]').click();

    await expect(window.getByTestId('project-name-input')).toBeVisible();
  });

  test('fits the window without scrolling at every size', async ({
    electronApp,
  }) => {
    const window = await openHome(electronApp);

    // Too short for the page at normal size, so it has to shrink to fit
    await resizeAppWindow(electronApp, 1280, 520);
    await expect.poll(() => homePageScale(window)).toBeLessThan(1);

    // eslint-disable-next-line no-restricted-syntax
    for (const [width, height] of [
      [1280, 520],
      [1024, 600],
      [1366, 705],
      [1600, 900],
      [900, 900],
    ]) {
      // eslint-disable-next-line no-await-in-loop
      await resizeAppWindow(electronApp, width, height);
      // The page refits over a few frames after a resize
      // eslint-disable-next-line no-await-in-loop
      await expect
        .poll(() => homeScrolls(window), {
          message: `Home scrolls at ${width}x${height}`,
        })
        .toBe(false);
    }
  });
});
