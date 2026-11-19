/**
 * Side Panel Picker Tests
 *
 * The picker in the side panel header of the dbt project, SQL Editor and
 * Notebooks screens: picking an item, the All row, the Add row and the empty
 * list. DataLake and Object Explorer pickers are covered in their own specs.
 *
 * The seeded fixture always starts with one project and one connection, so
 * the "two projects", "no projects" and "no connections" cases edit the
 * seeded database.json before the app starts.
 */

import * as fs from 'fs';
import * as path from 'path';
import { Page } from '@playwright/test';
import {
  test as seededTest,
  expect,
} from '../../fixtures/electron-seeded.fixture';
import { openHome, openProject } from '../../helpers/window.helper';
import { AppHelper } from '../../helpers/app.helper';
import { NavigationSidebarComponent } from '../../page-objects/components/NavigationSidebar';

const PROJECT = 'test_project';
const SECOND_PROJECT = 'second_project';
const CONNECTION = 'test_db';

// Changes the seeded database.json before the app is launched
const editSeededDatabase = (
  userData: string,
  edit: (database: Record<string, any>) => void,
): void => {
  const databasePath = path.join(userData, 'database.json');
  const database = JSON.parse(fs.readFileSync(databasePath, 'utf-8'));
  edit(database);
  fs.writeFileSync(databasePath, JSON.stringify(database, null, 2));
};

const testWithTwoProjects = seededTest.extend({
  userData: async ({ userData }, use) => {
    const projectPath = path.join(userData, 'projects', SECOND_PROJECT);
    fs.mkdirSync(path.join(projectPath, 'rosetta'), { recursive: true });
    editSeededDatabase(userData, (database) => {
      database.projects.push({
        id: 'second-project-id',
        name: SECOND_PROJECT,
        path: projectPath,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
    });
    await use(userData);
  },
});

const testWithNoProjects = seededTest.extend({
  userData: async ({ userData }, use) => {
    editSeededDatabase(userData, (database) => {
      database.projects = [];
      delete database.selectedProject;
    });
    await use(userData);
  },
});

const testWithNoConnections = seededTest.extend({
  userData: async ({ userData }, use) => {
    editSeededDatabase(userData, (database) => {
      database.connections = [];
      // Keep the project from pointing at a connection that is gone
      delete database.projects[0].connectionId;
      delete database.selectedProject.connectionId;
    });
    await use(userData);
  },
});

// All and Add rows are menu items; the picked-from items are radio items
const menuRows = (window: Page) =>
  window.getByRole('menu').locator('[role="menuitem"], [role="menuitemradio"]');

const expectNewConnectionPage = async (window: Page) => {
  await expect(window.getByText('Create New Connection')).toBeVisible();
  await expect.poll(() => window.url()).toContain('/app/add-connection');
};

seededTest.describe('dbt project picker', () => {
  testWithTwoProjects(
    'should switch to a project picked from the list',
    async ({ electronApp }) => {
      const window = await openProject(electronApp, PROJECT);
      const picker = window.getByTestId('project-select');
      await expect(picker).toContainText(PROJECT);

      await picker.click();
      await expect(menuRows(window)).toHaveText([
        // Project rows also hold the project type icon, so match the name at
        // the end of the row
        'All Projects',
        new RegExp(`${PROJECT}$`),
        new RegExp(`${SECOND_PROJECT}$`),
        'Add project',
      ]);

      await menuRows(window).filter({ hasText: SECOND_PROJECT }).click();

      await expect(picker).toContainText(SECOND_PROJECT);
      await expect(picker).not.toContainText(PROJECT);
    },
  );

  seededTest(
    'should open the new project form from Add project',
    async ({ electronApp }) => {
      const window = await openProject(electronApp, PROJECT);

      await window.getByTestId('project-select').click();
      await window.getByRole('menuitem', { name: 'Add project' }).click();

      await expect(
        window.locator('[data-testid="project-selection"]'),
      ).toBeVisible();
      await expect(window.getByLabel('Project Name')).toBeVisible();
    },
  );

  testWithNoProjects(
    'should not let the dbt project screen open without a project',
    async ({ electronApp }) => {
      const window = await openHome(electronApp);
      await new AppHelper(electronApp, window).dismissQuickStartTourIfPresent();

      // The dbt project screen is the only place with a project picker, and
      // its nav item is disabled until a project exists, so the picker can
      // never show an empty list.
      await expect(window.getByTestId('nav-item-files')).toHaveCSS(
        'pointer-events',
        'none',
      );
      await expect(window.getByTestId('project-select')).toHaveCount(0);
    },
  );
});

seededTest.describe('SQL Editor connection picker', () => {
  seededTest(
    'should open the new connection page from Add connection',
    async ({ electronApp }) => {
      const window = await openProject(electronApp, PROJECT);
      await new NavigationSidebarComponent(window).goToSqlEditor();

      await window.getByTestId('sql-connection-select').click();
      await expect(menuRows(window).last()).toHaveText('Add connection');
      await menuRows(window).last().click();

      await expectNewConnectionPage(window);
    },
  );

  testWithNoConnections(
    'should offer only Add connection when there are no connections',
    async ({ electronApp }) => {
      const window = await openProject(electronApp, PROJECT);
      await new NavigationSidebarComponent(window).goToSqlEditor();

      await window.getByTestId('sql-connection-select').click();
      await expect(menuRows(window)).toHaveText(['Add connection']);
      await menuRows(window).first().click();

      await expectNewConnectionPage(window);
    },
  );
});

seededTest.describe('Notebooks connection picker', () => {
  seededTest(
    'should list connections and open the full list from All Connections',
    async ({ electronApp }) => {
      const window = await openProject(electronApp, PROJECT);
      await new NavigationSidebarComponent(window).goToNotebooks();

      await window.getByTestId('notebooks-connection-select').click();
      const rows = menuRows(window);
      await expect(rows.first()).toHaveText('All Connections');
      await expect(rows.filter({ hasText: CONNECTION })).toHaveCount(1);
      await expect(rows.last()).toHaveText('Add connection');

      await rows.first().click();
      await expect(
        window.getByRole('heading', { name: 'Connections', exact: true }),
      ).toBeVisible();
    },
  );

  seededTest(
    'should open the new connection page from Add connection',
    async ({ electronApp }) => {
      const window = await openProject(electronApp, PROJECT);
      await new NavigationSidebarComponent(window).goToNotebooks();

      await window.getByTestId('notebooks-connection-select').click();
      await menuRows(window).last().click();

      await expectNewConnectionPage(window);
    },
  );

  testWithNoConnections(
    'should offer only Add connection when there are no connections',
    async ({ electronApp }) => {
      const window = await openProject(electronApp, PROJECT);
      await new NavigationSidebarComponent(window).goToNotebooks();

      await window.getByTestId('notebooks-connection-select').click();
      await expect(menuRows(window)).toHaveText(['Add connection']);
      await menuRows(window).first().click();

      await expectNewConnectionPage(window);
    },
  );
});
