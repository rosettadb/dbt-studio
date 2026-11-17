/**
 * Analytics pages as Markdown files in `<project>/analytics/` (plan 95d):
 * route ↔ path mapping, titles from frontmatter, create / update / list, and
 * paths that must stay inside the folder.
 */

import fs from 'fs-extra';
import os from 'os';
import path from 'path';

jest.mock('electron', () => ({
  shell: { trashItem: jest.fn(async (p: string) => fs.remove(p)) },
}));

// eslint-disable-next-line import/first
import {
  createProjectPage,
  deleteProjectPage,
  getProjectPage,
  listProjectPages,
  titleFromMarkdown,
  updateProjectPage,
} from '../../../../src/main/utils/projectAnalyticsPages';
// eslint-disable-next-line import/first
import {
  pagePathFromRoute,
  parseProjectPageId,
  projectPageId,
  queryFileStem,
  routeFromPagePath,
} from '../../../../src/shared/projectFolders';

const PROJECT_ID = '1731000000000';
const CONNECTION_ID = 'conn-1';

describe('project folder helpers', () => {
  it('maps file paths to routes the way Evidence does', () => {
    expect(routeFromPagePath('index.md')).toBe('/');
    expect(routeFromPagePath('sales/monthly.md')).toBe('/sales/monthly');
    expect(routeFromPagePath('sales/index.md')).toBe('/sales');
    expect(pagePathFromRoute('/')).toBe('index.md');
    expect(pagePathFromRoute('/sales/monthly')).toBe('sales/monthly.md');
    expect(() => pagePathFromRoute('/../secrets')).toThrow();
  });

  it('round-trips project page ids', () => {
    const id = projectPageId(PROJECT_ID, 'sales/monthly.md');
    expect(parseProjectPageId(id)).toEqual({
      projectId: PROJECT_ID,
      relativePath: 'sales/monthly.md',
    });
    expect(parseProjectPageId('8f2c-studio-page')).toBeNull();
  });

  it('names query files after the query', () => {
    expect(queryFileStem('Top customers (2026)')).toBe('top_customers_2026');
    expect(queryFileStem('***')).toBe('query');
  });

  it('reads the title from frontmatter, else the file name', () => {
    expect(titleFromMarkdown('---\ntitle: "Sales"\n---\nhi', 'x')).toBe(
      'Sales',
    );
    expect(titleFromMarkdown('# no frontmatter', 'monthly')).toBe('monthly');
  });
});

describe('project analytics page files', () => {
  let projectPath: string;

  beforeEach(async () => {
    projectPath = await fs.mkdtemp(path.join(os.tmpdir(), 'rosetta-pages-'));
  });

  afterEach(async () => {
    await fs.remove(projectPath);
  });

  it('creates a page at its route and lists it', async () => {
    const page = await createProjectPage(
      PROJECT_ID,
      projectPath,
      CONNECTION_ID,
      '/sales/monthly',
      '---\ntitle: "Monthly sales"\n---\n\nBody',
    );

    expect(page.routePath).toBe('/sales/monthly');
    expect(page.title).toBe('Monthly sales');
    expect(
      await fs.pathExists(
        path.join(projectPath, 'analytics', 'sales', 'monthly.md'),
      ),
    ).toBe(true);

    const pages = await listProjectPages(
      PROJECT_ID,
      projectPath,
      CONNECTION_ID,
    );
    expect(pages.map((p) => p.id)).toEqual([page.id]);
  });

  it('adds a suffix instead of overwriting a taken route', async () => {
    await createProjectPage(
      PROJECT_ID,
      projectPath,
      CONNECTION_ID,
      '/a',
      'one',
    );
    const second = await createProjectPage(
      PROJECT_ID,
      projectPath,
      CONNECTION_ID,
      '/a',
      'two',
    );
    expect(second.routePath).toBe('/a-2');
    expect(
      await fs.readFile(path.join(projectPath, 'analytics', 'a.md'), 'utf8'),
    ).toBe('one');
  });

  it('saves markdown and keeps the id and route', async () => {
    const page = await createProjectPage(
      PROJECT_ID,
      projectPath,
      CONNECTION_ID,
      '/report',
      'old',
    );
    const updated = await updateProjectPage(
      page.id,
      projectPath,
      CONNECTION_ID,
      '---\ntitle: New\n---\nnew',
    );
    expect(updated.id).toBe(page.id);
    expect(updated.title).toBe('New');
    expect(
      (await getProjectPage(page.id, projectPath, CONNECTION_ID))
        .markdownContent,
    ).toContain('new');
  });

  it('refuses ids that point outside the analytics folder', async () => {
    await fs.writeFile(path.join(projectPath, 'secret.md'), 'x');
    const escaping = projectPageId(PROJECT_ID, '../secret.md');
    await expect(
      getProjectPage(escaping, projectPath, CONNECTION_ID),
    ).rejects.toThrow('outside');
    await expect(deleteProjectPage(escaping, projectPath)).rejects.toThrow(
      'outside',
    );
    expect(await fs.pathExists(path.join(projectPath, 'secret.md'))).toBe(true);
  });
});
