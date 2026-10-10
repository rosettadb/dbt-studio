const stopAll = jest.fn(async () => undefined);
const startServer = jest.fn(async () => ({
  url: 'http://127.0.0.1:1',
  port: 1,
}));
jest.mock('../../../../src/main/utils/dbtChartsServer', () => ({
  startServer: (...a: unknown[]) => (startServer as any)(...a),
  stopServer: jest.fn(async () => undefined),
  stopAll: () => stopAll(),
  stopAllExcept: jest.fn(async () => undefined),
  getServerStatus: jest.fn(() => ({ state: 'stopped' })),
}));
jest.mock('../../../../src/main/utils/rendererBroadcast', () => ({
  broadcastToRenderers: jest.fn(),
}));

const runProcess = jest.fn();
jest.mock('../../../../src/main/services/notebookEnv.service', () => ({
  __esModule: true,
  runProcess: (...a: unknown[]) => runProcess(...a),
}));

const requireBinary = jest.fn();
const installRuntime = jest.fn();
jest.mock('../../../../src/main/services/pythonRuntimes.service', () => ({
  __esModule: true,
  default: {
    requireBinary: (...a: unknown[]) => requireBinary(...a),
    installRuntime: (...a: unknown[]) => installRuntime(...a),
  },
}));

const loadProjects = jest.fn();
jest.mock('../../../../src/main/services/projects.service', () => ({
  __esModule: true,
  default: { loadProjects: () => loadProjects() },
}));
jest.mock('../../../../src/main/services/connectors.service', () => ({
  __esModule: true,
  default: { getConnectionById: jest.fn(async () => undefined) },
}));
jest.mock('../../../../src/main/services/settings.service', () => ({
  __esModule: true,
  default: { loadSettings: jest.fn(async () => ({ dbtPath: '/bin/dbt' })) },
}));
jest.mock('../../../../src/main/utils/dbtChartsEnv', () => ({
  buildDbtChartsEnv: jest.fn(async () => ({ DBT_PROFILES_DIR: '/p' })),
  redactSecrets: (t: string) => t,
}));

import fs from 'fs-extra';
import os from 'os';
import path from 'path';
import { app } from 'electron';
import DbtChartsService, {
  DBT_CHARTS_VERSION,
} from '../../../../src/main/services/dbtCharts.service';

describe('DbtChartsService', () => {
  let userData: string;
  let projectDir: string;

  const project = (type?: string) => ({
    id: 'p1',
    name: 'Shop',
    path: projectDir,
    connection: type ? { name: 'warehouse', type } : undefined,
  });

  beforeEach(async () => {
    jest.clearAllMocks();
    userData = await fs.mkdtemp(path.join(os.tmpdir(), 'dbt-charts-ud-'));
    projectDir = await fs.mkdtemp(path.join(os.tmpdir(), 'dbt-charts-pr-'));
    await fs.writeFile(
      path.join(projectDir, 'dbt_project.yml'),
      'name: shop\nprofile: shop\n',
    );
    (app.getPath as jest.Mock).mockReturnValue(userData);
    requireBinary.mockResolvedValue('/py/bin/python3');
    runProcess.mockImplementation(async (_cmd: string, args: string[]) => {
      if (args[0] === '-m' && args[1] === 'venv') {
        const bin = path.join(args[2], 'bin');
        await fs.mkdirp(bin);
        await fs.writeFile(path.join(bin, 'dct'), '');
      }
      return { code: 0, stdout: '', stderr: '' };
    });
  });

  afterEach(async () => {
    await fs.remove(userData);
    await fs.remove(projectDir);
  });

  it('keeps its venv out of the studio global venv', () => {
    expect(DbtChartsService.getVenvDir()).toBe(
      path.join(userData, 'dbt-charts', 'venv'),
    );
    expect(DbtChartsService.getVenvDir()).not.toBe(path.join(userData, 'venv'));
  });

  it('install creates the venv, pins the version and writes the marker', async () => {
    expect((await DbtChartsService.getStatus()).installed).toBe(false);
    expect(await DbtChartsService.install()).toEqual({ ok: true });
    const pip = runProcess.mock.calls.find((c) => c[1].includes('pip'))!;
    expect(pip[1]).toContain(`dbt-charts==${DBT_CHARTS_VERSION}`);
    expect(await DbtChartsService.getStatus()).toEqual({
      installed: true,
      version: DBT_CHARTS_VERSION,
      pythonVersion: '3.11.12',
      extras: [],
    });
  });

  it('install downloads the Python runtime when it is missing', async () => {
    requireBinary
      .mockRejectedValueOnce(new Error('not installed'))
      .mockResolvedValueOnce('/py/bin/python3');
    await DbtChartsService.install();
    expect(installRuntime).toHaveBeenCalledWith('3.11.12');
  });

  it('install reports pip failure and leaves nothing installed', async () => {
    runProcess.mockImplementation(async (_c: string, args: string[]) => {
      if (args.includes('pip'))
        return { code: 1, stdout: '', stderr: 'no net' };
      if (args[1] === 'venv') await fs.mkdirp(args[2]);
      return { code: 0, stdout: '', stderr: '' };
    });
    const result = await DbtChartsService.install();
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/no net/);
    expect((await DbtChartsService.getStatus()).installed).toBe(false);
  });

  it('ensureAdapter installs all installed extras plus the new one once', async () => {
    await DbtChartsService.install();
    runProcess.mockClear();
    await DbtChartsService.ensureAdapter('postgresql');
    await DbtChartsService.ensureAdapter('snowflake');
    await DbtChartsService.ensureAdapter('snowflake');
    const pips = runProcess.mock.calls.filter((c) => c[1].includes('pip'));
    expect(pips).toHaveLength(2);
    expect(pips[1][1]).toContain(
      `dbt-charts[postgresql,snowflake]==${DBT_CHARTS_VERSION}`,
    );
    expect((await DbtChartsService.getStatus()).extras).toEqual([
      'postgresql',
      'snowflake',
    ]);
  });

  it('rejects malformed extras', () => {
    expect(() => DbtChartsService.ensureAdapter('x;rm -rf')).toThrow(/Invalid/);
  });

  it('unsupported connections get a reason and never install or start', async () => {
    loadProjects.mockResolvedValue([project('mysql')]);
    const state = await DbtChartsService.getProjectState('p1');
    expect(state.support).toEqual({
      supported: false,
      reason: 'dbt Charts does not support mysql connections yet',
    });
    await expect(DbtChartsService.startServer('p1')).rejects.toThrow(
      /does not support mysql/,
    );
    await expect(
      DbtChartsService.validate({ projectId: 'p1', filePath: 'a' }),
    ).rejects.toThrow(/does not support mysql/);
    await expect(DbtChartsService.setupProject('p1')).rejects.toThrow(
      /does not support mysql/,
    );
    expect(runProcess).not.toHaveBeenCalled();
    expect(startServer).not.toHaveBeenCalled();
  });

  it('project state reflects config, boards, manifest and extra', async () => {
    loadProjects.mockResolvedValue([project('postgres')]);
    await DbtChartsService.install();
    let state = await DbtChartsService.getProjectState('p1');
    expect(state).toMatchObject({
      configExists: false,
      boards: [],
      manifestStale: true,
      extraInstalled: false,
    });
    await DbtChartsService.setupProject('p1');
    await DbtChartsService.ensureAdapter('postgresql');
    state = await DbtChartsService.getProjectState('p1');
    expect(state).toMatchObject({
      configExists: true,
      boards: ['charts/index.yml'],
      extraInstalled: true,
    });
  });

  it('startServer requires installation and setup, then delegates', async () => {
    loadProjects.mockResolvedValue([project('duckdb')]);
    await expect(DbtChartsService.startServer('p1')).rejects.toThrow(
      /not installed/,
    );
    await DbtChartsService.install();
    await expect(DbtChartsService.startServer('p1')).rejects.toThrow(
      /not set up/,
    );
    await DbtChartsService.setupProject('p1');
    await expect(DbtChartsService.startServer('p1')).resolves.toEqual({
      url: 'http://127.0.0.1:1',
      port: 1,
    });
    expect(startServer).toHaveBeenCalledWith(
      expect.objectContaining({ projectId: 'p1', projectPath: projectDir }),
    );
  });

  it('validate refuses files outside the project and parses diagnostics', async () => {
    loadProjects.mockResolvedValue([project('duckdb')]);
    await DbtChartsService.install();
    await DbtChartsService.setupProject('p1');
    await fs.mkdirp(path.join(projectDir, 'target'));
    await fs.writeFile(path.join(projectDir, 'target', 'manifest.json'), '{}');
    const future = new Date(Date.now() + 60_000);
    await fs.utimes(
      path.join(projectDir, 'target', 'manifest.json'),
      future,
      future,
    );

    await expect(
      DbtChartsService.validate({
        projectId: 'p1',
        filePath: '../../etc/passwd',
      }),
    ).rejects.toThrow(/inside the project/);

    runProcess.mockResolvedValueOnce({
      code: 1,
      stdout: JSON.stringify({
        success: false,
        path: 'charts/index.yml',
        errors: [
          {
            code: 'x',
            message: 'bad',
            range: { start_line: 2, columns: { start_col: 1 } },
          },
        ],
        warnings: [],
      }),
      stderr: '',
    });
    const diagnostics = await DbtChartsService.validate({
      projectId: 'p1',
      filePath: 'charts/index.yml',
    });
    expect(diagnostics).toEqual([
      { severity: 'error', code: 'x', message: 'bad', line: 2, column: 1 },
    ]);
    const call = runProcess.mock.calls.at(-1)!;
    expect(call[1]).toEqual([
      'validate',
      path.join(projectDir, 'charts', 'index.yml'),
      '--json',
      '--project-dir',
      projectDir,
    ]);
  });

  it('ensureManifest runs dbt parse only when stale', async () => {
    loadProjects.mockResolvedValue([project('duckdb')]);
    await DbtChartsService.install();
    runProcess.mockClear();
    const result = await DbtChartsService.ensureManifest('p1');
    expect(result).toEqual({ ran: true, ok: true });
    expect(runProcess).toHaveBeenCalledWith(
      '/bin/dbt',
      ['parse', '--project-dir', projectDir],
      expect.any(Object),
    );
  });

  it('ensureManifest returns the dbt error without throwing', async () => {
    loadProjects.mockResolvedValue([project('duckdb')]);
    await DbtChartsService.install();
    runProcess.mockResolvedValueOnce({
      code: 2,
      stdout: '',
      stderr: 'parse boom',
    });
    expect(await DbtChartsService.ensureManifest('p1')).toEqual({
      ran: true,
      ok: false,
      error: 'parse boom',
    });
  });

  it('stopAll delegates to the server manager', async () => {
    await DbtChartsService.stopAll();
    expect(stopAll).toHaveBeenCalled();
  });
});
