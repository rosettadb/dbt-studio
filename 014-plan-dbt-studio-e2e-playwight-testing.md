# DBT Studio End-to-End Testing Plan with Playwright

**Document Type:** Implementation Plan  
**Status:** Draft  
**Created:** 2026-01-15  
**Last Updated:** 2026-01-15

---

## Executive Summary

This document outlines a comprehensive, phased approach to implementing end-to-end (E2E) testing for the DBT Studio Electron application using Playwright. The plan draws from best practices established by similar Electron applications (Joplin, Beekeeper Studio, Mockoon) and follows the general principles of Electron E2E testing architecture.

---

## Table of Contents

1. [Phase 1: Foundation & Infrastructure Setup](#phase-1-foundation--infrastructure-setup)
2. [Phase 2: Core Page Objects & Test Utilities](#phase-2-core-page-objects--test-utilities)
3. [Phase 3: Critical User Flow Tests](#phase-3-critical-user-flow-tests)
4. [Phase 4: Feature-Specific Test Suites](#phase-4-feature-specific-test-suites)
5. [Phase 5: CI/CD Integration](#phase-5-cicd-integration)
6. [Phase 6: Advanced Testing & Optimization](#phase-6-advanced-testing--optimization)

---

## Phase 1: Foundation & Infrastructure Setup

### 1.1 Install and Configure Playwright

**Objective:** Set up Playwright with Electron support in the dbt-studio project.

#### 1.1.1 Install Dependencies

```bash
npm install -D @playwright/test playwright
```

#### 1.1.2 Create Playwright Configuration

**File:** `playwright.config.ts` (root level)

```typescript
import { PlaywrightTestConfig } from '@playwright/test';

const config: PlaywrightTestConfig = {
  testDir: './e2e',
  timeout: 60000,
  expect: {
    timeout: 30000,
  },
  fullyParallel: false, // Electron tests must run serially
  workers: 1,
  retries: process.env.CI ? 2 : 0,
  reporter: [
    ['list'],
    ['html', { outputFolder: 'test-results/html' }],
    ['json', { outputFile: 'test-results/results.json' }],
  ],
  use: {
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'on-first-retry',
  },
  outputDir: 'test-results/artifacts',
};

export default config;
```

#### 1.1.3 Create Directory Structure

```
dbt-studio/
├── e2e/
│   ├── fixtures/              # Test fixtures and setup helpers
│   │   ├── electron.fixture.ts
│   │   ├── test-data/         # Sample projects, configs, etc.
│   │   └── index.ts
│   ├── page-objects/          # Page Object Model classes
│   │   ├── components/        # Reusable component POMs
│   │   ├── screens/           # Screen-level POMs
│   │   └── index.ts
│   ├── helpers/               # Utility functions
│   │   ├── app.helper.ts
│   │   ├── ipc.helper.ts
│   │   └── wait.helper.ts
│   ├── tests/                 # Actual test specifications
│   │   ├── setup/             # Setup/onboarding tests
│   │   ├── projects/          # Project management tests
│   │   ├── connections/       # Database connection tests
│   │   ├── sql-editor/        # SQL editor tests
│   │   ├── cloud-explorer/    # Cloud explorer tests
│   │   ├── data-lake/         # DataLake feature tests
│   │   ├── ai-chat/           # AI chat tests
│   │   └── settings/          # Settings tests
│   └── global-setup.ts        # Global setup for all tests
├── playwright.config.ts
└── package.json (updated with e2e scripts)
```

### 1.2 Create Electron Launch Fixture

**Objective:** Create a reusable fixture that launches the Electron app with proper isolation.

#### 1.2.1 Electron Fixture

**File:** `e2e/fixtures/electron.fixture.ts`

```typescript
import { _electron as electron } from 'playwright';
import { test as base, ElectronApplication, Page } from '@playwright/test';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';

export type TestFixtures = {
  electronApp: ElectronApplication;
  mainWindow: Page;
  userData: string;
};

export const test = base.extend<TestFixtures>({
  userData: async ({}, use) => {
    // Create isolated userData directory for each test
    const userDataDir = path.join(
      os.tmpdir(),
      `dbt-studio-test-${Date.now()}`
    );
    fs.mkdirSync(userDataDir, { recursive: true });
    await use(userDataDir);
    // Cleanup after test
    fs.rmSync(userDataDir, { recursive: true, force: true });
  },

  electronApp: async ({ userData }, use) => {
    const electronApp = await electron.launch({
      args: [
        path.join(__dirname, '../../.erb/dll/main.bundle.dev.js'),
        '--user-data-dir=' + userData,
        '--disable-gpu',
        '--no-sandbox',
      ],
      env: {
        ...process.env,
        NODE_ENV: 'test',
        E2E_TESTING: 'true',
        USER_DATA_DIR: userData,
      },
    });
    
    await use(electronApp);
    await electronApp.close();
  },

  mainWindow: async ({ electronApp }, use) => {
    const window = await electronApp.firstWindow();
    await window.waitForLoadState('domcontentloaded');
    await use(window);
  },
});

export { expect } from '@playwright/test';
```

### 1.3 Add Test-Specific Attributes to Application

**Objective:** Ensure all testable UI elements have stable `data-testid` attributes.

#### 1.3.1 Identify Critical Elements Requiring Test IDs

| Screen/Component | Elements to Add `data-testid` |
|-----------------|------------------------------|
| Setup Wizard | Steps, navigation buttons, form inputs |
| Project Selection | Project cards, create button, import button |
| Project Details | Tab navigation, file tree, editor panels |
| Connection Forms | All input fields, test/save buttons |
| SQL Editor | Editor container, run button, results table |
| Cloud Explorer | Bucket list, file browser, preview panel |
| DataLake | Instance list, table explorer, import wizard |
| Settings | All sections, form inputs, save buttons |
| AI Chat | Message list, input field, send button |

#### 1.3.2 Create Test ID Convention

```typescript
// Convention: [screen]-[component]-[element]
// Examples:
// setup-wizard-next-btn
// project-details-file-tree
// sql-editor-run-query-btn
// connection-form-host-input
// cloud-explorer-bucket-list
```

### 1.4 Update Package.json Scripts

**File:** `package.json` (add to scripts section)

```json
{
  "scripts": {
    "test:e2e": "playwright test",
    "test:e2e:ui": "playwright test --ui",
    "test:e2e:debug": "playwright test --debug",
    "test:e2e:headed": "playwright test --headed",
    "test:e2e:ci": "xvfb-maybe playwright test",
    "test:e2e:report": "playwright show-report test-results/html"
  }
}
```

---

## Phase 2: Core Page Objects & Test Utilities

### 2.1 Base Page Object Class

**Objective:** Create a base class for all page objects with common functionality.

#### 2.1.1 Base Page Object

**File:** `e2e/page-objects/BasePage.ts`

```typescript
import { Page, Locator } from '@playwright/test';

export abstract class BasePage {
  protected readonly page: Page;

  constructor(page: Page) {
    this.page = page;
  }

  // Common wait helpers
  async waitForPageLoad(): Promise<void> {
    await this.page.waitForLoadState('networkidle');
  }

  async waitForElement(
    selector: string,
    options?: { timeout?: number }
  ): Promise<Locator> {
    const locator = this.page.locator(selector);
    await locator.waitFor({ state: 'visible', timeout: options?.timeout });
    return locator;
  }

  // Screenshot helper
  async takeScreenshot(name: string): Promise<void> {
    await this.page.screenshot({
      path: `test-results/screenshots/${name}.png`,
      fullPage: true,
    });
  }

  // Common locator helpers
  getByTestId(testId: string): Locator {
    return this.page.locator(`[data-testid="${testId}"]`);
  }
}
```

### 2.2 Screen-Level Page Objects

#### 2.2.1 Setup Wizard Page Object

**File:** `e2e/page-objects/screens/SetupWizard.ts`

```typescript
import { Page, Locator, expect } from '@playwright/test';
import { BasePage } from '../BasePage';

export class SetupWizardPage extends BasePage {
  // Locators
  readonly wizardContainer: Locator;
  readonly welcomeStep: Locator;
  readonly cliInstallStep: Locator;
  readonly pythonSetupStep: Locator;
  readonly completionStep: Locator;
  readonly nextButton: Locator;
  readonly backButton: Locator;
  readonly skipButton: Locator;

  constructor(page: Page) {
    super(page);
    this.wizardContainer = this.getByTestId('setup-wizard');
    this.welcomeStep = this.getByTestId('setup-step-welcome');
    this.cliInstallStep = this.getByTestId('setup-step-cli');
    this.pythonSetupStep = this.getByTestId('setup-step-python');
    this.completionStep = this.getByTestId('setup-step-complete');
    this.nextButton = this.getByTestId('setup-next-btn');
    this.backButton = this.getByTestId('setup-back-btn');
    this.skipButton = this.getByTestId('setup-skip-btn');
  }

  // Actions
  async clickNext(): Promise<void> {
    await this.nextButton.click();
  }

  async clickSkip(): Promise<void> {
    await this.skipButton.click();
  }

  async completeWizard(): Promise<void> {
    // Skip through all steps for tests that don't focus on setup
    while (await this.skipButton.isVisible()) {
      await this.skipButton.click();
      await this.page.waitForTimeout(500);
    }
    if (await this.nextButton.isVisible()) {
      await this.nextButton.click();
    }
  }

  // Assertions
  async expectToBeVisible(): Promise<void> {
    await expect(this.wizardContainer).toBeVisible();
  }

  async expectCurrentStep(step: 'welcome' | 'cli' | 'python' | 'complete'): Promise<void> {
    const stepMap = {
      welcome: this.welcomeStep,
      cli: this.cliInstallStep,
      python: this.pythonSetupStep,
      complete: this.completionStep,
    };
    await expect(stepMap[step]).toBeVisible();
  }
}
```

#### 2.2.2 Project Selection Page Object

**File:** `e2e/page-objects/screens/ProjectSelection.ts`

```typescript
import { Page, Locator, expect } from '@playwright/test';
import { BasePage } from '../BasePage';

export class ProjectSelectionPage extends BasePage {
  readonly container: Locator;
  readonly createProjectBtn: Locator;
  readonly importProjectBtn: Locator;
  readonly projectList: Locator;
  readonly searchInput: Locator;

  constructor(page: Page) {
    super(page);
    this.container = this.getByTestId('project-selection');
    this.createProjectBtn = this.getByTestId('create-project-btn');
    this.importProjectBtn = this.getByTestId('import-project-btn');
    this.projectList = this.getByTestId('project-list');
    this.searchInput = this.getByTestId('project-search-input');
  }

  async clickCreateProject(): Promise<void> {
    await this.createProjectBtn.click();
  }

  async clickImportProject(): Promise<void> {
    await this.importProjectBtn.click();
  }

  async selectProject(projectName: string): Promise<void> {
    const projectCard = this.page.locator(
      `[data-testid="project-card-${projectName}"]`
    );
    await projectCard.click();
  }

  async getProjectNames(): Promise<string[]> {
    const cards = this.page.locator('[data-testid^="project-card-"]');
    const names: string[] = [];
    const count = await cards.count();
    for (let i = 0; i < count; i++) {
      const name = await cards.nth(i).getAttribute('data-project-name');
      if (name) names.push(name);
    }
    return names;
  }

  async expectToBeVisible(): Promise<void> {
    await expect(this.container).toBeVisible();
  }

  async expectProjectToExist(projectName: string): Promise<void> {
    const projectCard = this.page.locator(
      `[data-testid="project-card-${projectName}"]`
    );
    await expect(projectCard).toBeVisible();
  }
}
```

#### 2.2.3 SQL Editor Page Object

**File:** `e2e/page-objects/screens/SqlEditor.ts`

```typescript
import { Page, Locator, expect } from '@playwright/test';
import { BasePage } from '../BasePage';

export class SqlEditorPage extends BasePage {
  readonly container: Locator;
  readonly editorPane: Locator;
  readonly monacoEditor: Locator;
  readonly runQueryBtn: Locator;
  readonly stopQueryBtn: Locator;
  readonly resultsPane: Locator;
  readonly resultsTable: Locator;
  readonly tabBar: Locator;
  readonly newTabBtn: Locator;
  readonly formatBtn: Locator;
  readonly exportBtn: Locator;

  constructor(page: Page) {
    super(page);
    this.container = this.getByTestId('sql-editor-screen');
    this.editorPane = this.getByTestId('sql-editor-pane');
    this.monacoEditor = this.page.locator('.monaco-editor');
    this.runQueryBtn = this.getByTestId('sql-run-query-btn');
    this.stopQueryBtn = this.getByTestId('sql-stop-query-btn');
    this.resultsPane = this.getByTestId('sql-results-pane');
    this.resultsTable = this.getByTestId('sql-results-table');
    this.tabBar = this.getByTestId('sql-tab-bar');
    this.newTabBtn = this.getByTestId('sql-new-tab-btn');
    this.formatBtn = this.getByTestId('sql-format-btn');
    this.exportBtn = this.getByTestId('sql-export-btn');
  }

  async typeQuery(query: string): Promise<void> {
    await this.monacoEditor.click();
    await this.page.keyboard.type(query);
  }

  async setQuery(query: string): Promise<void> {
    // Clear existing content and set new query
    await this.monacoEditor.click();
    await this.page.keyboard.press('Meta+A');
    await this.page.keyboard.type(query);
  }

  async runQuery(): Promise<void> {
    await this.runQueryBtn.click();
  }

  async runQueryWithKeyboard(): Promise<void> {
    await this.page.keyboard.press('Meta+Enter');
  }

  async createNewTab(): Promise<void> {
    await this.newTabBtn.click();
  }

  async selectTab(index: number): Promise<void> {
    const tab = this.tabBar.locator(`[data-testid="sql-tab-${index}"]`);
    await tab.click();
  }

  async getResultsRowCount(): Promise<number> {
    const rows = this.resultsTable.locator('tbody tr');
    return await rows.count();
  }

  async expectResultsToBeVisible(): Promise<void> {
    await expect(this.resultsPane).toBeVisible();
  }

  async expectRowCount(expectedCount: number): Promise<void> {
    const count = await this.getResultsRowCount();
    expect(count).toBe(expectedCount);
  }
}
```

#### 2.2.4 Connections Page Object

**File:** `e2e/page-objects/screens/Connections.ts`

```typescript
import { Page, Locator, expect } from '@playwright/test';
import { BasePage } from '../BasePage';

export type ConnectionType = 
  | 'postgresql' 
  | 'snowflake' 
  | 'bigquery' 
  | 'redshift' 
  | 'databricks' 
  | 'duckdb';

export class ConnectionsPage extends BasePage {
  readonly container: Locator;
  readonly addConnectionBtn: Locator;
  readonly connectionList: Locator;
  readonly connectionTypeSelector: Locator;

  constructor(page: Page) {
    super(page);
    this.container = this.getByTestId('connections-screen');
    this.addConnectionBtn = this.getByTestId('add-connection-btn');
    this.connectionList = this.getByTestId('connection-list');
    this.connectionTypeSelector = this.getByTestId('connection-type-selector');
  }

  async clickAddConnection(): Promise<void> {
    await this.addConnectionBtn.click();
  }

  async selectConnectionType(type: ConnectionType): Promise<void> {
    const typeBtn = this.page.locator(
      `[data-testid="connection-type-${type}"]`
    );
    await typeBtn.click();
  }

  async fillConnectionForm(config: Record<string, string>): Promise<void> {
    for (const [field, value] of Object.entries(config)) {
      const input = this.getByTestId(`connection-input-${field}`);
      await input.fill(value);
    }
  }

  async testConnection(): Promise<void> {
    const testBtn = this.getByTestId('connection-test-btn');
    await testBtn.click();
  }

  async saveConnection(): Promise<void> {
    const saveBtn = this.getByTestId('connection-save-btn');
    await saveBtn.click();
  }

  async expectConnectionSuccess(): Promise<void> {
    const successIndicator = this.getByTestId('connection-test-success');
    await expect(successIndicator).toBeVisible();
  }

  async expectConnectionInList(name: string): Promise<void> {
    const connection = this.page.locator(
      `[data-testid="connection-item-${name}"]`
    );
    await expect(connection).toBeVisible();
  }
}
```

### 2.3 Component-Level Page Objects

#### 2.3.1 File Tree Component

**File:** `e2e/page-objects/components/FileTree.ts`

```typescript
import { Page, Locator, expect } from '@playwright/test';
import { BasePage } from '../BasePage';

export class FileTreeComponent extends BasePage {
  readonly container: Locator;
  readonly refreshBtn: Locator;
  readonly newFileBtn: Locator;
  readonly newFolderBtn: Locator;

  constructor(page: Page) {
    super(page);
    this.container = this.getByTestId('file-tree');
    this.refreshBtn = this.getByTestId('file-tree-refresh-btn');
    this.newFileBtn = this.getByTestId('file-tree-new-file-btn');
    this.newFolderBtn = this.getByTestId('file-tree-new-folder-btn');
  }

  async expandFolder(folderPath: string): Promise<void> {
    const folder = this.page.locator(
      `[data-testid="file-tree-folder"][data-path="${folderPath}"]`
    );
    await folder.click();
  }

  async selectFile(filePath: string): Promise<void> {
    const file = this.page.locator(
      `[data-testid="file-tree-file"][data-path="${filePath}"]`
    );
    await file.click();
  }

  async rightClickFile(filePath: string): Promise<void> {
    const file = this.page.locator(
      `[data-testid="file-tree-file"][data-path="${filePath}"]`
    );
    await file.click({ button: 'right' });
  }

  async createNewFile(fileName: string): Promise<void> {
    await this.newFileBtn.click();
    const nameInput = this.getByTestId('file-tree-name-input');
    await nameInput.fill(fileName);
    await this.page.keyboard.press('Enter');
  }

  async expectFileToExist(filePath: string): Promise<void> {
    const file = this.page.locator(
      `[data-testid="file-tree-file"][data-path="${filePath}"]`
    );
    await expect(file).toBeVisible();
  }
}
```

#### 2.3.2 Navigation Sidebar Component

**File:** `e2e/page-objects/components/NavigationSidebar.ts`

```typescript
import { Page, Locator, expect } from '@playwright/test';
import { BasePage } from '../BasePage';

export type NavItem = 
  | 'files' 
  | 'sql' 
  | 'connections' 
  | 'cloud-explorer' 
  | 'data-lake' 
  | 'chat' 
  | 'settings';

export class NavigationSidebarComponent extends BasePage {
  readonly container: Locator;

  constructor(page: Page) {
    super(page);
    this.container = this.getByTestId('navigation-sidebar');
  }

  async navigateTo(item: NavItem): Promise<void> {
    const navItem = this.getByTestId(`nav-item-${item}`);
    await navItem.click();
  }

  async expectActiveItem(item: NavItem): Promise<void> {
    const navItem = this.getByTestId(`nav-item-${item}`);
    await expect(navItem).toHaveAttribute('data-active', 'true');
  }
}
```

### 2.4 Test Helper Utilities

#### 2.4.1 Application Helper

**File:** `e2e/helpers/app.helper.ts`

```typescript
import { ElectronApplication, Page } from '@playwright/test';

export class AppHelper {
  constructor(
    private electronApp: ElectronApplication,
    private mainWindow: Page
  ) {}

  /**
   * Get all open windows
   */
  async getAllWindows(): Promise<Page[]> {
    return this.electronApp.windows();
  }

  /**
   * Wait for a new window to open
   */
  async waitForNewWindow(timeout = 10000): Promise<Page> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error('Timeout waiting for new window'));
      }, timeout);

      this.electronApp.on('window', (page) => {
        clearTimeout(timer);
        resolve(page);
      });
    });
  }

  /**
   * Check if app is in first-run mode
   */
  async isFirstRun(): Promise<boolean> {
    const setupWizard = this.mainWindow.locator('[data-testid="setup-wizard"]');
    return await setupWizard.isVisible().catch(() => false);
  }

  /**
   * Skip setup wizard if present
   */
  async skipSetupIfPresent(): Promise<void> {
    const skipBtn = this.mainWindow.locator('[data-testid="setup-skip-all-btn"]');
    if (await skipBtn.isVisible().catch(() => false)) {
      await skipBtn.click();
    }
  }

  /**
   * Reset app to initial state via IPC
   */
  async resetAppState(): Promise<void> {
    await this.electronApp.evaluate(async ({ app }) => {
      // This would call factory reset logic
      return true;
    });
  }
}
```

#### 2.4.2 Wait Helper

**File:** `e2e/helpers/wait.helper.ts`

```typescript
import { Page } from '@playwright/test';

export class WaitHelper {
  constructor(private page: Page) {}

  /**
   * Wait for loading spinner to disappear
   */
  async waitForLoading(): Promise<void> {
    const spinner = this.page.locator('[data-testid="loading-spinner"]');
    await spinner.waitFor({ state: 'hidden' });
  }

  /**
   * Wait for toast notification
   */
  async waitForToast(type: 'success' | 'error' | 'info'): Promise<void> {
    const toast = this.page.locator(`.Toastify__toast--${type}`);
    await toast.waitFor({ state: 'visible' });
  }

  /**
   * Wait for modal to open
   */
  async waitForModal(): Promise<void> {
    const modal = this.page.locator('[role="dialog"]');
    await modal.waitFor({ state: 'visible' });
  }

  /**
   * Wait for modal to close
   */
  async waitForModalClose(): Promise<void> {
    const modal = this.page.locator('[role="dialog"]');
    await modal.waitFor({ state: 'hidden' });
  }

  /**
   * Wait for network to be idle
   */
  async waitForNetworkIdle(timeout = 5000): Promise<void> {
    await this.page.waitForLoadState('networkidle', { timeout });
  }
}
```

---

## Phase 3: Critical User Flow Tests

### 3.1 First-Run & Setup Tests

**File:** `e2e/tests/setup/first-run.spec.ts`

```typescript
import { test, expect } from '../../fixtures/electron.fixture';
import { SetupWizardPage } from '../../page-objects/screens/SetupWizard';
import { ProjectSelectionPage } from '../../page-objects/screens/ProjectSelection';

test.describe('First Run Experience', () => {
  test('should show setup wizard on first launch', async ({ mainWindow }) => {
    const setupWizard = new SetupWizardPage(mainWindow);
    await setupWizard.expectToBeVisible();
    await setupWizard.expectCurrentStep('welcome');
  });

  test('should navigate through wizard steps', async ({ mainWindow }) => {
    const setupWizard = new SetupWizardPage(mainWindow);
    
    // Welcome step
    await setupWizard.expectCurrentStep('welcome');
    await setupWizard.clickNext();
    
    // CLI installation step
    await setupWizard.expectCurrentStep('cli');
    await setupWizard.clickSkip();
    
    // Python setup step
    await setupWizard.expectCurrentStep('python');
    await setupWizard.clickSkip();
    
    // Completion step
    await setupWizard.expectCurrentStep('complete');
  });

  test('should complete wizard and show project selection', async ({ mainWindow }) => {
    const setupWizard = new SetupWizardPage(mainWindow);
    const projectSelection = new ProjectSelectionPage(mainWindow);
    
    await setupWizard.completeWizard();
    await projectSelection.expectToBeVisible();
  });
});
```

### 3.2 Project Management Tests

**File:** `e2e/tests/projects/project-lifecycle.spec.ts`

```typescript
import { test, expect } from '../../fixtures/electron.fixture';
import { ProjectSelectionPage } from '../../page-objects/screens/ProjectSelection';
import { SetupWizardPage } from '../../page-objects/screens/SetupWizard';
import { AppHelper } from '../../helpers/app.helper';

test.describe('Project Lifecycle', () => {
  test.beforeEach(async ({ mainWindow, electronApp }) => {
    const appHelper = new AppHelper(electronApp, mainWindow);
    await appHelper.skipSetupIfPresent();
  });

  test('should create a new project', async ({ mainWindow }) => {
    const projectSelection = new ProjectSelectionPage(mainWindow);
    
    await projectSelection.clickCreateProject();
    
    // Fill project creation form
    const nameInput = mainWindow.locator('[data-testid="project-name-input"]');
    await nameInput.fill('Test Project');
    
    const createBtn = mainWindow.locator('[data-testid="project-create-confirm-btn"]');
    await createBtn.click();
    
    // Verify project was created
    await projectSelection.expectProjectToExist('Test Project');
  });

  test('should open existing project', async ({ mainWindow }) => {
    const projectSelection = new ProjectSelectionPage(mainWindow);
    
    // Assuming a project exists
    await projectSelection.selectProject('Test Project');
    
    // Verify project details screen is shown
    const projectDetails = mainWindow.locator('[data-testid="project-details-screen"]');
    await expect(projectDetails).toBeVisible();
  });

  test('should delete a project', async ({ mainWindow }) => {
    const projectSelection = new ProjectSelectionPage(mainWindow);
    
    // Right-click to get context menu
    const projectCard = mainWindow.locator('[data-testid="project-card-Test Project"]');
    await projectCard.click({ button: 'right' });
    
    // Click delete option
    const deleteOption = mainWindow.locator('[data-testid="context-menu-delete"]');
    await deleteOption.click();
    
    // Confirm deletion
    const confirmBtn = mainWindow.locator('[data-testid="confirm-delete-btn"]');
    await confirmBtn.click();
    
    // Verify project is removed
    await expect(projectCard).not.toBeVisible();
  });
});
```

### 3.3 SQL Editor Tests

**File:** `e2e/tests/sql-editor/basic-queries.spec.ts`

```typescript
import { test, expect } from '../../fixtures/electron.fixture';
import { SqlEditorPage } from '../../page-objects/screens/SqlEditor';
import { NavigationSidebarComponent } from '../../page-objects/components/NavigationSidebar';
import { AppHelper } from '../../helpers/app.helper';

test.describe('SQL Editor', () => {
  test.beforeEach(async ({ mainWindow, electronApp }) => {
    const appHelper = new AppHelper(electronApp, mainWindow);
    await appHelper.skipSetupIfPresent();
    
    // Navigate to SQL editor
    const nav = new NavigationSidebarComponent(mainWindow);
    await nav.navigateTo('sql');
  });

  test('should execute a simple query', async ({ mainWindow }) => {
    const sqlEditor = new SqlEditorPage(mainWindow);
    
    await sqlEditor.setQuery('SELECT 1 + 1 as result');
    await sqlEditor.runQuery();
    
    await sqlEditor.expectResultsToBeVisible();
  });

  test('should execute query with keyboard shortcut', async ({ mainWindow }) => {
    const sqlEditor = new SqlEditorPage(mainWindow);
    
    await sqlEditor.setQuery('SELECT 42 as answer');
    await sqlEditor.runQueryWithKeyboard();
    
    await sqlEditor.expectResultsToBeVisible();
  });

  test('should support multiple tabs', async ({ mainWindow }) => {
    const sqlEditor = new SqlEditorPage(mainWindow);
    
    // Create first query in first tab
    await sqlEditor.setQuery('SELECT 1 as tab1');
    
    // Create new tab
    await sqlEditor.createNewTab();
    await sqlEditor.setQuery('SELECT 2 as tab2');
    
    // Switch back to first tab
    await sqlEditor.selectTab(0);
    
    // Verify first tab content preserved
    const editorContent = await mainWindow.locator('.monaco-editor').textContent();
    expect(editorContent).toContain('tab1');
  });

  test('should show error for invalid query', async ({ mainWindow }) => {
    const sqlEditor = new SqlEditorPage(mainWindow);
    
    await sqlEditor.setQuery('INVALID SQL SYNTAX');
    await sqlEditor.runQuery();
    
    // Verify error is shown
    const errorMessage = mainWindow.locator('[data-testid="sql-error-message"]');
    await expect(errorMessage).toBeVisible();
  });
});
```

### 3.4 Connection Management Tests

**File:** `e2e/tests/connections/connection-crud.spec.ts`

```typescript
import { test, expect } from '../../fixtures/electron.fixture';
import { ConnectionsPage } from '../../page-objects/screens/Connections';
import { NavigationSidebarComponent } from '../../page-objects/components/NavigationSidebar';
import { AppHelper } from '../../helpers/app.helper';

test.describe('Connection Management', () => {
  test.beforeEach(async ({ mainWindow, electronApp }) => {
    const appHelper = new AppHelper(electronApp, mainWindow);
    await appHelper.skipSetupIfPresent();
    
    const nav = new NavigationSidebarComponent(mainWindow);
    await nav.navigateTo('connections');
  });

  test('should display connection type options', async ({ mainWindow }) => {
    const connections = new ConnectionsPage(mainWindow);
    
    await connections.clickAddConnection();
    
    // Verify all connection types are available
    for (const type of ['postgresql', 'snowflake', 'bigquery', 'duckdb']) {
      const typeOption = mainWindow.locator(`[data-testid="connection-type-${type}"]`);
      await expect(typeOption).toBeVisible();
    }
  });

  test('should create a DuckDB connection', async ({ mainWindow }) => {
    const connections = new ConnectionsPage(mainWindow);
    
    await connections.clickAddConnection();
    await connections.selectConnectionType('duckdb');
    
    await connections.fillConnectionForm({
      name: 'Test DuckDB',
      path: ':memory:',
    });
    
    await connections.saveConnection();
    await connections.expectConnectionInList('Test DuckDB');
  });

  test('should test connection successfully', async ({ mainWindow }) => {
    const connections = new ConnectionsPage(mainWindow);
    
    await connections.clickAddConnection();
    await connections.selectConnectionType('duckdb');
    
    await connections.fillConnectionForm({
      name: 'Test Connection',
      path: ':memory:',
    });
    
    await connections.testConnection();
    await connections.expectConnectionSuccess();
  });

  test('should edit existing connection', async ({ mainWindow }) => {
    const connections = new ConnectionsPage(mainWindow);
    
    // Click edit on existing connection
    const editBtn = mainWindow.locator('[data-testid="connection-edit-Test DuckDB"]');
    await editBtn.click();
    
    // Modify name
    const nameInput = mainWindow.locator('[data-testid="connection-input-name"]');
    await nameInput.clear();
    await nameInput.fill('Renamed DuckDB');
    
    // Save
    await connections.saveConnection();
    
    // Verify new name
    await connections.expectConnectionInList('Renamed DuckDB');
  });
});
```

---

## Phase 4: Feature-Specific Test Suites

### 4.1 Cloud Explorer Tests

**File:** `e2e/tests/cloud-explorer/cloud-navigation.spec.ts`

```typescript
import { test, expect } from '../../fixtures/electron.fixture';
import { NavigationSidebarComponent } from '../../page-objects/components/NavigationSidebar';

test.describe('Cloud Explorer', () => {
  test.beforeEach(async ({ mainWindow, electronApp }) => {
    // Skip setup and navigate to cloud explorer
    const nav = new NavigationSidebarComponent(mainWindow);
    await nav.navigateTo('cloud-explorer');
  });

  test('should display cloud provider options', async ({ mainWindow }) => {
    const providers = mainWindow.locator('[data-testid="cloud-provider-list"]');
    await expect(providers).toBeVisible();
    
    // Check for AWS, Azure, GCS options
    await expect(mainWindow.locator('[data-testid="cloud-provider-aws"]')).toBeVisible();
    await expect(mainWindow.locator('[data-testid="cloud-provider-azure"]')).toBeVisible();
    await expect(mainWindow.locator('[data-testid="cloud-provider-gcs"]')).toBeVisible();
  });

  test('should show configuration form for AWS', async ({ mainWindow }) => {
    const awsOption = mainWindow.locator('[data-testid="cloud-provider-aws"]');
    await awsOption.click();
    
    // Verify form fields
    await expect(mainWindow.locator('[data-testid="aws-access-key-input"]')).toBeVisible();
    await expect(mainWindow.locator('[data-testid="aws-secret-key-input"]')).toBeVisible();
    await expect(mainWindow.locator('[data-testid="aws-region-input"]')).toBeVisible();
  });
});
```

### 4.2 DataLake Tests

**File:** `e2e/tests/data-lake/datalake-management.spec.ts`

```typescript
import { test, expect } from '../../fixtures/electron.fixture';
import { NavigationSidebarComponent } from '../../page-objects/components/NavigationSidebar';

test.describe('DataLake Management', () => {
  test.beforeEach(async ({ mainWindow }) => {
    const nav = new NavigationSidebarComponent(mainWindow);
    await nav.navigateTo('data-lake');
  });

  test('should display DataLake type selection', async ({ mainWindow }) => {
    const createBtn = mainWindow.locator('[data-testid="create-datalake-btn"]');
    await createBtn.click();
    
    // Verify type options
    await expect(mainWindow.locator('[data-testid="datalake-type-ducklake"]')).toBeVisible();
  });

  test('should create a new DuckLake instance', async ({ mainWindow }) => {
    const createBtn = mainWindow.locator('[data-testid="create-datalake-btn"]');
    await createBtn.click();
    
    // Select DuckLake type
    const duckLakeOption = mainWindow.locator('[data-testid="datalake-type-ducklake"]');
    await duckLakeOption.click();
    
    // Fill configuration
    const nameInput = mainWindow.locator('[data-testid="datalake-name-input"]');
    await nameInput.fill('Test Lake');
    
    const confirmBtn = mainWindow.locator('[data-testid="datalake-create-confirm"]');
    await confirmBtn.click();
    
    // Verify instance appears in list
    const instance = mainWindow.locator('[data-testid="datalake-instance-Test Lake"]');
    await expect(instance).toBeVisible();
  });

  test('should explore DataLake tables', async ({ mainWindow }) => {
    // Select existing instance
    const instance = mainWindow.locator('[data-testid="datalake-instance-Test Lake"]');
    await instance.click();
    
    // Verify table explorer is shown
    const tableExplorer = mainWindow.locator('[data-testid="datalake-table-explorer"]');
    await expect(tableExplorer).toBeVisible();
  });
});
```

### 4.3 AI Chat Tests

**File:** `e2e/tests/ai-chat/chat-interaction.spec.ts`

```typescript
import { test, expect } from '../../fixtures/electron.fixture';
import { NavigationSidebarComponent } from '../../page-objects/components/NavigationSidebar';

test.describe('AI Chat', () => {
  test.beforeEach(async ({ mainWindow }) => {
    const nav = new NavigationSidebarComponent(mainWindow);
    await nav.navigateTo('chat');
  });

  test('should display chat interface', async ({ mainWindow }) => {
    const chatContainer = mainWindow.locator('[data-testid="ai-chat-container"]');
    await expect(chatContainer).toBeVisible();
    
    const messageInput = mainWindow.locator('[data-testid="chat-message-input"]');
    await expect(messageInput).toBeVisible();
    
    const sendBtn = mainWindow.locator('[data-testid="chat-send-btn"]');
    await expect(sendBtn).toBeVisible();
  });

  test('should display AI provider selector', async ({ mainWindow }) => {
    const providerSelector = mainWindow.locator('[data-testid="ai-provider-selector"]');
    await expect(providerSelector).toBeVisible();
  });

  test('should create new conversation', async ({ mainWindow }) => {
    const newChatBtn = mainWindow.locator('[data-testid="new-conversation-btn"]');
    await newChatBtn.click();
    
    // Verify new conversation is created
    const conversationList = mainWindow.locator('[data-testid="conversation-list"]');
    const conversations = conversationList.locator('[data-testid^="conversation-item-"]');
    await expect(conversations).toHaveCount(1);
  });

  test('should send a message', async ({ mainWindow }) => {
    const messageInput = mainWindow.locator('[data-testid="chat-message-input"]');
    await messageInput.fill('Hello, can you help me with dbt?');
    
    const sendBtn = mainWindow.locator('[data-testid="chat-send-btn"]');
    await sendBtn.click();
    
    // Verify message appears in chat
    const userMessage = mainWindow.locator('[data-testid="chat-message-user"]').last();
    await expect(userMessage).toContainText('Hello, can you help me with dbt?');
  });
});
```

### 4.4 Settings Tests

**File:** `e2e/tests/settings/settings-management.spec.ts`

```typescript
import { test, expect } from '../../fixtures/electron.fixture';
import { NavigationSidebarComponent } from '../../page-objects/components/NavigationSidebar';

test.describe('Settings', () => {
  test.beforeEach(async ({ mainWindow }) => {
    const nav = new NavigationSidebarComponent(mainWindow);
    await nav.navigateTo('settings');
  });

  test('should display all settings sections', async ({ mainWindow }) => {
    const sections = [
      'general',
      'appearance',
      'cli',
      'ai-providers',
      'database',
    ];
    
    for (const section of sections) {
      const sectionElement = mainWindow.locator(`[data-testid="settings-section-${section}"]`);
      await expect(sectionElement).toBeVisible();
    }
  });

  test('should navigate to CLI settings', async ({ mainWindow }) => {
    const cliSection = mainWindow.locator('[data-testid="settings-section-cli"]');
    await cliSection.click();
    
    // Verify CLI settings content
    const cliPathInput = mainWindow.locator('[data-testid="settings-cli-path-input"]');
    await expect(cliPathInput).toBeVisible();
  });

  test('should configure AI provider', async ({ mainWindow }) => {
    const aiSection = mainWindow.locator('[data-testid="settings-section-ai-providers"]');
    await aiSection.click();
    
    const addProviderBtn = mainWindow.locator('[data-testid="settings-add-ai-provider-btn"]');
    await addProviderBtn.click();
    
    // Fill provider form
    const nameInput = mainWindow.locator('[data-testid="ai-provider-name-input"]');
    await nameInput.fill('Test OpenAI');
    
    const typeSelect = mainWindow.locator('[data-testid="ai-provider-type-select"]');
    await typeSelect.selectOption('openai');
    
    const apiKeyInput = mainWindow.locator('[data-testid="ai-provider-api-key-input"]');
    await apiKeyInput.fill('test-api-key');
    
    const saveBtn = mainWindow.locator('[data-testid="ai-provider-save-btn"]');
    await saveBtn.click();
    
    // Verify provider appears in list
    const provider = mainWindow.locator('[data-testid="ai-provider-item-Test OpenAI"]');
    await expect(provider).toBeVisible();
  });

  test('should perform factory reset', async ({ mainWindow }) => {
    const dangerSection = mainWindow.locator('[data-testid="settings-section-danger"]');
    await dangerSection.click();
    
    const resetBtn = mainWindow.locator('[data-testid="settings-factory-reset-btn"]');
    await resetBtn.click();
    
    // Confirm reset
    const confirmInput = mainWindow.locator('[data-testid="factory-reset-confirm-input"]');
    await confirmInput.fill('RESET');
    
    const confirmBtn = mainWindow.locator('[data-testid="factory-reset-confirm-btn"]');
    await confirmBtn.click();
    
    // App should restart - test completes when app closes
  });
});
```

### 4.5 File Editor Tests

**File:** `e2e/tests/editor/file-editing.spec.ts`

```typescript
import { test, expect } from '../../fixtures/electron.fixture';
import { FileTreeComponent } from '../../page-objects/components/FileTree';
import { NavigationSidebarComponent } from '../../page-objects/components/NavigationSidebar';

test.describe('File Editor', () => {
  test.beforeEach(async ({ mainWindow }) => {
    // Assume project is already loaded
    const nav = new NavigationSidebarComponent(mainWindow);
    await nav.navigateTo('files');
  });

  test('should display file tree', async ({ mainWindow }) => {
    const fileTree = new FileTreeComponent(mainWindow);
    await expect(fileTree.container).toBeVisible();
  });

  test('should expand models folder', async ({ mainWindow }) => {
    const fileTree = new FileTreeComponent(mainWindow);
    await fileTree.expandFolder('models');
    
    // Verify folder contents are visible
    const modelsContents = mainWindow.locator('[data-testid="file-tree-folder"][data-path="models"] + div');
    await expect(modelsContents).toBeVisible();
  });

  test('should open file in editor', async ({ mainWindow }) => {
    const fileTree = new FileTreeComponent(mainWindow);
    await fileTree.expandFolder('models');
    await fileTree.selectFile('models/example.sql');
    
    // Verify editor opens with file content
    const editorTab = mainWindow.locator('[data-testid="editor-tab-example.sql"]');
    await expect(editorTab).toBeVisible();
  });

  test('should create new file', async ({ mainWindow }) => {
    const fileTree = new FileTreeComponent(mainWindow);
    await fileTree.createNewFile('new_model.sql');
    
    await fileTree.expectFileToExist('new_model.sql');
  });

  test('should save file changes', async ({ mainWindow }) => {
    const fileTree = new FileTreeComponent(mainWindow);
    await fileTree.selectFile('models/example.sql');
    
    // Type in editor
    const editor = mainWindow.locator('.monaco-editor');
    await editor.click();
    await mainWindow.keyboard.type('-- New comment\n');
    
    // Save with keyboard shortcut
    await mainWindow.keyboard.press('Meta+S');
    
    // Verify save indicator
    const saveIndicator = mainWindow.locator('[data-testid="file-save-indicator"]');
    await expect(saveIndicator).toHaveAttribute('data-saved', 'true');
  });
});
```

---

## Phase 5: CI/CD Integration

### 5.1 GitHub Actions Workflow

**File:** `.github/workflows/e2e-tests.yml`

```yaml
name: E2E Tests

on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main, develop]

jobs:
  e2e-tests:
    strategy:
      fail-fast: false
      matrix:
        os: [ubuntu-latest, macos-latest, windows-latest]
    
    runs-on: ${{ matrix.os }}
    
    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'

      - name: Install dependencies
        run: npm ci

      - name: Build application
        run: npm run build

      - name: Install Playwright browsers
        run: npx playwright install --with-deps chromium

      # Linux-specific display setup
      - name: Setup display (Linux)
        if: runner.os == 'Linux'
        run: |
          sudo apt-get update
          sudo apt-get install -y xvfb
          Xvfb :99 -screen 0 1920x1080x24 &
          echo "DISPLAY=:99" >> $GITHUB_ENV

      - name: Run E2E tests
        run: npm run test:e2e:ci
        env:
          CI: true
          DISPLAY: ${{ env.DISPLAY }}

      - name: Upload test results
        uses: actions/upload-artifact@v4
        if: always()
        with:
          name: playwright-report-${{ matrix.os }}
          path: |
            test-results/
            playwright-report/
          retention-days: 30

      - name: Upload screenshots
        uses: actions/upload-artifact@v4
        if: failure()
        with:
          name: failure-screenshots-${{ matrix.os }}
          path: test-results/artifacts/
          retention-days: 7
```

### 5.2 CI Configuration for Playwright

**File:** `playwright.ci.config.ts`

```typescript
import { PlaywrightTestConfig } from '@playwright/test';
import baseConfig from './playwright.config';

const ciConfig: PlaywrightTestConfig = {
  ...baseConfig,
  
  // CI-specific overrides
  workers: 1,
  retries: 2,
  timeout: 120000, // 2 minute timeout for CI
  
  reporter: [
    ['github'],
    ['html', { outputFolder: 'playwright-report' }],
    ['json', { outputFile: 'test-results/results.json' }],
  ],
  
  use: {
    ...baseConfig.use,
    trace: 'on',
    screenshot: 'on',
    video: 'on',
  },
};

export default ciConfig;
```

### 5.3 Pre-commit Hook for E2E Tests

**File:** `.husky/pre-push`

```bash
#!/bin/sh
. "$(dirname "$0")/_/husky.sh"

# Run E2E smoke tests before push
npm run test:e2e -- --grep "@smoke"
```

---

## Phase 6: Advanced Testing & Optimization

### 6.1 Test Tagging System

**Objective:** Implement test tags for selective test execution.

```typescript
// e2e/tests/smoke/smoke.spec.ts
import { test, expect } from '../../fixtures/electron.fixture';

// Use tags for test categorization
test('app launches successfully @smoke @critical', async ({ mainWindow }) => {
  await expect(mainWindow).toBeDefined();
});

test('can navigate between screens @smoke', async ({ mainWindow }) => {
  // Navigation test
});
```

**Usage:**
```bash
# Run only smoke tests
npm run test:e2e -- --grep "@smoke"

# Run critical tests
npm run test:e2e -- --grep "@critical"

# Exclude slow tests
npm run test:e2e -- --grep-invert "@slow"
```

### 6.2 Visual Regression Testing

**Objective:** Add visual regression tests for critical screens.

**File:** `e2e/tests/visual/screenshots.spec.ts`

```typescript
import { test, expect } from '../../fixtures/electron.fixture';

test.describe('Visual Regression @visual', () => {
  test('project selection screen matches snapshot', async ({ mainWindow }) => {
    await expect(mainWindow).toHaveScreenshot('project-selection.png', {
      maxDiffPixels: 100,
    });
  });

  test('sql editor screen matches snapshot', async ({ mainWindow }) => {
    // Navigate to SQL editor
    await mainWindow.locator('[data-testid="nav-item-sql"]').click();
    
    await expect(mainWindow).toHaveScreenshot('sql-editor.png', {
      maxDiffPixels: 100,
    });
  });
});
```

### 6.3 Performance Testing

**Objective:** Add basic performance assertions for critical operations.

**File:** `e2e/tests/performance/load-times.spec.ts`

```typescript
import { test, expect } from '../../fixtures/electron.fixture';

test.describe('Performance @performance', () => {
  test('app launches within acceptable time', async ({ electronApp }) => {
    const startTime = Date.now();
    const window = await electronApp.firstWindow();
    await window.waitForLoadState('domcontentloaded');
    const loadTime = Date.now() - startTime;
    
    expect(loadTime).toBeLessThan(10000); // 10 seconds max
  });

  test('query execution completes within timeout', async ({ mainWindow }) => {
    const startTime = Date.now();
    
    // Navigate to SQL editor and run query
    await mainWindow.locator('[data-testid="nav-item-sql"]').click();
    await mainWindow.locator('.monaco-editor').click();
    await mainWindow.keyboard.type('SELECT 1');
    await mainWindow.locator('[data-testid="sql-run-query-btn"]').click();
    
    // Wait for results
    await mainWindow.locator('[data-testid="sql-results-table"]').waitFor();
    
    const queryTime = Date.now() - startTime;
    expect(queryTime).toBeLessThan(5000); // 5 seconds max for simple query
  });
});
```

### 6.4 Mock External Dependencies

**Objective:** Create mock servers for external services (AI providers, cloud services).

**File:** `e2e/mocks/ai-provider.mock.ts`

```typescript
import { createServer } from 'http';

export class MockAIProvider {
  private server: ReturnType<typeof createServer>;
  private port: number;

  constructor(port = 3333) {
    this.port = port;
  }

  async start(): Promise<void> {
    return new Promise((resolve) => {
      this.server = createServer((req, res) => {
        res.setHeader('Content-Type', 'application/json');
        
        if (req.url?.includes('/chat/completions')) {
          res.end(JSON.stringify({
            choices: [{
              message: {
                content: 'This is a mock AI response for testing.'
              }
            }]
          }));
        } else {
          res.statusCode = 404;
          res.end('Not found');
        }
      });

      this.server.listen(this.port, () => {
        console.log(`Mock AI server running on port ${this.port}`);
        resolve();
      });
    });
  }

  async stop(): Promise<void> {
    return new Promise((resolve) => {
      this.server.close(() => resolve());
    });
  }
}
```

### 6.5 Test Data Factories

**Objective:** Create factories for generating test data.

**File:** `e2e/fixtures/test-data/factories.ts`

```typescript
import * as path from 'path';
import * as fs from 'fs';

export class TestDataFactory {
  /**
   * Create a minimal dbt project for testing
   */
  static createMinimalProject(baseDir: string, name: string): string {
    const projectDir = path.join(baseDir, name);
    fs.mkdirSync(projectDir, { recursive: true });

    // Create dbt_project.yml
    const projectYml = `
name: '${name}'
version: '1.0.0'
config-version: 2

profile: 'default'

model-paths: ["models"]
analysis-paths: ["analyses"]
test-paths: ["tests"]
seed-paths: ["seeds"]
macro-paths: ["macros"]
snapshot-paths: ["snapshots"]
`;
    fs.writeFileSync(path.join(projectDir, 'dbt_project.yml'), projectYml);

    // Create models directory
    fs.mkdirSync(path.join(projectDir, 'models'), { recursive: true });

    // Create example model
    fs.writeFileSync(
      path.join(projectDir, 'models', 'example.sql'),
      'SELECT 1 as id'
    );

    return projectDir;
  }

  /**
   * Create mock database configuration
   */
  static createDuckDBConfig() {
    return {
      type: 'duckdb',
      name: 'test-duckdb',
      path: ':memory:',
    };
  }

  /**
   * Create mock connection for testing
   */
  static createMockConnection(type: string, overrides = {}) {
    const defaults = {
      postgresql: {
        host: 'localhost',
        port: 5432,
        database: 'test',
        user: 'test',
        password: 'test',
      },
      snowflake: {
        account: 'test',
        warehouse: 'test',
        database: 'test',
        schema: 'public',
        user: 'test',
        password: 'test',
      },
    };

    return {
      ...defaults[type as keyof typeof defaults],
      ...overrides,
    };
  }
}
```

---

## Implementation Timeline

| Phase | Duration | Priority | Dependencies |
|-------|----------|----------|--------------|
| Phase 1: Foundation | 2 weeks | P0 | None |
| Phase 2: Page Objects | 2 weeks | P0 | Phase 1 |
| Phase 3: Critical Flows | 3 weeks | P0 | Phase 2 |
| Phase 4: Feature Tests | 4 weeks | P1 | Phase 3 |
| Phase 5: CI/CD | 1 week | P0 | Phase 3 |
| Phase 6: Advanced | 2 weeks | P2 | Phase 4 |

**Total Estimated Duration:** 14 weeks

---

## Success Criteria

### Phase Completion Criteria

1. **Phase 1 Complete When:**
   - Playwright is installed and configured
   - Electron fixture successfully launches app
   - Test directory structure is in place
   - At least one passing test exists

2. **Phase 2 Complete When:**
   - All major screens have Page Objects
   - Component POMs exist for reusable elements
   - Helper utilities provide common functionality

3. **Phase 3 Complete When:**
   - First-run experience is fully tested
   - Project CRUD operations are tested
   - Basic SQL editor functionality is tested
   - Connection management is tested

4. **Phase 4 Complete When:**
   - All major features have test suites
   - Test coverage for critical paths > 80%
   - No flaky tests in the suite

5. **Phase 5 Complete When:**
   - GitHub Actions workflow passes on all platforms
   - Test artifacts are properly uploaded
   - CI runs complete in < 15 minutes

6. **Phase 6 Complete When:**
   - Test tagging is implemented
   - Visual regression tests exist for critical screens
   - Performance benchmarks are established

---

## Test ID Naming Convention

To ensure consistent and maintainable test IDs throughout the application:

```
Format: [screen/component]-[element-type]-[descriptor]

Examples:
- setup-wizard-next-btn
- project-list-item-{name}
- sql-editor-run-btn
- connection-form-host-input
- nav-sidebar-item-{screen}
- file-tree-folder-{path}
- modal-confirm-btn
- toast-success-message
```

---

## Risk Mitigation

| Risk | Mitigation Strategy |
|------|---------------------|
| Flaky tests | Implement proper waits, isolate test data, run serially |
| Slow CI runs | Parallelize where possible, use test tagging for selective runs |
| Platform differences | Test on all platforms in CI, abstract platform-specific behavior |
| External dependencies | Mock AI providers and cloud services |
| App state pollution | Isolated userData per test, clean teardown |

---

## References

- [Playwright Electron Documentation](https://playwright.dev/docs/api/class-electron)
- [Joplin E2E Testing Approach](./joplin-e2e-testing.md)
- [Beekeeper Studio E2E Testing](./beekeper-studio-end-to-end-testing.md)
- [Mockoon E2E Testing](./mocon-end-to-end-testing.md)
- [General Electron E2E Testing Guide](./gnereral-electron-e2e-testing-guides.txt)
