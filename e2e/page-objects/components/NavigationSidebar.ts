/**
 * Navigation Sidebar Component
 *
 * Page object for the main navigation sidebar that allows users
 * to switch between different screens/features of the application.
 */

import { Page, Locator, expect } from '@playwright/test';
import { BasePage } from '../BasePage';

export type NavItem =
  | 'files'
  | 'sql'
  | 'connections'
  | 'cloud-explorer'
  | 'data-lake'
  | 'chat'
  | 'settings'
  | 'lineage';

export class NavigationSidebarComponent extends BasePage {
  // Container
  readonly container: Locator;

  // Navigation items
  readonly filesNavItem: Locator;

  readonly sqlNavItem: Locator;

  readonly connectionsNavItem: Locator;

  readonly cloudExplorerNavItem: Locator;

  readonly dataLakeNavItem: Locator;

  readonly chatNavItem: Locator;

  readonly settingsNavItem: Locator;

  readonly lineageNavItem: Locator;

  constructor(page: Page) {
    super(page);
    this.container = this.getByTestId('navigation-sidebar');
    this.filesNavItem = this.getByTestId('nav-item-files');
    this.sqlNavItem = this.getByTestId('nav-item-sql');
    this.connectionsNavItem = this.getByTestId('nav-item-connections');
    this.cloudExplorerNavItem = this.getByTestId('nav-item-cloud-explorer');
    this.dataLakeNavItem = this.getByTestId('nav-item-data-lake');
    this.chatNavItem = this.getByTestId('nav-item-chat');
    this.settingsNavItem = this.getByTestId('nav-item-settings');
    this.lineageNavItem = this.getByTestId('nav-item-lineage');
  }

  // ==================== Actions ====================

  /**
   * Navigate to a specific section using the navigation item
   */
  async navigateTo(item: NavItem): Promise<void> {
    const navItem = this.getByTestId(`nav-item-${item}`);
    await navItem.click();
  }

  /**
   * Navigate to the Files section
   */
  async goToFiles(): Promise<void> {
    await this.filesNavItem.click();
  }

  /**
   * Navigate to the SQL Editor section
   */
  async goToSqlEditor(): Promise<void> {
    await this.sqlNavItem.click();
  }

  /**
   * Navigate to the Connections section
   */
  async goToConnections(): Promise<void> {
    await this.connectionsNavItem.click();
  }

  /**
   * Navigate to the Cloud Explorer section
   */
  async goToCloudExplorer(): Promise<void> {
    await this.cloudExplorerNavItem.click();
  }

  /**
   * Navigate to the DataLake section
   */
  async goToDataLake(): Promise<void> {
    await this.dataLakeNavItem.click();
  }

  /**
   * Navigate to the AI Chat section
   */
  async goToChat(): Promise<void> {
    await this.chatNavItem.click();
  }

  /**
   * Navigate to the Settings section
   */
  async goToSettings(): Promise<void> {
    await this.settingsNavItem.click();
  }

  /**
   * Navigate to the Lineage section
   */
  async goToLineage(): Promise<void> {
    await this.lineageNavItem.click();
  }

  // ==================== Getters ====================

  /**
   * Get the currently active navigation item
   */
  async getActiveItem(): Promise<NavItem | null> {
    const items: NavItem[] = [
      'files',
      'sql',
      'connections',
      'cloud-explorer',
      'data-lake',
      'chat',
      'settings',
      'lineage',
    ];

    // eslint-disable-next-line no-restricted-syntax
    for (const item of items) {
      const navItem = this.getByTestId(`nav-item-${item}`);
      // eslint-disable-next-line no-await-in-loop
      const isActive = await navItem.getAttribute('data-active');
      if (isActive === 'true') {
        return item;
      }
    }

    return null;
  }

  // ==================== Assertions ====================

  /**
   * Expect the sidebar to be visible
   */
  async expectToBeVisible(): Promise<void> {
    await expect(this.container).toBeVisible();
  }

  /**
   * Expect a specific navigation item to be active
   */
  async expectActiveItem(item: NavItem): Promise<void> {
    const navItem = this.getByTestId(`nav-item-${item}`);
    await expect(navItem).toHaveAttribute('data-active', 'true');
  }

  /**
   * Expect a specific navigation item to NOT be active
   */
  async expectNotActiveItem(item: NavItem): Promise<void> {
    const navItem = this.getByTestId(`nav-item-${item}`);
    const isActive = await navItem.getAttribute('data-active');
    expect(isActive).not.toBe('true');
  }

  /**
   * Expect a navigation item to be visible
   */
  async expectNavItemVisible(item: NavItem): Promise<void> {
    const navItem = this.getByTestId(`nav-item-${item}`);
    await expect(navItem).toBeVisible();
  }

  /**
   * Expect a navigation item to be hidden
   */
  async expectNavItemHidden(item: NavItem): Promise<void> {
    const navItem = this.getByTestId(`nav-item-${item}`);
    await expect(navItem).toBeHidden();
  }

  /**
   * Check if the component is currently visible
   */
  async isVisible(): Promise<boolean> {
    return this.container.isVisible({ timeout: 2000 }).catch(() => false);
  }
}
