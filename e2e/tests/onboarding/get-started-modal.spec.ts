/**
 * Get Started Modal Tests
 *
 * The "Get Started" dialog offers to clone the example project. It is only
 * opened by a user action (never automatically). Creating the example
 * project needs network access, so these tests stop at the dialog itself.
 */

import { test, expect } from '../../fixtures/electron.fixture';
import { openProjectSelection } from '../../helpers/window.helper';

const DIALOG_TITLE = 'Get Started with RosettaDB';

test.describe('Get Started Modal', () => {
  test.describe('with no projects', () => {
    test('should open from the empty state and describe the example project', async ({
      electronApp,
    }) => {
      const window = await openProjectSelection(electronApp);

      await expect(window.getByRole('dialog')).toBeHidden();
      await window.getByRole('button', { name: 'Get Started' }).click();

      const dialog = window.getByRole('dialog');
      await expect(dialog).toBeVisible();
      await expect(dialog.getByText(DIALOG_TITLE)).toBeVisible();
      await expect(dialog.getByText("What's included:")).toBeVisible();
      // exact: the intro paragraph also mentions "best practices"
      await expect(
        dialog.getByText('DuckDB Database', { exact: true }),
      ).toBeVisible();
      await expect(
        dialog.getByText('Sample DBT Models', { exact: true }),
      ).toBeVisible();
      await expect(
        dialog.getByText('Example Analytics', { exact: true }),
      ).toBeVisible();
      await expect(
        dialog.getByText('Best Practices', { exact: true }),
      ).toBeVisible();
      await expect(
        dialog.getByRole('button', { name: 'Create Example Project' }),
      ).toBeEnabled();
    });

    test('should close with Cancel', async ({ electronApp }) => {
      const window = await openProjectSelection(electronApp);

      await window.getByRole('button', { name: 'Get Started' }).click();
      const dialog = window.getByRole('dialog');
      await expect(dialog).toBeVisible();

      await dialog.getByRole('button', { name: 'Cancel' }).click();
      await expect(dialog).toBeHidden();
    });

    test('should close with Escape', async ({ electronApp }) => {
      const window = await openProjectSelection(electronApp);

      await window.getByRole('button', { name: 'Get Started' }).click();
      const dialog = window.getByRole('dialog');
      await expect(dialog).toBeVisible();

      await window.keyboard.press('Escape');
      await expect(dialog).toBeHidden();
    });
  });

  test.describe('with existing projects', () => {
    test.use({ extraProjects: ['Some_Project'] });

    test('should open from the header button', async ({ electronApp }) => {
      const window = await openProjectSelection(electronApp);

      // The header button is wrapped in a tooltip, which becomes its
      // accessible name
      await window
        .getByRole('button', {
          name: 'Import getting started example project',
        })
        .click();

      const dialog = window.getByRole('dialog');
      await expect(dialog).toBeVisible();
      await expect(dialog.getByText(DIALOG_TITLE)).toBeVisible();

      await dialog.getByRole('button', { name: 'Cancel' }).click();
      await expect(dialog).toBeHidden();
    });
  });
});
