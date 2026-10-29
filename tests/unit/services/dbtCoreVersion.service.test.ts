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
      { exitCode: 1 },
      { exitCode: 0, stdout: 'Name: dbt-oss\nVersion: 2.0.5\n' },
      { exitCode: 1 },
      { exitCode: 0, stdout: 'dbt-oss 2.0.5\n' },
    ]);

    const installed = await DbtCoreVersionService.getInstalledDbtCore();

    expect(installed).toMatchObject({
      version: '2.0.5',
      pythonPath,
      dbtPath,
      isDbtCorePackage: true,
      isExecutableVerified: true,
      hasProprietaryDbtPackage: false,
    });
    expect(spawnMock).toHaveBeenNthCalledWith(
      1,
      pythonPath,
      ['-m', 'pip', 'show', 'dbt-core'],
      { shell: false },
    );
    expect(spawnMock).toHaveBeenNthCalledWith(
      2,
      pythonPath,
      ['-m', 'pip', 'show', 'dbt-oss'],
      { shell: false },
    );
    expect(spawnMock).toHaveBeenLastCalledWith(dbtPath, ['--version'], {
      shell: false,
    });
  });

  it('does not verify when both dbt-core and dbt-oss are installed', async () => {
    mockCommands([
      { exitCode: 0, stdout: 'Name: dbt-core\nVersion: 2.0.0rc8\n' },
      { exitCode: 0, stdout: 'Name: dbt-oss\nVersion: 2.0.5\n' },
      { exitCode: 1 },
    ]);

    const installed = await DbtCoreVersionService.getInstalledDbtCore();

    expect(installed).toMatchObject({
      version: null,
      isDbtCorePackage: false,
      isExecutableVerified: false,
    });
    expect(installed.error).toContain('Both dbt-core and dbt-oss');
    expect(spawnMock).toHaveBeenCalledTimes(3);
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

  it('installs 2.x from dbt-oss after removing dbt-core, then verifies before saving', async () => {
    mockCommands([
      { exitCode: 0 },
      { exitCode: 0 },
      { exitCode: 1 },
      { exitCode: 0, stdout: 'Name: dbt-oss\nVersion: 2.0.5\n' },
      { exitCode: 1 },
      { exitCode: 0, stdout: 'dbt-oss 2.0.5\n' },
    ]);

    const result = await DbtCoreVersionService.installDbtCoreVersion({
      pythonPath,
      packageName: 'dbt-core',
      version: '2.0.5',
    });

    expect(result).toEqual({
      ok: true,
      installedVersion: '2.0.5',
      dbtPath,
    });
    expect(spawnMock).toHaveBeenNthCalledWith(
      1,
      pythonPath,
      ['-m', 'pip', 'uninstall', '--yes', 'dbt-core'],
      { shell: false },
    );
    expect(spawnMock).toHaveBeenNthCalledWith(
      2,
      pythonPath,
      [
        '-m',
        'pip',
        'install',
        '--upgrade',
        '--force-reinstall',
        '--no-cache-dir',
        'dbt-oss==2.0.5',
      ],
      { shell: false },
    );
    expect(saveSettingsMock).toHaveBeenCalledWith(
      expect.objectContaining({ dbtPath, dbtVersion: '2.0.5' }),
    );
  });

  it('installs 1.x from dbt-core after removing dbt-oss', async () => {
    mockCommands([
      { exitCode: 0 },
      { exitCode: 0 },
      { exitCode: 0, stdout: 'Name: dbt-core\nVersion: 1.12.5\n' },
      { exitCode: 1 },
      { exitCode: 1 },
      { exitCode: 0, stdout: 'Core:\n  - installed: 1.12.5\n' },
    ]);

    const result = await DbtCoreVersionService.installDbtCoreVersion({
      pythonPath,
      packageName: 'dbt-core',
      version: '1.12.5',
    });

    expect(result).toEqual({ ok: true, installedVersion: '1.12.5', dbtPath });
    expect(spawnMock).toHaveBeenNthCalledWith(
      1,
      pythonPath,
      ['-m', 'pip', 'uninstall', '--yes', 'dbt-oss'],
      { shell: false },
    );
    expect(spawnMock).toHaveBeenNthCalledWith(
      2,
      pythonPath,
      expect.arrayContaining(['dbt-core==1.12.5']),
      { shell: false },
    );
  });

  it('rejects a dbt-core 2.x pre-release whose binary reports the dbt-oss version', async () => {
    mockCommands([
      { exitCode: 0 },
      { exitCode: 0 },
      { exitCode: 1 },
      { exitCode: 0, stdout: 'Name: dbt-oss\nVersion: 2.0.0rc2\n' },
      { exitCode: 1 },
      { exitCode: 0, stdout: 'dbt-oss 2.0.5\n' },
    ]);

    const result = await DbtCoreVersionService.installDbtCoreVersion({
      pythonPath,
      packageName: 'dbt-core',
      version: '2.0.0rc2',
    });

    expect(result.ok).toBe(false);
    expect(result.error).toContain('did not report the installed');
    expect(saveSettingsMock).not.toHaveBeenCalled();
  });

  it('installs dbt-kinetica from its GitHub source archive', async () => {
    mockCommands([
      { exitCode: 0 },
      { exitCode: 0, stdout: 'Name: dbt-kinetica\nVersion: 0.1.0\n' },
    ]);

    const result = await DbtCoreVersionService.installLatestPackage({
      pythonPath,
      packageName: 'dbt-kinetica',
    });

    expect(result).toEqual({ ok: true, installedVersion: '0.1.0' });
    expect(spawnMock).toHaveBeenNthCalledWith(
      1,
      pythonPath,
      [
        '-m',
        'pip',
        'install',
        '--upgrade',
        '--no-cache-dir',
        'dbt-kinetica @ https://github.com/rosettadb/kinetica-dbt-adapter/archive/92f4866dad614d24aa1f771585d249ab30a4ac6a.zip',
      ],
      { shell: false },
    );
    expect(spawnMock).toHaveBeenNthCalledWith(
      2,
      pythonPath,
      ['-m', 'pip', 'show', 'dbt-kinetica'],
      { shell: false },
    );
  });

  it('does not offer PyPI versions or pinned installs for dbt-kinetica', async () => {
    const versions =
      await DbtCoreVersionService.listPackageVersions('dbt-kinetica');
    expect(versions).toEqual({
      packageName: 'dbt-kinetica',
      versions: [],
      latestStable: null,
    });
    expect(axiosGetMock).not.toHaveBeenCalled();

    const pinned = await DbtCoreVersionService.installPackageVersion({
      pythonPath,
      packageName: 'dbt-kinetica',
      version: '0.1.0',
    });
    expect(pinned.ok).toBe(false);
    expect(pinned.error).toContain('Install latest');
    expect(spawnMock).not.toHaveBeenCalled();
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

  const mockPypiReleases = (
    releasesByPackage: Record<string, Record<string, { yanked?: boolean }[]>>,
  ) => {
    axiosGetMock.mockImplementation(async (url: string) => {
      const packageName = url.replace(/^.*\/pypi\/([^/]+)\/json$/, '$1');
      const releases = releasesByPackage[packageName];
      if (!releases) throw new Error(`Not found: ${url}`);
      return { data: { releases } } as any;
    });
  };

  it("lists 1.x from dbt-core and 2.x from dbt-oss, marking each line's latest stable", async () => {
    mockPypiReleases({
      'dbt-core': {
        '1.11.12': [{}],
        '1.10.22': [{}],
        '1.12.0rc2': [{}],
        '2.0.0rc8': [{}],
        '9.9.9': [{ yanked: true }],
      },
      'dbt-oss': {
        '0.0.0': [{}],
        '2.0.0rc2': [{}],
        '2.0.5': [{}],
        '2.0.4': [{}],
      },
    });

    const stable = await DbtCoreVersionService.listDbtCoreVersions();
    const preview = await DbtCoreVersionService.listDbtCoreVersions({
      includePrerelease: true,
      limit: 10,
    });

    expect(stable.versions.map((item) => item.version)).toEqual([
      '2.0.5',
      '2.0.4',
      '1.11.12',
      '1.10.22',
    ]);
    expect(stable.latestStable).toBe('2.0.5');
    expect(stable.versions[0]).toMatchObject({
      isLatestStable: true,
      isInstalled: false,
      channel: 'stable',
    });
    expect(stable.versions[2]).toMatchObject({
      version: '1.11.12',
      isLatestStable: true,
      isInstalled: true,
    });
    expect(stable.versions[3].isLatestStable).toBe(false);
    expect(preview.versions.map((item) => item.version)).toEqual([
      '2.0.5',
      '2.0.4',
      '2.0.0rc2',
      '1.12.0rc2',
      '1.11.12',
      '1.10.22',
    ]);
    expect(preview.versions[2]).toMatchObject({
      isPrerelease: true,
      isLatestStable: false,
      channel: 'preview',
    });
  });

  it('still lists 1.x when the dbt-oss lookup fails', async () => {
    mockPypiReleases({ 'dbt-core': { '1.12.5': [{}], '2.0.0rc8': [{}] } });

    const result = await DbtCoreVersionService.listDbtCoreVersions({
      includePrerelease: true,
    });

    expect(result.versions.map((item) => item.version)).toEqual(['1.12.5']);
  });

  it('refuses to plan a 2.x install on a managed Python older than 3.11', async () => {
    loadSettingsMock.mockResolvedValue({
      pythonPath,
      pythonVersion: '3.10.17',
      dbtVersion: '1.11.12',
    } as any);

    await expect(
      DbtCoreVersionService.planVersionChange({
        targetVersion: '2.0.5',
        includeAdapters: false,
      }),
    ).rejects.toThrow('requires Python 3.11 or newer');

    const v1Plan = await DbtCoreVersionService.planVersionChange({
      targetVersion: '1.12.5',
      includeAdapters: false,
    });
    expect(v1Plan.direction).toBe('upgrade');
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
        message: expect.stringContaining('blocks v2 Postgres execution'),
      }),
    ]);
  });

  it('does not accept v2 executable output without dbt-core package provenance', async () => {
    mockCommands([
      { exitCode: 1 },
      { exitCode: 1 },
      { exitCode: 1 },
      { exitCode: 0, stdout: 'dbt-oss 2.0.5\n' },
    ]);

    const installed = await DbtCoreVersionService.verifyDbtInstall(pythonPath);

    expect(installed.isDbtCorePackage).toBe(false);
    expect(installed.isExecutableVerified).toBe(false);
  });

  it('blocks a proprietary dbt package and preserves settings', async () => {
    mockCommands([
      { exitCode: 0 },
      { exitCode: 0 },
      { exitCode: 1 },
      { exitCode: 0, stdout: 'Name: dbt-oss\nVersion: 2.0.5\n' },
      { exitCode: 0, stdout: 'Name: dbt\nVersion: 2.0.8\n' },
      { exitCode: 0, stdout: 'dbt-oss 2.0.5\n' },
    ]);

    const result = await DbtCoreVersionService.installDbtCoreVersion({
      pythonPath,
      packageName: 'dbt-core',
      version: '2.0.5',
    });

    expect(result).toEqual({
      ok: false,
      error:
        'Unsupported dbt distribution detected. Rosetta supports Apache dbt-core only.',
    });
    expect(saveSettingsMock).not.toHaveBeenCalled();
  });

  it('preserves settings when pip installation fails', async () => {
    mockCommands([
      { exitCode: 0 },
      { exitCode: 1, stderr: 'No matching distribution' },
    ]);

    const result = await DbtCoreVersionService.installDbtCoreVersion({
      pythonPath,
      packageName: 'dbt-core',
      version: '2.0.0a4',
    });

    expect(result).toEqual({ ok: false, error: 'No matching distribution' });
    expect(saveSettingsMock).not.toHaveBeenCalled();
  });

  it('terminates and reports a process that exceeds the execution timeout', async () => {
    jest.useFakeTimers();
    const child = new EventEmitter() as any;
    child.stdout = new EventEmitter();
    child.stderr = new EventEmitter();
    child.kill = jest.fn();
    spawnMock.mockReturnValue(child);

    try {
      const resultPromise = DbtCoreVersionService.installDbtCoreVersion({
        pythonPath,
        packageName: 'dbt-core',
        version: '2.0.0a4',
      });

      await jest.advanceTimersByTimeAsync(5 * 60 * 1000);
      const result = await resultPromise;

      expect(child.kill).toHaveBeenCalledWith('SIGTERM');
      expect(result).toEqual({
        ok: false,
        error: expect.stringContaining('Process timed out'),
      });
    } finally {
      jest.useRealTimers();
    }
  });

  it('checks parse and compile with temporary artifacts without running deps', async () => {
    getSelectedProjectMock.mockResolvedValue({
      id: 'project-1',
      name: 'Migration project',
      path: '/projects/migration',
      createdAt: '2026-07-13',
      connection: { type: 'duckdb' } as any,
    });
    mkdtempMock.mockImplementation(
      async () => '/tmp/rosetta-dbt-compatibility-test',
    );
    mockCommands([
      { exitCode: 1 },
      { exitCode: 0, stdout: 'Name: dbt-oss\nVersion: 2.0.5\n' },
      { exitCode: 1 },
      { exitCode: 0, stdout: 'dbt-oss 2.0.5\n' },
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
        }),
      }),
    );
    expect(removeMock).toHaveBeenCalledWith(
      '/tmp/rosetta-dbt-compatibility-test',
    );
  });

  it('uses the live v2 version to block Postgres when settings still report v1', async () => {
    getSelectedProjectMock.mockResolvedValue({
      id: 'project-1',
      name: 'Postgres project',
      path: '/projects/postgres',
      createdAt: '2026-07-13',
      connection: { type: 'postgres' } as any,
    });
    mockCommands([
      { exitCode: 1 },
      { exitCode: 0, stdout: 'Name: dbt-oss\nVersion: 2.0.5\n' },
      { exitCode: 1 },
      { exitCode: 0, stdout: 'dbt-oss 2.0.5\n' },
    ]);

    const result =
      await DbtCoreVersionService.checkCurrentProjectCompatibility();

    expect(result.ok).toBe(false);
    expect(result.error).toContain(
      "PostgreSQL is not available in Rosetta's dbt Core v2 compatibility table",
    );
    expect(result.recommendations).toEqual([
      expect.stringContaining('stable v1'),
    ]);
    expect(mkdtempMock).not.toHaveBeenCalled();
  });
});

describe('DbtCoreVersionService pip time limits', () => {
  const pythonPath = '/managed/venv/bin/python3';

  beforeEach(() => {
    jest.useFakeTimers();
    jest.clearAllMocks();
    loadSettingsMock.mockResolvedValue({ pythonPath } as any);
    pathExistsMock.mockResolvedValue(true as never);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  // A pip process that only ends when it is killed.
  const mockHangingCommands = () => {
    const kill = jest.fn();
    spawnMock.mockImplementation((() => {
      const child = new EventEmitter() as any;
      child.stdout = new EventEmitter();
      child.stderr = new EventEmitter();
      child.kill = kill;
      return child;
    }) as typeof spawn);
    return kill;
  };

  it('gives a queued pip install 30 minutes instead of 5', async () => {
    const kill = mockHangingCommands();
    const result = DbtCoreVersionService.installLatestPackage(
      { pythonPath, packageName: 'dbt-postgres' },
      {
        signal: new AbortController().signal,
        markUnsafeToStop: jest.fn(),
      },
    );

    await jest.advanceTimersByTimeAsync(6 * 60 * 1000);
    expect(kill).not.toHaveBeenCalled();

    await jest.advanceTimersByTimeAsync(24 * 60 * 1000);
    expect(kill).toHaveBeenCalled();
    await expect(result).resolves.toEqual({
      ok: false,
      error: expect.stringContaining('Process timed out after 1800000ms'),
    });
  });

  it('keeps 5 minutes for quick pip commands', async () => {
    const kill = mockHangingCommands();
    // Caught right away so the rejection isn't reported as unhandled while
    // the clock is moved forward.
    const outcome = DbtCoreVersionService.getInstalledPackages().catch(
      (error: Error) => error,
    );

    await jest.advanceTimersByTimeAsync(5 * 60 * 1000 + 1000);
    expect(kill).toHaveBeenCalled();
    expect(((await outcome) as Error).message).toContain(
      'Process timed out after 300000ms',
    );
  });
});
