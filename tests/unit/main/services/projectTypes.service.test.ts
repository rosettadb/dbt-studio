/**
 * Project types (plan 95a): the shared definitions (defaults, accepted
 * connections), ProjectTypesService (what each scaffold writes, how clone
 * and import detect a folder's type) and the DuckLake instance ids Analytics
 * projects link to.
 */

import nodeFs from 'fs';
import fs from 'fs-extra';
import os from 'os';
import path from 'path';

const findDbtProjectRoot = jest.fn();
const copyDbtTemplateFiles = jest.fn();
const copyRosettaMainConf = jest.fn();
const createDbtTemplateFolderStructure = jest.fn();
const getConnectionById = jest.fn();
const getInstance = jest.fn();

jest.mock('../../../../src/main/services/projects.service', () => ({
  __esModule: true,
  default: {
    findDbtProjectRoot: (...args: unknown[]) => findDbtProjectRoot(...args),
    copyDbtTemplateFiles: (...args: unknown[]) => copyDbtTemplateFiles(...args),
    copyRosettaMainConf: (...args: unknown[]) => copyRosettaMainConf(...args),
    createDbtTemplateFolderStructure: (...args: unknown[]) =>
      createDbtTemplateFolderStructure(...args),
  },
}));
jest.mock('../../../../src/main/services/connectors.service', () => ({
  __esModule: true,
  default: {
    getConnectionById: (...args: unknown[]) => getConnectionById(...args),
    loadConfigurations: jest.fn(),
    parseProjectConnectionFiles: jest.fn(),
  },
}));
jest.mock('../../../../src/main/services/duckLake.service', () => ({
  __esModule: true,
  default: { getInstance: (...args: unknown[]) => getInstance(...args) },
}));

// eslint-disable-next-line import/first
import ProjectTypesService from '../../../../src/main/services/projectTypes.service';
// eslint-disable-next-line import/first
import {
  ANALYTICS_ITEMS,
  DBT_TEMPLATE_FOLDERS_ITEM,
  defaultTemplateItems,
  getProjectType,
  projectTypeOf,
} from '../../../../src/shared/projectTypes';
// eslint-disable-next-line import/first
import {
  duckLakeInstanceConnectionId,
  duckLakeInstanceIdOf,
} from '../../../../src/shared/duckLakeInstanceIds';

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

beforeEach(() => {
  jest.clearAllMocks();
});

describe('project type definitions', () => {
  it('treats projects saved without a type as dbt', () => {
    expect(getProjectType({})).toBe('dbt');
    expect(getProjectType({ type: 'unknown' })).toBe('dbt');
    expect(getProjectType({ type: 'analytics' })).toBe('analytics');
  });

  it('ignores names inherited from Object.prototype', () => {
    ['constructor', 'toString', '__proto__'].forEach((type) =>
      expect(getProjectType({ type })).toBe('dbt'),
    );
    expect(projectTypeOf({ type: 'constructor' }).id).toBe('dbt');
  });

  it('lets Analytics accept query-only connections that dbt rejects', () => {
    const analytics = projectTypeOf({ type: 'analytics' });
    const dbt = projectTypeOf({});
    ['sqlite', 'mysql', 'oracle', 'postgres'].forEach((type) =>
      expect(analytics.acceptsConnection(type)).toBe(true),
    );
    expect(dbt.acceptsConnection('sqlite')).toBe(false);
    expect(dbt.acceptsConnection('postgres')).toBe(true);
  });

  it('links DuckLake instances directly only for Analytics', () => {
    expect(
      projectTypeOf({ type: 'analytics' }).capabilities.datalakeAsInstance,
    ).toBe(true);
    expect(projectTypeOf({}).capabilities.datalakeAsInstance).toBe(false);
  });
});

describe('detectType (clone and import)', () => {
  it('is dbt, at the dbt_project.yml folder, when one is found', async () => {
    findDbtProjectRoot.mockResolvedValue('/repos/shop/transform');
    await expect(
      ProjectTypesService.detectType('/repos/shop'),
    ).resolves.toEqual({
      type: 'dbt',
      root: '/repos/shop/transform',
    });
    expect(findDbtProjectRoot).toHaveBeenCalledWith('/repos/shop');
  });

  it('is Analytics, at the folder itself, without dbt_project.yml', async () => {
    findDbtProjectRoot.mockResolvedValue(null);
    await expect(
      ProjectTypesService.detectType('/repos/notes'),
    ).resolves.toEqual({
      type: 'analytics',
      root: '/repos/notes',
    });
  });
});

describe('dbt scaffold', () => {
  it('runs the same helpers, in the same order, as before project types', async () => {
    await ProjectTypesService.scaffold('dbt', {
      projectPath: '/p/shop',
      name: 'shop',
      include: [DBT_TEMPLATE_FOLDERS_ITEM],
    });
    expect(copyDbtTemplateFiles).toHaveBeenCalledWith('/p/shop', 'shop');
    expect(copyRosettaMainConf).toHaveBeenCalledWith('/p/shop');
    expect(createDbtTemplateFolderStructure).toHaveBeenCalledWith('/p/shop');
    const order = [
      copyDbtTemplateFiles,
      copyRosettaMainConf,
      createDbtTemplateFolderStructure,
    ].map((fn) => fn.mock.invocationCallOrder[0]);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
  });

  it('skips the template folders when they are not included', async () => {
    await ProjectTypesService.scaffold('dbt', {
      projectPath: '/p/shop',
      name: 'shop',
      include: [],
    });
    expect(createDbtTemplateFolderStructure).not.toHaveBeenCalled();
  });
});

describe('Analytics scaffold', () => {
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

  it('writes the default items, no dbt files and no marker file', async () => {
    getConnectionById.mockResolvedValue({
      connection: { name: 'warehouse', type: 'postgres' },
    });
    await ProjectTypesService.scaffold('analytics', {
      projectPath,
      name: 'sales_analysis',
      include: defaultTemplateItems('analytics'),
      connectionId: 'c1',
    });

    expect(await listFiles(projectPath)).toEqual([
      '.gitignore',
      'README.md',
      'analytics/.gitkeep',
      'data/.gitkeep',
      'notebooks/.gitkeep',
      'queries/.gitkeep',
      'rosetta/pipelines/.gitkeep',
    ]);
    const readme = await fs.readFile(
      path.join(projectPath, 'README.md'),
      'utf8',
    );
    expect(readme).toContain('**warehouse** (postgres)');
    expect(readme).toContain('`queries/`');
  });

  it('names a linked DuckLake instance in the README', async () => {
    getInstance.mockResolvedValue({ id: 'i1', name: 'lake' });
    await ProjectTypesService.scaffold('analytics', {
      projectPath,
      name: 'lake_analysis',
      include: [ANALYTICS_ITEMS.readme],
      connectionId: duckLakeInstanceConnectionId('i1'),
    });
    expect(getInstance).toHaveBeenCalledWith('i1');
    expect(getConnectionById).not.toHaveBeenCalled();
    expect(
      await fs.readFile(path.join(projectPath, 'README.md'), 'utf8'),
    ).toContain('**lake** (DuckLake)');
  });

  it('refuses a folder that already has files and leaves them untouched', async () => {
    await fs.mkdirp(projectPath);
    await fs.writeFile(path.join(projectPath, 'README.md'), 'mine');

    await expect(
      ProjectTypesService.scaffold('analytics', {
        projectPath,
        name: 'sales_analysis',
        include: defaultTemplateItems('analytics'),
      }),
    ).rejects.toThrow("already exists and isn't empty");
    expect(await listFiles(projectPath)).toEqual(['README.md']);
    expect(await fs.readFile(path.join(projectPath, 'README.md'), 'utf8')).toBe(
      'mine',
    );
  });

  it('reports a destination it cannot read instead of treating it as empty', async () => {
    await fs.mkdirp(path.dirname(projectPath));
    await fs.writeFile(projectPath, 'a file, not a folder');

    await expect(
      ProjectTypesService.scaffold('analytics', {
        projectPath,
        name: 'sales_analysis',
        include: [ANALYTICS_ITEMS.readme],
      }),
    ).rejects.toMatchObject({ code: 'ENOTDIR' });
    expect(await fs.readFile(projectPath, 'utf8')).toBe('a file, not a folder');
  });

  it('refuses a second create for the same folder while the first runs', async () => {
    const input = {
      projectPath,
      name: 'first',
      include: [ANALYTICS_ITEMS.readme, ANALYTICS_ITEMS.gitignore],
    };
    const first = ProjectTypesService.scaffold('analytics', input);
    const second = ProjectTypesService.scaffold('analytics', {
      ...input,
      name: 'second',
    });

    await expect(second).rejects.toThrow('already being created');
    await first;
    expect(
      await fs.readFile(path.join(projectPath, 'README.md'), 'utf8'),
    ).toContain('# first');
  });

  describe('when a write fails', () => {
    let writeSpy: jest.SpyInstance;

    beforeEach(() => {
      const realWriteFile = nodeFs.promises.writeFile;
      writeSpy = jest
        .spyOn(nodeFs.promises, 'writeFile')
        .mockImplementation(((file: unknown, ...rest: unknown[]) =>
          String(file).endsWith('.gitignore')
            ? Promise.reject(new Error('disk full'))
            : (realWriteFile as (...args: unknown[]) => Promise<void>)(
                file,
                ...rest,
              )) as typeof nodeFs.promises.writeFile);
    });

    afterEach(() => writeSpy.mockRestore());

    it('removes what it created, so the same folder can be retried', async () => {
      const input = {
        projectPath,
        name: 'retry',
        include: defaultTemplateItems('analytics'),
      };

      await expect(
        ProjectTypesService.scaffold('analytics', input),
      ).rejects.toThrow('disk full');
      expect(await fs.pathExists(projectPath)).toBe(false);

      writeSpy.mockRestore();
      await ProjectTypesService.scaffold('analytics', input);
      expect(await listFiles(projectPath)).toContain('.gitignore');
    });

    it('keeps a folder that existed before the attempt', async () => {
      await fs.mkdirp(projectPath);

      await expect(
        ProjectTypesService.scaffold('analytics', {
          projectPath,
          name: 'kept',
          include: defaultTemplateItems('analytics'),
        }),
      ).rejects.toThrow('disk full');
      expect(await fs.pathExists(projectPath)).toBe(true);
      expect(await listFiles(projectPath)).toEqual([]);
    });
  });

  it('uses a folder that exists but is empty', async () => {
    await fs.mkdirp(projectPath);
    await ProjectTypesService.scaffold('analytics', {
      projectPath,
      name: 'empty_folder',
      include: [ANALYTICS_ITEMS.gitignore],
    });
    expect(await listFiles(projectPath)).toEqual(['.gitignore']);
  });

  it('creates an empty folder when nothing is included', async () => {
    await ProjectTypesService.scaffold('analytics', {
      projectPath,
      name: 'bare',
      include: [],
    });
    expect(await listFiles(projectPath)).toEqual([]);
  });

  it('keeps the optional folders in Git with .gitkeep', async () => {
    await ProjectTypesService.scaffold('analytics', {
      projectPath,
      name: 'with_data',
      include: [ANALYTICS_ITEMS.data, ANALYTICS_ITEMS.pipelines],
    });
    expect(await listFiles(projectPath)).toEqual([
      'data/.gitkeep',
      'rosetta/pipelines/.gitkeep',
    ]);
  });

  it('writes nothing when the connection changes', async () => {
    await fs.mkdirp(projectPath);
    await ProjectTypesService.onConnectionChanged({
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

describe('DuckLake instance ids', () => {
  it('round-trips an instance id', () => {
    const id = duckLakeInstanceConnectionId('abc-123');
    expect(id).toBe('ducklake-abc-123');
    expect(duckLakeInstanceIdOf(id)).toBe('abc-123');
  });

  it('ignores saved connection ids and missing ids', () => {
    expect(duckLakeInstanceIdOf('1731000000000')).toBeUndefined();
    expect(duckLakeInstanceIdOf(undefined)).toBeUndefined();
  });
});
