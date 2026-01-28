/**
 * File Tree Component
 *
 * Page object for the file tree/explorer component used for
 * navigating project files and folders.
 */

import { Page, Locator, expect } from '@playwright/test';
import { BasePage } from '../BasePage';

export class FileTreeComponent extends BasePage {
  // Container
  readonly container: Locator;

  // Action buttons
  readonly refreshBtn: Locator;

  readonly newFileBtn: Locator;

  readonly newFolderBtn: Locator;

  readonly collapseAllBtn: Locator;

  constructor(page: Page) {
    super(page);
    this.container = this.getByTestId('file-tree');
    this.refreshBtn = this.getByTestId('file-tree-refresh-btn');
    this.newFileBtn = this.getByTestId('file-tree-new-file-btn');
    this.newFolderBtn = this.getByTestId('file-tree-new-folder-btn');
    this.collapseAllBtn = this.getByTestId('file-tree-collapse-all-btn');
  }

  // ==================== Actions ====================

  /**
   * Expand a folder by its path
   */
  async expandFolder(folderPath: string): Promise<void> {
    const folder = this.page.locator(
      `[data-testid="file-tree-folder"][data-path="${folderPath}"]`,
    );
    const isExpanded = await folder.getAttribute('data-expanded');

    if (isExpanded !== 'true') {
      await folder.click();
    }
  }

  /**
   * Collapse a folder by its path
   */
  async collapseFolder(folderPath: string): Promise<void> {
    const folder = this.page.locator(
      `[data-testid="file-tree-folder"][data-path="${folderPath}"]`,
    );
    const isExpanded = await folder.getAttribute('data-expanded');

    if (isExpanded === 'true') {
      await folder.click();
    }
  }

  /**
   * Select a file by its path (single click)
   */
  async selectFile(filePath: string): Promise<void> {
    const file = this.page.locator(
      `[data-testid="file-tree-file"][data-path="${filePath}"]`,
    );
    await file.click();
  }

  /**
   * Open a file by its path (double click)
   */
  async openFile(filePath: string): Promise<void> {
    const file = this.page.locator(
      `[data-testid="file-tree-file"][data-path="${filePath}"]`,
    );
    await file.dblclick();
  }

  /**
   * Right-click on a file to open context menu
   */
  async rightClickFile(filePath: string): Promise<void> {
    const file = this.page.locator(
      `[data-testid="file-tree-file"][data-path="${filePath}"]`,
    );
    await file.click({ button: 'right' });
  }

  /**
   * Right-click on a folder to open context menu
   */
  async rightClickFolder(folderPath: string): Promise<void> {
    const folder = this.page.locator(
      `[data-testid="file-tree-folder"][data-path="${folderPath}"]`,
    );
    await folder.click({ button: 'right' });
  }

  /**
   * Create a new file using the new file button
   */
  async createNewFile(fileName: string): Promise<void> {
    await this.newFileBtn.click();
    const nameInput = this.getByTestId('file-tree-name-input');
    await nameInput.fill(fileName);
    await this.page.keyboard.press('Enter');
  }

  /**
   * Create a new folder using the new folder button
   */
  async createNewFolder(folderName: string): Promise<void> {
    await this.newFolderBtn.click();
    const nameInput = this.getByTestId('file-tree-name-input');
    await nameInput.fill(folderName);
    await this.page.keyboard.press('Enter');
  }

  /**
   * Refresh the file tree
   */
  async refresh(): Promise<void> {
    await this.refreshBtn.click();
  }

  /**
   * Collapse all expanded folders
   */
  async collapseAll(): Promise<void> {
    await this.collapseAllBtn.click();
  }

  /**
   * Rename a file or folder (assumes context menu is open)
   */
  async rename(newName: string): Promise<void> {
    const renameOption = this.getByTestId('context-menu-rename');
    await renameOption.click();
    const nameInput = this.getByTestId('file-tree-name-input');
    await nameInput.fill(newName);
    await this.page.keyboard.press('Enter');
  }

  /**
   * Delete a file or folder (assumes context menu is open)
   */
  async deleteItem(): Promise<void> {
    const deleteOption = this.getByTestId('context-menu-delete');
    await deleteOption.click();
    // Confirm deletion if dialog appears
    const confirmBtn = this.getByTestId('confirm-delete-btn');
    if (await confirmBtn.isVisible({ timeout: 1000 }).catch(() => false)) {
      await confirmBtn.click();
    }
  }

  // ==================== Getters ====================

  /**
   * Get all visible file paths
   */
  async getVisibleFiles(): Promise<string[]> {
    const files = this.page.locator('[data-testid="file-tree-file"]');
    const paths: string[] = [];
    const count = await files.count();

    // eslint-disable-next-line no-plusplus
    for (let i = 0; i < count; i++) {
      // eslint-disable-next-line no-await-in-loop
      const path = await files.nth(i).getAttribute('data-path');
      if (path) paths.push(path);
    }

    return paths;
  }

  /**
   * Get all visible folder paths
   */
  async getVisibleFolders(): Promise<string[]> {
    const folders = this.page.locator('[data-testid="file-tree-folder"]');
    const paths: string[] = [];
    const count = await folders.count();

    // eslint-disable-next-line no-plusplus
    for (let i = 0; i < count; i++) {
      // eslint-disable-next-line no-await-in-loop
      const path = await folders.nth(i).getAttribute('data-path');
      if (path) paths.push(path);
    }

    return paths;
  }

  // ==================== Assertions ====================

  /**
   * Expect the file tree to be visible
   */
  async expectToBeVisible(): Promise<void> {
    await expect(this.container).toBeVisible();
  }

  /**
   * Expect a file to exist at the given path
   */
  async expectFileToExist(filePath: string): Promise<void> {
    const file = this.page.locator(
      `[data-testid="file-tree-file"][data-path="${filePath}"]`,
    );
    await expect(file).toBeVisible();
  }

  /**
   * Expect a folder to exist at the given path
   */
  async expectFolderToExist(folderPath: string): Promise<void> {
    const folder = this.page.locator(
      `[data-testid="file-tree-folder"][data-path="${folderPath}"]`,
    );
    await expect(folder).toBeVisible();
  }

  /**
   * Expect a file to NOT exist at the given path
   */
  async expectFileNotToExist(filePath: string): Promise<void> {
    const file = this.page.locator(
      `[data-testid="file-tree-file"][data-path="${filePath}"]`,
    );
    await expect(file).toBeHidden();
  }

  /**
   * Check if the component is currently visible
   */
  async isVisible(): Promise<boolean> {
    return this.container.isVisible({ timeout: 2000 }).catch(() => false);
  }
}
