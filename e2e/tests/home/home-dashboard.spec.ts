/**
 * Home Screen (Dashboard) Tests
 *
 * The Home header (search, Connect to Cloud, Settings) replaces the top bar,
 * the Recent Projects New Project button opens the new project form, and the
 * page scales to fit the window so it never scrolls (down to its 70% floor)
 * and settles without flickering. Uses the seeded fixture,
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
        // The dev build docks DevTools in the window a moment after start,
        // which squeezes the page; close it so the page gets the whole size
        appWindow.webContents.closeDevTools();
        appWindow.unmaximize();
        appWindow.setContentSize(contentWidth, contentHeight);
      });
    },
    [width, height],
  );
};

// The scale of the page's transform (1 when it has none)
const homePageScale = (window: Page) =>
  window.evaluate(
    () =>
      new DOMMatrix(
        getComputedStyle(
          document.querySelector('[data-tour="tour-workspace-overview"]')!
            .parentElement!,
        ).transform,
      ).a,
  );

// Whether the page, or the app area around it, has a vertical scrollbar
const homeScrolls = (window: Page) =>
  window.evaluate(() => {
    const page = document.querySelector(
      '[data-tour="tour-workspace-overview"]',
    )!.parentElement!;
    // page -> box sized to the scaled page -> the scrolling window box
    const pageWindow = page.parentElement!.parentElement!;
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

    await expect(window.getByTestId('project-type-step')).toBeVisible();
  });

  test('fits the window without scrolling or flickering at every size', async ({
    electronApp,
  }) => {
    const window = await openHome(electronApp);

    // Too short for the page at normal size, so it has to shrink to fit
    await resizeAppWindow(electronApp, 1280, 620);
    await expect.poll(() => homePageScale(window)).toBeLessThan(1);

    // All tall enough to fit above the 70% floor; a shorter window scrolls
    // eslint-disable-next-line no-restricted-syntax
    for (const [width, height] of [
      [1280, 620],
      [1024, 640],
      [1366, 705],
      [1600, 900],
      [900, 900],
    ]) {
      // eslint-disable-next-line no-await-in-loop
      await resizeAppWindow(electronApp, width, height);
      // Make sure the page really got the new size, so the checks below
      // aren't looking at the previous one. Within 2px: with display scaling
      // (e.g. 125%) Windows rounds the size to whole screen pixels.
      // eslint-disable-next-line no-await-in-loop
      await expect
        .poll(
          async () => {
            const [pageWidth, pageHeight] = await window.evaluate(() => [
              document.documentElement.clientWidth,
              document.documentElement.clientHeight,
            ]);
            return (
              Math.abs(pageWidth - width) <= 2 &&
              Math.abs(pageHeight - height) <= 2
            );
          },
          { message: `window never reached ${width}x${height}` },
        )
        .toBe(true);
      // The page refits over a few steps after a resize (growing can rewrap
      // text and need one shrink), so wait for the same scale twice in a row
      let settledScale = 0;
      // eslint-disable-next-line no-await-in-loop
      await expect
        .poll(
          async () => {
            const scaleBefore = await homePageScale(window);
            await window.waitForTimeout(500);
            settledScale = await homePageScale(window);
            return settledScale === scaleBefore;
          },
          { message: `Home never settles at ${width}x${height}` },
        )
        .toBe(true);
      // eslint-disable-next-line no-await-in-loop
      expect(await homeScrolls(window), `scrolls at ${width}x${height}`).toBe(
        false,
      );
      // Once settled it keeps that scale instead of flipping between two
      // eslint-disable-next-line no-await-in-loop
      await window.waitForTimeout(1000);
      // eslint-disable-next-line no-await-in-loop
      expect(await homePageScale(window), `scale at ${width}x${height}`).toBe(
        settledScale,
      );
    }
  });
});
