/**
 * Flows Tests
 *
 * Flowfile is not installed in the e2e environment, so the screen must show
 * its not-running state and point the user to settings.
 */

import { test, expect } from '../../fixtures/electron-seeded.fixture';
import { openProject } from '../../helpers/window.helper';
import { NavigationSidebarComponent } from '../../page-objects/components/NavigationSidebar';

test.describe('Flows', () => {
  test('should show the Flowfile not-running state', async ({
    electronApp,
  }) => {
    const window = await openProject(electronApp, 'test_project');
    const nav = new NavigationSidebarComponent(window);

    await nav.goToFlows();

    await expect(window.getByText('Flowfile is not running')).toBeVisible();
    await expect(
      window.getByRole('button', { name: 'Start', exact: true }),
    ).toBeVisible();
    await expect(window.getByText(/Not installed\?/)).toBeVisible();
    await nav.expectActiveItem('flows');
  });
});
