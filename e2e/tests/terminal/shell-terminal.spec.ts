/**
 * OS Shell Terminal Tests
 *
 * The SHELL tab of the bottom panel: real shells running in the project
 * folder, next to the built-in command terminal (TERMINAL tab).
 */

import { Page } from '@playwright/test';
import { test, expect } from '../../fixtures/electron-seeded.fixture';
import { openProject } from '../../helpers/window.helper';

const PROJECT = 'test_project';

const shellTab = (window: Page) =>
  window.getByRole('button', { name: 'SHELL', exact: true });
const terminal = (window: Page) => window.getByTestId('shell-terminal');
const sessionList = (window: Page) =>
  window.getByRole('listbox', { name: 'Open terminals' });
const newTerminal = (window: Page) =>
  window.getByRole('button', { name: 'New Terminal', exact: true });
const killTerminal = (window: Page) =>
  window.getByRole('button', { name: 'Kill Terminal', exact: true });

const openShellTab = async (window: Page) => {
  await shellTab(window).click();
  await expect(terminal(window).locator('.xterm')).toBeVisible();
};

test.describe('Shell terminal', () => {
  test('should open a shell next to the built-in terminal', async ({
    electronApp,
  }) => {
    const window = await openProject(electronApp, PROJECT);

    // The built-in command terminal is still the default tab.
    await expect(
      window.getByRole('button', { name: 'TERMINAL', exact: true }),
    ).toBeVisible();
    await expect(
      window.getByPlaceholder('Type a rosetta or dbt command...'),
    ).toBeVisible();

    await openShellTab(window);

    // The shell printed something (its prompt) into the terminal.
    await expect(terminal(window).locator('.xterm-rows')).toHaveText(/\S/);
    // One terminal: no session list yet.
    await expect(sessionList(window)).toHaveCount(0);
  });

  test('should run a command typed into the shell', async ({ electronApp }) => {
    const window = await openProject(electronApp, PROJECT);
    // Wait for the terminal the tab opens by itself before adding another.
    await openShellTab(window);

    if (process.platform === 'win32') {
      // Also covers launching a specific shell from the "+" menu.
      await window
        .getByRole('button', { name: 'Choose shell for new terminal' })
        .click();
      await window.getByRole('menuitem', { name: /Command Prompt/ }).click();
      await expect(sessionList(window).getByRole('option')).toHaveCount(2);
      await expect(
        sessionList(window).getByRole('option', { selected: true }),
      ).toHaveText('cmd');
    }

    const rows = terminal(window).locator('.xterm-rows');
    await expect(rows).toHaveText(/\S/);
    await terminal(window).click();

    // The output cannot be confused with the echo of the typed command.
    await window.keyboard.type(`node -p "6*7+'-shell-e2e'"`);
    await window.keyboard.press('Enter');

    await expect(rows).toContainText('42-shell-e2e');
  });

  test('should manage several terminals', async ({ electronApp }) => {
    const window = await openProject(electronApp, PROJECT);
    await openShellTab(window);

    await newTerminal(window).click();
    await newTerminal(window).click();

    const options = sessionList(window).getByRole('option');
    await expect(options).toHaveCount(3);
    // The newest terminal is the selected one.
    await expect(options.nth(2)).toHaveAttribute('aria-selected', 'true');

    await options.nth(0).click();
    await expect(options.nth(0)).toHaveAttribute('aria-selected', 'true');

    // Killing the selected terminal selects its neighbour.
    await killTerminal(window).click();
    await expect(options).toHaveCount(2);
    await expect(options.nth(0)).toHaveAttribute('aria-selected', 'true');

    await killTerminal(window).click();
    // Back to a single terminal: the list goes away again.
    await expect(sessionList(window)).toHaveCount(0);
    await expect(terminal(window).locator('.xterm')).toBeVisible();

    await killTerminal(window).click();
    await expect(
      window.getByText('No terminal is open for this project.'),
    ).toBeVisible();
    await expect(killTerminal(window)).toBeDisabled();
  });

  test('should keep a terminal running while another tab is shown', async ({
    electronApp,
  }) => {
    const window = await openProject(electronApp, PROJECT);
    await openShellTab(window);
    await newTerminal(window).click();
    await expect(sessionList(window).getByRole('option')).toHaveCount(2);

    await window.getByRole('button', { name: 'TERMINAL', exact: true }).click();
    await expect(terminal(window)).toHaveCount(0);

    // Coming back shows the same terminals instead of starting a new one.
    await shellTab(window).click();
    await expect(sessionList(window).getByRole('option')).toHaveCount(2);
    await expect(terminal(window).locator('.xterm-rows')).toHaveText(/\S/);
  });

  test('should rename a terminal', async ({ electronApp }) => {
    const window = await openProject(electronApp, PROJECT);
    await openShellTab(window);
    await newTerminal(window).click();
    const options = sessionList(window).getByRole('option');
    await expect(options).toHaveCount(2);

    await options.nth(1).dblclick();
    const dialog = window.getByRole('dialog');
    await dialog.getByLabel('Terminal name').fill('dbt run');
    await dialog.getByRole('button', { name: 'Rename' }).click();

    await expect(options.nth(1)).toHaveText('dbt run');
  });

  test('should maximize and restore the bottom panel', async ({
    electronApp,
  }) => {
    const window = await openProject(electronApp, PROJECT);
    await openShellTab(window);
    const editorHint = window.getByText(
      'Please select a file from the explorer on the left!',
    );
    await expect(editorHint).toBeVisible();

    await window.getByRole('button', { name: 'Maximize Panel' }).click();
    await expect(editorHint).not.toBeInViewport();

    await window.getByRole('button', { name: 'Restore Panel Size' }).click();
    await expect(editorHint).toBeInViewport();
  });
});
