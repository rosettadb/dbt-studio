import { EventEmitter } from 'events';
import axios from 'axios';
import fs from 'fs-extra';
import { spawn } from 'child_process';
import SettingsService from '../../../src/main/services/settings.service';
import ProjectsService from '../../../src/main/services/projects.service';
import { DbtCoreVersionService } from '../../../src/main/services/dbtCoreVersion.service';

jest.mock('child_process', () => ({ spawn: jest.fn() }));
jest.mock('axios');
jest.mock('fs-extra', () => ({
  __esModule: true,
  default: {
    pathExists: jest.fn(),
    mkdtemp: jest.fn(),
    remove: jest.fn(),
  },
}));
jest.mock('../../../src/main/services/projects.service', () => ({
  __esModule: true,
  default: { getSelectedProject: jest.fn() },
}));
jest.mock('../../../src/main/services/settings.service', () => ({
  __esModule: true,
  default: {
    loadSettings: jest.fn(),
    saveSettings: jest.fn(),
  },
}));

type CommandResult = {
  exitCode: number;
  stdout?: string;
  stderr?: string;
};

const spawnMock = spawn as jest.MockedFunction<typeof spawn>;
const axiosGetMock = axios.get as jest.MockedFunction<typeof axios.get>;
const pathExistsMock = fs.pathExists as jest.MockedFunction<
  typeof fs.pathExists
>;
const loadSettingsMock = SettingsService.loadSettings as jest.MockedFunction<
  typeof SettingsService.loadSettings
>;
const saveSettingsMock = SettingsService.saveSettings as jest.MockedFunction<
  typeof SettingsService.saveSettings
>;
const getSelectedProjectMock =
  ProjectsService.getSelectedProject as jest.MockedFunction<
    typeof ProjectsService.getSelectedProject
  >;
const mkdtempMock = fs.mkdtemp as jest.MockedFunction<typeof fs.mkdtemp>;
const removeMock = fs.remove as jest.MockedFunction<typeof fs.remove>;

const mockCommands = (results: CommandResult[]) => {
  spawnMock.mockImplementation((() => {
    const result = results.shift();
    if (!result) throw new Error('Unexpected command');

    const child = new EventEmitter() as any;
    child.stdout = new EventEmitter();
    child.stderr = new EventEmitter();
    process.nextTick(() => {
      if (result.stdout) child.stdout.emit('data', result.stdout);
      if (result.stderr) child.stderr.emit('data', result.stderr);
      child.emit('close', result.exitCode);
    });
    return child;
  }) as typeof spawn);
};

describe('DbtCoreVersionService', () => {
  const pythonPath = '/managed/venv/bin/python3';
  const dbtPath = '/managed/venv/bin/dbt';

  beforeEach(() => {
    jest.clearAllMocks();
    loadSettingsMock.mockResolvedValue({
      pythonPath,
      dbtPath: '/old/venv/bin/dbt',
      dbtVersion: '1.11.12',
    } as any);
    pathExistsMock.mockImplementation(async (candidate) =>
      [pythonPath, dbtPath].includes(String(candidate)),
    );
  });

  it('verifies the dbt executable beside the managed Python interpreter', async () => {
    mockCommands([
      { exitCode: 0, stdout: 'Name: dbt-core\nVersion: 2.0.0a4\n' },
      { exitCode: 1 },
      { exitCode: 0, stdout: 'dbt Fusion 2.0.0-alpha.4\n' },
    ]);

    const installed = await DbtCoreVersionService.getInstalledDbtCore();

    expect(installed).toMatchObject({
      version: '2.0.0a4',
      pythonPath,
      dbtPath,
      isDbtCorePackage: true,
      isExecutableVerified: true,
      hasProprietaryDbtPackage: false,
    });
    expect(spawnMock).toHaveBeenLastCalledWith(dbtPath, ['--version'], {
      shell: false,
    });
  });

  it('does not fall back to a different Python interpreter', async () => {
    const result = await DbtCoreVersionService.installDbtCoreVersion({
      pythonPath: '/usr/bin/python3',
      packageName: 'dbt-core',
      version: '2.0.0a4',
    });

    expect(result).toEqual({
      ok: false,
      error:
        'The requested Python executable is not the app-managed environment.',
    });
    expect(spawnMock).not.toHaveBeenCalled();
  });

  it('updates settings only after package and executable verification', async () => {
    mockCommands([
      { exitCode: 0 },
      { exitCode: 0, stdout: 'Name: dbt-core\nVersion: 2.0.0a4\n' },
      { exitCode: 1 },
      { exitCode: 0, stdout: 'dbt Fusion 2.0.0-alpha.4\n' },
    ]);

    const result = await DbtCoreVersionService.installDbtCoreVersion({
      pythonPath,
      packageName: 'dbt-core',
      version: '2.0.0a4',
    });

    expect(result).toEqual({
      ok: true,
      installedVersion: '2.0.0a4',
      dbtPath,
    });
    expect(spawnMock).toHaveBeenNthCalledWith(
      1,
      pythonPath,
      [
        '-m',
        'pip',
        'install',
        '--upgrade',
        '--force-reinstall',
        '--no-cache-dir',
        'dbt-core==2.0.0a4',
      ],
      { shell: false },
    );
    expect(saveSettingsMock).toHaveBeenCalledWith(
      expect.objectContaining({ dbtPath, dbtVersion: '2.0.0a4' }),
    );
  });

  it('rejects versions that are not exact package versions', async () => {
    const result = await DbtCoreVersionService.installDbtCoreVersion({
      pythonPath,
      packageName: 'dbt-core',
      version: '2.0.0a4 --extra-index-url https://example.test',
    });

    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/^Invalid dbt-core version:/);
    expect(spawnMock).not.toHaveBeenCalled();
  });

  it('returns a typed unverified result when managed Python is missing', async () => {
    pathExistsMock.mockImplementation(async () => false);

    const installed = await DbtCoreVersionService.getInstalledDbtCore();

    expect(installed).toMatchObject({
      version: null,
      pythonPath,
      dbtPath: null,
      isDbtCorePackage: false,
      isExecutableVerified: false,
    });
    expect(installed.error).toContain('Managed Python environment not found');
  });

  it('lists stable versions by default and adds typed preview metadata on demand', async () => {
    axiosGetMock.mockResolvedValue({
      data: {
        releases: {
          '1.11.12': [{}],
          '1.10.22': [{}],
          '2.0.0a4': [{}],
          '2.0.0a10': [{}],
          '1.12.0rc2': [{}],
          '9.9.9': [{ yanked: true }],
        },
      },
    } as any);

    const stable = await DbtCoreVersionService.listDbtCoreVersions();
    const preview = await DbtCoreVersionService.listDbtCoreVersions({
      includePrerelease: true,
      limit: 10,
    });

    expect(stable.versions.map((item) => item.version)).toEqual([
      '1.11.12',
      '1.10.22',
    ]);
    expect(stable.latestStable).toBe('1.11.12');
    expect(stable.versions[0]).toMatchObject({
      isLatestStable: true,
      isInstalled: true,
      channel: 'stable',
    });
    expect(preview.versions.map((item) => item.version)).toEqual([
      '2.0.0a10',
      '2.0.0a4',
      '1.12.0rc2',
      '1.11.12',
      '1.10.22',
    ]);
    expect(preview.versions[0]).toMatchObject({
      isPrerelease: true,
      isLatestStable: false,
      channel: 'preview',
    });
  });

  it.each([
    ['1.12.0', 'upgrade'],
    ['1.10.22', 'downgrade'],
    ['1.11.12', 'reinstall'],
    ['2.0.0a4', 'preview-install'],
  ] as const)('plans %s as %s', async (targetVersion, direction) => {
    const plan = await DbtCoreVersionService.planVersionChange({
      targetVersion,
      includeAdapters: false,
    });

    expect(plan.direction).toBe(direction);
    expect(plan.rollbackVersion).toBe('1.11.12');
    expect(plan.channel).toBe(
      direction === 'preview-install' ? 'preview' : 'stable',
    );
    expect(plan.isMajorVersionChange).toBe(targetVersion.startsWith('2.'));
  });

  it('returns installed adapter warnings for a v2 preview plan', async () => {
    mockCommands([
      { exitCode: 0, stdout: 'Name: dbt-postgres\nVersion: 1.9.0\n' },
      { exitCode: 1 },
      { exitCode: 1 },
      { exitCode: 1 },
      { exitCode: 1 },
      { exitCode: 1 },
    ]);

    const plan = await DbtCoreVersionService.planVersionChange({
      targetVersion: '2.0.0a4',
    });

    expect(plan.isMajorVersionChange).toBe(true);
    expect(plan.warnings).toEqual(
      expect.arrayContaining([expect.stringContaining('major dbt-core')]),
    );
    expect(plan.adapters).toEqual([
      expect.objectContaining({
        packageName: 'dbt-postgres',
        installedVersion: '1.9.0',
        status: 'warning',
        message: expect.stringContaining('DBT_ALLOW_EXPERIMENTAL_ADAPTERS'),
      }),
    ]);
  });

  it('does not accept v2 executable output without dbt-core package provenance', async () => {
    mockCommands([
      { exitCode: 1 },
      { exitCode: 1 },
      { exitCode: 0, stdout: 'dbt Fusion 2.0.0-alpha.4\n' },
    ]);

    const installed = await DbtCoreVersionService.verifyDbtInstall(pythonPath);

    expect(installed.isDbtCorePackage).toBe(false);
    expect(installed.isExecutableVerified).toBe(false);
  });

  it('blocks a proprietary dbt package and preserves settings', async () => {
    mockCommands([
      { exitCode: 0 },
      { exitCode: 0, stdout: 'Name: dbt-core\nVersion: 2.0.0a4\n' },
      { exitCode: 0, stdout: 'Name: dbt\nVersion: 1.0.0\n' },
      { exitCode: 0, stdout: 'dbt Fusion 2.0.0-alpha.4\n' },
    ]);

    const result = await DbtCoreVersionService.installDbtCoreVersion({
      pythonPath,
      packageName: 'dbt-core',
      version: '2.0.0a4',
    });

    expect(result).toEqual({
      ok: false,
      error:
        'Unsupported dbt distribution detected. Rosetta supports Apache dbt-core only.',
    });
    expect(saveSettingsMock).not.toHaveBeenCalled();
  });

  it('preserves settings when pip installation fails', async () => {
    mockCommands([{ exitCode: 1, stderr: 'No matching distribution' }]);

    const result = await DbtCoreVersionService.installDbtCoreVersion({
      pythonPath,
      packageName: 'dbt-core',
      version: '2.0.0a4',
    });

    expect(result).toEqual({ ok: false, error: 'No matching distribution' });
    expect(saveSettingsMock).not.toHaveBeenCalled();
  });

  it('checks parse and compile with temporary artifacts without running deps', async () => {
    getSelectedProjectMock.mockResolvedValue({
      id: 'project-1',
      name: 'Migration project',
      path: '/projects/migration',
      createdAt: '2026-07-13',
      connection: { type: 'postgres' } as any,
    });
    mkdtempMock.mockImplementation(
      async () => '/tmp/rosetta-dbt-compatibility-test',
    );
    mockCommands([
      { exitCode: 0, stdout: 'Name: dbt-core\nVersion: 2.0.0a4\n' },
      { exitCode: 1 },
      { exitCode: 0, stdout: 'dbt Fusion 2.0.0-alpha.4\n' },
      { exitCode: 0, stdout: 'parse complete\n' },
      { exitCode: 0, stdout: 'compile complete\n' },
    ]);

    const result =
      await DbtCoreVersionService.checkCurrentProjectCompatibility();

    expect(result.ok).toBe(true);
    expect(result.diagnostics.map((item) => item.command)).toEqual([
      'parse',
      'compile',
    ]);
    expect(
      spawnMock.mock.calls.flatMap((call) => call[1] as string[]),
    ).not.toContain('deps');
    expect(spawnMock).toHaveBeenCalledWith(
      dbtPath,
      ['parse', '--project-dir', '/projects/migration'],
      expect.objectContaining({
        shell: false,
        cwd: '/projects/migration',
        env: expect.objectContaining({
          DBT_TARGET_PATH: '/tmp/rosetta-dbt-compatibility-test/target',
          DBT_LOG_PATH: '/tmp/rosetta-dbt-compatibility-test/logs',
          DBT_ALLOW_EXPERIMENTAL_ADAPTERS: 'true',
        }),
      }),
    );
    expect(removeMock).toHaveBeenCalledWith(
      '/tmp/rosetta-dbt-compatibility-test',
    );
  });
});
