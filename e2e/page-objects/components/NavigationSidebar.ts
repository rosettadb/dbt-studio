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
  | 'notebooks'
  | 'cloud-explorer'
  | 'data-lake'
  | 'flows'
  | 'connections'
  | 'settings';

export const NAV_ITEMS: NavItem[] = [
  'files',
  'sql',
  'notebooks',
  'cloud-explorer',
  'data-lake',
  'flows',
  'connections',
  'settings',
];

export class NavigationSidebarComponent extends BasePage {
  // Container
  readonly container: Locator;

  // Navigation items
  readonly filesNavItem: Locator;

  readonly sqlNavItem: Locator;

  readonly notebooksNavItem: Locator;

  readonly cloudExplorerNavItem: Locator;

  readonly dataLakeNavItem: Locator;

  readonly flowsNavItem: Locator;

  readonly connectionsNavItem: Locator;

  readonly settingsNavItem: Locator;

  constructor(page: Page) {
    super(page);
    this.container = this.getByTestId('sidebar');
    this.filesNavItem = this.getByTestId('nav-item-files');
    this.sqlNavItem = this.getByTestId('nav-item-sql');
    this.notebooksNavItem = this.getByTestId('nav-item-notebooks');
    this.cloudExplorerNavItem = this.getByTestId('nav-item-cloud-explorer');
    this.dataLakeNavItem = this.getByTestId('nav-item-data-lake');
    this.flowsNavItem = this.getByTestId('nav-item-flows');
    this.connectionsNavItem = this.getByTestId('nav-item-connections');
    this.settingsNavItem = this.getByTestId('nav-item-settings');
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
   * Navigate to the SQL Editor
   */
  async goToSqlEditor(): Promise<void> {
    await this.sqlNavItem.click();
  }

  /**
   * Navigate to Notebooks
   */
  async goToNotebooks(): Promise<void> {
    await this.notebooksNavItem.click();
  }

  /**
   * Navigate to Connections
   */
  async goToConnections(): Promise<void> {
    await this.connectionsNavItem.click();
  }

  /**
   * Navigate to Cloud Explorer
   */
  async goToCloudExplorer(): Promise<void> {
    await this.cloudExplorerNavItem.click();
  }

  /**
   * Navigate to Data Lake
   */
  async goToDataLake(): Promise<void> {
    await this.dataLakeNavItem.click();
  }

  /**
   * Navigate to Flows
   */
  async goToFlows(): Promise<void> {
    await this.flowsNavItem.click();
  }

  /**
   * Navigate to Settings
   */
  async goToSettings(): Promise<void> {
    await this.settingsNavItem.click();
  }

  // ==================== Getters ====================

  /**
   * Get the currently active navigation items.
   *
   * Nav items are react-router NavLinks, which receive the `active` class
   * when their route matches. The Files item points at `/app` and matches
   * every `/app/*` route, so it is usually active alongside the current one.
   */
  async getActiveItems(): Promise<NavItem[]> {
    const active: NavItem[] = [];
    // eslint-disable-next-line no-restricted-syntax
    for (const item of NAV_ITEMS) {
      const navItem = this.getByTestId(`nav-item-${item}`);
      // eslint-disable-next-line no-await-in-loop
      const className = (await navItem.getAttribute('class')) || '';
      if (className.split(/\s+/).includes('active')) {
        active.push(item);
      }
    }
    return active;
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
    await expect(navItem).toHaveClass(/(^|\s)active(\s|$)/);
  }

  /**
   * Expect a specific navigation item to NOT be active
   */
  async expectNotActiveItem(item: NavItem): Promise<void> {
    const navItem = this.getByTestId(`nav-item-${item}`);
    await expect(navItem).not.toHaveClass(/(^|\s)active(\s|$)/);
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
