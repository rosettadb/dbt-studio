/**
 * dbt Charts Service
 *
 * Owns everything the main process needs for dbt Charts (dct): a managed
 * Python venv at `userData/dbt-charts/venv` (never Studio's global venv, which
 * may hold dbt v2 adapters that pip could silently replace), adapter extras
 * chosen from the project's connection, project setup files, manifest
 * freshness, validation and one `dct serve` process per project.
 *
 * Handlers in dbtCharts.ipcHandlers.ts are one-line pass-throughs; all
 * validation and errors live here.
 */

import { app } from 'electron';
import fs from 'fs-extra';
import path from 'path';
import { dlog } from '../../shared/dbtChartsDebug'; // DBT-CHARTS-DEBUG
import type {
  DbtChartsCreateBoardInput,
  DbtChartsDiagnostic,
  DbtChartsInstallProgress,
  DbtChartsManifestResult,
  DbtChartsProjectState,
  DbtChartsResult,
  DbtChartsServerStatus,
  DbtChartsSetupResult,
  DbtChartsStatus,
  DbtChartsValidateInput,
  Project,
} from '../../types/backend';
import ConnectorsService from './connectors.service';
import ProjectsService from './projects.service';
import PythonRuntimesService from './pythonRuntimes.service';
import SettingsService from './settings.service';
import { runProcess } from './notebookEnv.service';
import { broadcastToRenderers } from '../utils/rendererBroadcast';
import { getDbtChartsSupport } from '../utils/dbtChartsAdapters';
import {
  buildDbtChartsEnv,
  redactSecrets,
  type ChartsEnv,
} from '../utils/dbtChartsEnv';
import { parseDctValidateOutput } from '../utils/dbtChartsDiagnostics';
import { isManifestStale } from '../utils/dbtManifest';
import {
  createDbtChartsBoard,
  DBT_CHARTS_CONFIG_FILE,
  isInside,
  listDbtChartsBoards,
  setupDbtChartsProject,
} from '../utils/dbtChartsTemplates';
import * as chartsServer from '../utils/dbtChartsServer';

/** One exact version; upgrades are their own PR. */
export const DBT_CHARTS_VERSION = '0.9.1';
/** dct needs Python 3.10+. */
export const DBT_CHARTS_PYTHON_VERSION = '3.11.12';

const EXTRA_PATTERN = /^[a-z0-9][a-z0-9_-]*$/;
const VENV_TIMEOUT_MS = 5 * 60 * 1000;
const COMMAND_TIMEOUT_MS = 2 * 60 * 1000;

type EnvMarker = {
  pythonVersion: string;
  dbtChartsVersion: string;
  extras: string[];
};

type ResolvedProject = {
  project: Project;
  projectPath: string;
  connection: { name: string; type?: string };
};

const errorMessage = (error: unknown, fallback: string) =>
  error instanceof Error ? error.message : fallback;

export default class DbtChartsService {
  private static installLock: Promise<unknown> = Promise.resolve();

  /* ------------------------------ paths ------------------------------ */

  static getRoot(): string {
    return path.join(app.getPath('userData'), 'dbt-charts');
  }

  static getVenvDir(): string {
    return path.join(this.getRoot(), 'venv');
  }

  static getMarkerPath(): string {
    return path.join(this.getRoot(), 'env.json');
  }

  private static venvBin(name: string): string {
    return process.platform === 'win32'
      ? path.join(this.getVenvDir(), 'Scripts', `${name}.exe`)
      : path.join(this.getVenvDir(), 'bin', name);
  }

  static getDctPath(): string {
    return this.venvBin('dct');
  }

  private static async readMarker(): Promise<EnvMarker | null> {
    try {
      return (await fs.readJson(this.getMarkerPath())) as EnvMarker;
    } catch {
      return null;
    }
  }

  private static async writeMarker(marker: EnvMarker) {
    await fs.mkdirp(this.getRoot());
    await fs.writeJson(this.getMarkerPath(), marker, { spaces: 2 });
  }

  private static progress(event: DbtChartsInstallProgress) {
    broadcastToRenderers('dbt-charts:installProgress', event);
  }

  /** Serialises install / ensureAdapter / uninstall. */
  private static withInstallLock<T>(fn: () => Promise<T>): Promise<T> {
    const run = this.installLock.then(fn, fn);
    this.installLock = run.catch(() => undefined);
    return run;
  }

  /* ----------------------------- status ------------------------------ */

  static async getStatus(): Promise<DbtChartsStatus> {
    const marker = await this.readMarker();
    const installed = !!marker && (await fs.pathExists(this.getDctPath()));
    return {
      installed,
      version: installed ? marker.dbtChartsVersion : null,
      pythonVersion: installed ? marker.pythonVersion : null,
      extras: installed ? marker.extras : [],
    };
  }

  /* ----------------------------- install ----------------------------- */

  private static requirement(extras: string[]): string {
    const spec = extras.length > 0 ? `[${extras.join(',')}]` : '';
    return `dbt-charts${spec}==${DBT_CHARTS_VERSION}`;
  }

  private static async pipInstall(extras: string[], basePercentage: number) {
    let percentage = basePercentage;
    const result = await runProcess(
      this.venvBin('python'),
      [
        '-m',
        'pip',
        'install',
        '--disable-pip-version-check',
        this.requirement(extras),
      ],
      {
        onLine: (line) => {
          percentage = Math.min(95, percentage + 1);
          this.progress({ phase: 'pip', message: line, percentage });
        },
      },
    );
    if (result.code !== 0) {
      const tail = (result.stderr || result.stdout)
        .trim()
        .split('\n')
        .slice(-10)
        .join('\n');
      throw new Error(`pip install failed:\n${tail}`);
    }
  }

  static install(): Promise<DbtChartsResult> {
    return this.withInstallLock(async () => {
      if ((await this.getStatus()).installed) return { ok: true };

      try {
        this.progress({
          phase: 'python',
          message: `Preparing Python ${DBT_CHARTS_PYTHON_VERSION}`,
          percentage: 5,
        });
        let python: string;
        try {
          python = await PythonRuntimesService.requireBinary(
            DBT_CHARTS_PYTHON_VERSION,
          );
        } catch {
          await PythonRuntimesService.installRuntime(DBT_CHARTS_PYTHON_VERSION);
          python = await PythonRuntimesService.requireBinary(
            DBT_CHARTS_PYTHON_VERSION,
          );
        }

        this.progress({
          phase: 'venv',
          message: 'Creating virtual environment',
          percentage: 20,
        });
        await fs.remove(this.getVenvDir());
        await fs.mkdirp(this.getRoot());
        const venv = await runProcess(
          python,
          ['-m', 'venv', this.getVenvDir()],
          { timeoutMs: VENV_TIMEOUT_MS },
        );
        if (venv.code !== 0) {
          throw new Error(`Failed to create venv: ${venv.stderr.trim()}`);
        }

        this.progress({
          phase: 'pip',
          message: `Installing dbt-charts ${DBT_CHARTS_VERSION}`,
          percentage: 30,
        });
        await this.pipInstall([], 30);

        await this.writeMarker({
          pythonVersion: DBT_CHARTS_PYTHON_VERSION,
          dbtChartsVersion: DBT_CHARTS_VERSION,
          extras: [],
        });
        this.progress({ phase: 'done', message: 'Installed', percentage: 100 });
        return { ok: true };
      } catch (error) {
        await fs.remove(this.getVenvDir()).catch(() => undefined);
        const message = errorMessage(error, 'Install failed');
        this.progress({ phase: 'error', message });
        return { ok: false, error: message };
      }
    });
  }

  static async uninstall(): Promise<{ ok: boolean }> {
    await chartsServer.stopAll();
    return this.withInstallLock(async () => {
      await fs.remove(this.getRoot());
      return { ok: true };
    });
  }

  /** Installs `extra` (plus every extra already installed) when missing. */
  static ensureAdapter(extra: string): Promise<void> {
    if (!EXTRA_PATTERN.test(extra)) {
      throw new Error(`Invalid dbt Charts extra: ${extra}`);
    }
    return this.withInstallLock(async () => {
      const marker = await this.readMarker();
      if (!marker) throw new Error('dbt Charts is not installed');
      if (marker.extras.includes(extra)) return;

      const extras = [...marker.extras, extra].sort();
      this.progress({
        phase: 'pip',
        message: `Installing the ${extra} adapter`,
        percentage: 10,
      });
      try {
        await this.pipInstall(extras, 10);
      } catch (error) {
        this.progress({
          phase: 'error',
          message: errorMessage(error, 'Adapter install failed'),
        });
        throw error;
      }
      await this.writeMarker({ ...marker, extras });
      this.progress({ phase: 'done', message: 'Installed', percentage: 100 });
    });
  }

  /* ----------------------------- projects ---------------------------- */

  private static async resolveProject(
    projectId: string,
  ): Promise<ResolvedProject> {
    if (!projectId) throw new Error('projectId is required');
    const projects = await ProjectsService.loadProjects();
    const project = projects.find((p) => p.id === projectId);
    if (!project) throw new Error(`Project not found: ${projectId}`);

    const stored = project.connectionId
      ? await ConnectorsService.getConnectionById(project.connectionId)
      : undefined;
    const connection = stored?.connection ?? project.connection;
    return {
      project,
      projectPath: project.path,
      connection: {
        name: connection?.name ?? project.rosettaConnection?.name ?? '',
        type:
          connection?.type ??
          project.dbtConnection?.type ??
          project.rosettaConnection?.dbType,
      },
    };
  }

  static async getProjectState(
    projectId: string,
  ): Promise<DbtChartsProjectState> {
    const { projectPath, connection } = await this.resolveProject(projectId);
    const support = getDbtChartsSupport(connection.type);
    const marker = await this.readMarker();
    return {
      support,
      configExists: await fs.pathExists(
        path.join(projectPath, DBT_CHARTS_CONFIG_FILE),
      ),
      boards: await listDbtChartsBoards(projectPath),
      manifestStale: await isManifestStale(projectPath),
      extraInstalled:
        !!marker && (!support.extra || marker.extras.includes(support.extra)),
    };
  }

  static async setupProject(projectId: string): Promise<DbtChartsSetupResult> {
    const { project, projectPath, connection } =
      await this.resolveProject(projectId);
    this.assertSupported(connection.type);
    return setupDbtChartsProject(projectPath, project.name);
  }

  static async createBoard({
    projectId,
    name,
  }: DbtChartsCreateBoardInput): Promise<{ path: string }> {
    const { projectPath } = await this.resolveProject(projectId);
    return createDbtChartsBoard(projectPath, name);
  }

  private static assertSupported(type?: string) {
    const support = getDbtChartsSupport(type);
    if (!support.supported) {
      throw new Error(support.reason ?? 'Connection type is not supported');
    }
    return support;
  }

  /**
   * Guards every action that would run dct: unsupported connections throw
   * before anything is installed or started; a missing adapter extra is
   * installed on demand.
   */
  private static async prepare(projectId: string) {
    const resolved = await this.resolveProject(projectId);
    dlog('main:service', 'prepare resolved project', {
      projectId,
      projectPath: resolved.projectPath,
      connectionType: resolved.connection.type,
    }); // DBT-CHARTS-DEBUG
    const support = this.assertSupported(resolved.connection.type);
    dlog('main:service', 'prepare support', support); // DBT-CHARTS-DEBUG
    if (!(await this.getStatus()).installed) {
      throw new Error('dbt Charts is not installed. Install it first.');
    }
    if (support.extra) await this.ensureAdapter(support.extra);
    const env = await buildDbtChartsEnv(
      resolved.connection,
      resolved.projectPath,
    );
    dlog('main:service', 'prepare env built', {
      keys: Object.keys(env).length,
      DBT_PROFILES_DIR: env.DBT_PROFILES_DIR,
      hasPATH: Boolean(env.PATH),
      ELECTRON_RUN_AS_NODE: env.ELECTRON_RUN_AS_NODE,
      PYTHONPATH: env.PYTHONPATH,
      PYTHONHOME: env.PYTHONHOME,
      VIRTUAL_ENV: env.VIRTUAL_ENV,
    }); // DBT-CHARTS-DEBUG
    return { ...resolved, env };
  }

  /* ----------------------------- manifest ---------------------------- */

  static async ensureManifest(
    projectId: string,
  ): Promise<DbtChartsManifestResult> {
    const { projectPath, env } = await this.prepare(projectId);
    return this.runParseIfStale(projectPath, env);
  }

  private static async runParseIfStale(
    projectPath: string,
    env: ChartsEnv,
  ): Promise<DbtChartsManifestResult> {
    if (!(await isManifestStale(projectPath))) {
      return { ran: false, ok: true };
    }
    const { dbtPath } = await SettingsService.loadSettings();
    if (!dbtPath) {
      return { ran: false, ok: false, error: 'dbt is not installed.' };
    }
    try {
      const result = await runProcess(
        dbtPath,
        ['parse', '--project-dir', projectPath],
        { cwd: projectPath, env, timeoutMs: COMMAND_TIMEOUT_MS },
      );
      if (result.code === 0) return { ran: true, ok: true };
      const output = redactSecrets(
        (result.stderr || result.stdout)
          .trim()
          .split('\n')
          .slice(-20)
          .join('\n'),
        env,
      );
      return { ran: true, ok: false, error: output || 'dbt parse failed' };
    } catch (error) {
      return {
        ran: true,
        ok: false,
        error: redactSecrets(errorMessage(error, 'dbt parse failed'), env),
      };
    }
  }

  /* ---------------------------- validation --------------------------- */

  static async validate({
    projectId,
    filePath,
  }: DbtChartsValidateInput): Promise<DbtChartsDiagnostic[]> {
    const { projectPath, env } = await this.prepare(projectId);

    const target = path.resolve(projectPath, filePath ?? '');
    if (!isInside(path.resolve(projectPath), target)) {
      throw new Error('Board file must be inside the project');
    }
    if (!(await fs.pathExists(target))) {
      throw new Error(`Board file not found: ${filePath}`);
    }

    const manifest = await this.runParseIfStale(projectPath, env);
    if (!manifest.ok) {
      throw new Error(manifest.error ?? 'dbt parse failed');
    }

    const result = await runProcess(
      this.getDctPath(),
      ['validate', target, '--json', '--project-dir', projectPath],
      { cwd: projectPath, env, timeoutMs: COMMAND_TIMEOUT_MS },
    );
    try {
      // dct exits non-zero when diagnostics contain errors; stdout is still JSON.
      return parseDctValidateOutput(result.stdout).map((d) => ({
        ...d,
        message: redactSecrets(d.message, env),
      }));
    } catch {
      throw new Error(
        redactSecrets(
          (result.stderr || result.stdout || 'dct validate failed').trim(),
          env,
        ),
      );
    }
  }

  /* ------------------------------ server ----------------------------- */

  static async startServer(
    projectId: string,
  ): Promise<{ url: string; port: number }> {
    const { projectPath, env } = await this.prepare(projectId);
    if (
      !(await fs.pathExists(path.join(projectPath, DBT_CHARTS_CONFIG_FILE)))
    ) {
      throw new Error('dbt Charts is not set up for this project yet');
    }
    return chartsServer.startServer({
      projectId,
      projectPath,
      dctPath: this.getDctPath(),
      env,
    });
  }

  static stopServer(projectId: string): Promise<void> {
    return chartsServer.stopServer(projectId);
  }

  static getServerStatus(projectId: string): DbtChartsServerStatus {
    return chartsServer.getServerStatus(projectId);
  }

  static stopAll(): Promise<void> {
    return chartsServer.stopAll();
  }

  static stopAllExcept(projectId: string): Promise<void> {
    return chartsServer.stopAllExcept(projectId);
  }
}

// DBT-CHARTS-DEBUG: trace every public call (args, duration, result summary).
(() => {
  const names = [
    'getStatus',
    'install',
    'uninstall',
    'ensureAdapter',
    'getProjectState',
    'setupProject',
    'createBoard',
    'ensureManifest',
    'validate',
    'startServer',
    'stopServer',
    'getServerStatus',
    'stopAll',
    'stopAllExcept',
  ] as const;
  const svc = DbtChartsService as unknown as Record<
    string,
    (...a: unknown[]) => unknown
  >;
  names.forEach((name) => {
    const original = svc[name];
    svc[name] = (...args: unknown[]) => {
      const started = Date.now();
      dlog('main:service', `${name} called`, args);
      try {
        const result = original.apply(DbtChartsService, args);
        if (result && typeof (result as Promise<unknown>).then === 'function') {
          return (result as Promise<unknown>).then(
            (value) => {
              dlog(
                'main:service',
                `${name} ok in ${Date.now() - started}ms`,
                value,
              );
              return value;
            },
            (error) => {
              dlog(
                'main:service',
                `${name} FAILED in ${Date.now() - started}ms`,
                error?.message ?? error,
              );
              throw error;
            },
          );
        }
        dlog('main:service', `${name} ok (sync)`, result);
        return result;
      } catch (error) {
        dlog(
          'main:service',
          `${name} THREW`,
          (error as Error)?.message ?? error,
        );
        throw error;
      }
    };
  });
})();
