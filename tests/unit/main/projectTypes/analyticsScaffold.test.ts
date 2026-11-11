/**
 * Analytics projects (plan 95): the scaffold writes only the chosen template
 * items plus the marker file, and never a dbt file; connection changes write
 * nothing.
 */

import fs from 'fs-extra';
import os from 'os';
import path from 'path';

jest.mock('../../../../src/main/services/connectors.service', () => ({
  __esModule: true,
  default: { getConnectionById: jest.fn(), loadConfigurations: jest.fn() },
}));
jest.mock('../../../../src/main/services/pythonNotebooks.service', () => ({
  __esModule: true,
  default: { createNotebookInProject: jest.fn(async () => ({})) },
}));
jest.mock('../../../../src/main/services/settings.service', () => ({
  RECOMMENDED_PYTHON_VERSION: '3.10.17',
}));

// eslint-disable-next-line import/first
import { analyticsProjectTypeMain } from '../../../../src/projectTypes/analytics/analytics.main';
// eslint-disable-next-line import/first
import { ANALYTICS_ITEMS } from '../../../../src/projectTypes/analytics/analytics.shared';
// eslint-disable-next-line import/first
import {
  defaultTemplateItems,
  getProjectType,
  projectTypeOf,
} from '../../../../src/projectTypes/registry.shared';

const listFiles = async (root: string, dir = ''): Promise<string[]> => {
  const entries = await fs.readdir(path.join(root, dir), {
    withFileTypes: true,
  });
  const nested = await Promise.all(
    entries.map((entry) => {
      const rel = dir ? `${dir}/${entry.name}` : entry.name;
      return entry.isDirectory() ? listFiles(root, rel) : [rel];
    }),
  );
  return nested.flat().sort();
};

describe('project types', () => {
  it('treats projects saved without a type as dbt', () => {
    expect(getProjectType({})).toBe('dbt');
    expect(getProjectType({ type: 'unknown' })).toBe('dbt');
    expect(getProjectType({ type: 'analytics' })).toBe('analytics');
  });

  it('lets analytics accept query-only connections that dbt rejects', () => {
    expect(
      projectTypeOf({ type: 'analytics' }).acceptsConnection('sqlite'),
    ).toBe(true);
    expect(projectTypeOf({}).acceptsConnection('sqlite')).toBe(false);
    expect(projectTypeOf({}).acceptsConnection('postgres')).toBe(true);
  });
});

describe('analytics scaffold', () => {
  let projectPath: string;

  beforeEach(async () => {
    projectPath = path.join(
      await fs.mkdtemp(path.join(os.tmpdir(), 'rosetta-analytics-')),
      'sales_analysis',
    );
  });

  afterEach(async () => {
    await fs.remove(path.dirname(projectPath));
  });

  it('writes the default items and the marker, and no dbt files', async () => {
    await analyticsProjectTypeMain.scaffold({
      projectPath,
      name: 'sales_analysis',
      include: defaultTemplateItems('analytics'),
      connection: { name: 'warehouse', type: 'postgres' },
    });

    const files = await listFiles(projectPath);
    // The starter notebook is written later by afterCreate
    expect(files).toEqual([
      '.gitignore',
      'README.md',
      'rosetta_project.yml',
      'sql/scratch.sql',
    ]);
    expect(await fs.pathExists(path.join(projectPath, 'notebooks'))).toBe(true);
    expect(
      await fs.readFile(path.join(projectPath, 'rosetta_project.yml'), 'utf8'),
    ).toContain('type: analytics');
    const readme = await fs.readFile(
      path.join(projectPath, 'README.md'),
      'utf8',
    );
    expect(readme).toContain('**warehouse** (postgres)');
  });

  it('creates only the marker when nothing is included', async () => {
    await analyticsProjectTypeMain.scaffold({
      projectPath,
      name: 'bare',
      include: [],
    });
    expect(await listFiles(projectPath)).toEqual(['rosetta_project.yml']);
  });

  it('keeps empty optional folders in Git with .gitkeep', async () => {
    await analyticsProjectTypeMain.scaffold({
      projectPath,
      name: 'with_data',
      include: [
        ANALYTICS_ITEMS.notebooks,
        ANALYTICS_ITEMS.data,
        ANALYTICS_ITEMS.pipelines,
      ],
    });
    expect(await listFiles(projectPath)).toEqual([
      'data/.gitkeep',
      'notebooks/.gitkeep',
      'rosetta/pipelines/.gitkeep',
      'rosetta_project.yml',
    ]);
  });

  it('writes nothing when the connection changes', async () => {
    await fs.mkdirp(projectPath);
    await analyticsProjectTypeMain.onConnectionChanged({
      id: '1',
      name: 'x',
      path: projectPath,
      createdAt: '',
      type: 'analytics',
      connectionId: 'c1',
    });
    expect(await listFiles(projectPath)).toEqual([]);
  });
});
