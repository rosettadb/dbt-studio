/**
 * File Tree Tests
 *
 * Creating, finding, and deleting files and folders from the explorer panel,
 * with every change verified on disk.
 */

import * as fs from 'fs';
import * as path from 'path';
import { Page } from '@playwright/test';
import { test, expect } from '../../fixtures/electron-seeded.fixture';
import { openProject } from '../../helpers/window.helper';

const PROJECT = 'test_project';

/**
 * Hover a tree row and click one of its action icons. The icons exist on
 * every folder row and are only made opaque on hover, so they must be scoped
 * to the row (react-arborist renders rows as `treeitem`) rather than picked
 * globally.
 */
const clickNodeAction = async (
  window: Page,
  nodeName: string,
  action: 'New File' | 'New Folder' | 'Delete',
) => {
  const row = window
    .getByRole('treeitem')
    .filter({ has: window.getByTitle(nodeName, { exact: true }) })
    .first();
  await row.hover();
  await row.getByTitle(action).click();
};

/**
 * The tree does not reliably re-read the directory after a create, so use
 * the explorer's refresh control (a tooltip-labelled icon) before asserting
 * on new nodes.
 */
const refreshTree = async (window: Page) => {
  await window.getByLabel('Refresh directories').click();
};

/** Expand a folder row if it is collapsed (clicking a label toggles it) */
const expandFolder = async (window: Page, name: string) => {
  const row = window
    .getByRole('treeitem')
    .filter({ has: window.getByTitle(name, { exact: true }) })
    .first();
  await expect(row).toBeVisible();
  if ((await row.getAttribute('aria-expanded')) !== 'true') {
    await row.getByTitle(name, { exact: true }).click();
  }
};

const createFolder = async (window: Page, parent: string, name: string) => {
  await clickNodeAction(window, parent, 'New Folder');
  await expect(window.getByText('Create new folder')).toBeVisible();
  await window.getByLabel('Folder name').fill(name);
  await window.getByRole('button', { name: 'Save' }).click();
  await expect(window.getByText('Create new folder')).toBeHidden();
  await refreshTree(window);
  await expect(window.getByTitle(name, { exact: true }).first()).toBeVisible();
};

test.describe('File Tree', () => {
  test('should create a folder from the root hover action', async ({
    electronApp,
    userData,
  }) => {
    const window = await openProject(electronApp, PROJECT);
    const folderPath = path.join(userData, 'projects', PROJECT, 'e2e_folder');

    await createFolder(window, PROJECT, 'e2e_folder');

    await expect.poll(() => fs.existsSync(folderPath)).toBe(true);
    await expect(window.getByTitle('e2e_folder').first()).toBeVisible();
  });

  test('should create a file inside a folder', async ({
    electronApp,
    userData,
  }) => {
    const window = await openProject(electronApp, PROJECT);
    const filePath = path.join(
      userData,
      'projects',
      PROJECT,
      'e2e_folder',
      'notes.md',
    );

    await createFolder(window, PROJECT, 'e2e_folder');
    await expect(window.getByTitle('e2e_folder').first()).toBeVisible();

    await clickNodeAction(window, 'e2e_folder', 'New File');
    await expect(window.getByText('Create new file')).toBeVisible();
    await window.getByLabel('File name').fill('notes.md');
    await window.getByRole('button', { name: 'Save' }).click();
    await expect(window.getByText('Create new file')).toBeHidden();

    await expect.poll(() => fs.existsSync(filePath)).toBe(true);
    await refreshTree(window);
    await expandFolder(window, 'e2e_folder');
    await expect(window.getByTitle('notes.md').first()).toBeVisible();
  });

  test('should not allow saving an empty name', async ({ electronApp }) => {
    const window = await openProject(electronApp, PROJECT);

    await clickNodeAction(window, PROJECT, 'New Folder');
    await expect(window.getByText('Create new folder')).toBeVisible();
    await expect(window.getByRole('button', { name: 'Save' })).toBeDisabled();
  });

  test('should filter the tree by search', async ({ electronApp }) => {
    const window = await openProject(electronApp, PROJECT);

    await createFolder(window, PROJECT, 'alpha_dir');
    await createFolder(window, PROJECT, 'beta_dir');
    await expect(window.getByTitle('alpha_dir').first()).toBeVisible();
    await expect(window.getByTitle('beta_dir').first()).toBeVisible();

    const search = window.getByPlaceholder('Search files or folders...');
    await search.fill('alpha');

    await expect(window.getByTitle('alpha_dir').first()).toBeVisible();
    await expect(window.getByTitle('beta_dir')).toBeHidden();

    await window.getByRole('button', { name: 'Clear search' }).click();
    await expect(window.getByTitle('beta_dir').first()).toBeVisible();
  });

  test('should delete a folder after confirmation', async ({
    electronApp,
    userData,
  }) => {
    const window = await openProject(electronApp, PROJECT);
    const folderPath = path.join(userData, 'projects', PROJECT, 'doomed');

    await createFolder(window, PROJECT, 'doomed');
    await expect.poll(() => fs.existsSync(folderPath)).toBe(true);

    await clickNodeAction(window, 'doomed', 'Delete');
    const dialog = window.getByRole('dialog').filter({
      hasText: 'Confirm Delete',
    });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText('doomed')).toBeVisible();

    // Cancel keeps it
    await dialog.getByRole('button', { name: 'Cancel' }).click();
    await expect(dialog).toBeHidden();
    expect(fs.existsSync(folderPath)).toBe(true);

    // Confirm removes it
    await clickNodeAction(window, 'doomed', 'Delete');
    await dialog.getByRole('button', { name: 'Delete' }).click();
    await expect(dialog).toBeHidden();
    await expect.poll(() => fs.existsSync(folderPath)).toBe(false);
    await expect(window.getByTitle('doomed')).toBeHidden();
  });
});
