import path from 'path';
import { app } from 'electron';
import fs from 'fs-extra';
import {
  CHARTS_DIR,
  DBT_CHARTS_PYTHON,
  DBT_CHARTS_VERSION,
  chartsRelativePath,
  isChartsBoardPath,
  isChartsPartial,
  type ChartsParseResult,
  type ChartsServerStatus,
  type ChartsValidationResult,
  type DbtChartsStatus,
  type ProjectChartsState,
} from '../../shared/dbtCharts';
import PythonRuntimesService from './pythonRuntimes.service';
import { resolveVenvPython, runProcess } from '../utils/pythonEnv';
import SettingsService from './settings.service';
import {
  extraForAdapter,
  readTargetAdapterType,
} from '../utils/dbtChartsAdapters';
import { buildDbtChartsEnv, createRedactor } from '../utils/dbtChartsEnv';
import {
  diagnosticsForFile,
  parseValidateJson,
} from '../utils/dbtChartsDiagnostics';
import {
  appendServerLog,
  clearServerLog as clearServerLogLines,
  ensureServer as ensureServerProcess,
  getServerLog as readServerLog,
  getServerStatus as readServerStatus,
  pendingServerStatus,
  publishServerStatus,
  serverGeneration,
  stopServer as stopServerProcess,
} from '../utils/dbtChartsServer';
import { broadcastToRenderers } from '../utils/rendererBroadcast';

// dbt Charts (PyPI `dbt-charts`, CLI `dct`) in its own venv on Studio's
// managed Python. It pins dbt-core 1.x, so it never goes into the dbt
// environment (settings.pythonPath) and never touches settings.dbtPath.

interface EnvMarker {
  pythonVersion: string;
  dbtChartsVersion: string;
  extras: string[];
}

const PIP_INSTALL_PHASE_MARKER = 'Installing collected packages';
const VALIDATE_TIMEOUT_MS = 60_000;
const PARSE_TIMEOUT_MS = 5 * 60_000;
const VERSION_PATTERN = /(\d+\.\d+\.\d+\S*)/;

const rootDir = () => path.join(app.getPath('userData'), 'dbt-charts');
const venvDir = () => path.join(rootDir(), 'venv');
const markerPath = () => path.join(rootDir(), 'env.json');
const dctBin = () =>
  process.platform === 'win32'
    ? path.join(venvDir(), 'Scripts', 'dct.exe')
    : path.join(venvDir(), 'bin', 'dct');

const lastLines = (text: string, count = 8) =>
  text
    .split(/\r?\n/)
    .map((line) => line.trimEnd())
    .filter(Boolean)
    .slice(-count);

const readMarker = async (): Promise<EnvMarker | null> => {
  try {
    const data = await fs.readJson(markerPath());
    if (
      typeof data?.pythonVersion === 'string' &&
      typeof data?.dbtChartsVersion === 'string' &&
      Array.isArray(data?.extras)
    ) {
      return data as EnvMarker;
    }
  } catch {
    // No marker: not installed.
  }
  return null;
};

// Resolves a project file and rejects anything outside the project's
// charts/ folder, including symlinks that point elsewhere.
const resolveChartsFile = async (
  projectPath: string,
  filePath: string,
): Promise<string> => {
  const absolute = path.isAbsolute(filePath)
    ? filePath
    : path.join(projectPath, filePath);
  if (!isChartsBoardPath(projectPath, absolute)) {
    throw new Error(
      'Only .yml files under the project charts/ folder can be validated.',
    );
  }
  const [realProject, realFile] = await Promise.all([
    fs.realpath(projectPath),
    fs.realpath(absolute),
  ]);
  const realCharts = path.join(realProject, CHARTS_DIR) + path.sep;
  if (!realFile.startsWith(realCharts)) {
    throw new Error('The file resolves outside the project charts/ folder.');
  }
  return absolute;
};

export class DbtChartsService {
  private static statusCache: DbtChartsStatus | null = null;

  static getDctBin(): string {
    return dctBin();
  }

  static async getStatus(): Promise<DbtChartsStatus> {
    if (this.statusCache) return this.statusCache;
    const marker = await readMarker();
    const installed =
      !!marker &&
      marker.dbtChartsVersion === DBT_CHARTS_VERSION &&
      (await fs.pathExists(dctBin()));
    const status: DbtChartsStatus = {
      installed,
      version: installed ? marker!.dbtChartsVersion : null,
      pythonVersion: marker?.pythonVersion ?? null,
      extras: installed ? marker!.extras : [],
    };
    this.statusCache = status;
    return status;
  }

  static async getProjectState(
    projectPath: string,
  ): Promise<ProjectChartsState> {
    const [status, adapter, manifestExists, hasChartsDir, hasConfig] =
      await Promise.all([
        this.getStatus(),
        readTargetAdapterType(projectPath),
        fs.pathExists(path.join(projectPath, 'target', 'manifest.json')),
        fs.pathExists(path.join(projectPath, CHARTS_DIR)),
        fs.pathExists(path.join(projectPath, 'dbt_charts.yml')),
      ]);
    let support = extraForAdapter(adapter);
    if (
      support.supported &&
      process.platform === 'win32' &&
      process.arch === 'arm64'
    ) {
      support = {
        supported: false,
        reason: 'dbt Charts has no Windows on ARM build yet.',
      };
    }
    const extraInstalled =
      status.installed &&
      (!support.extra || status.extras.includes(support.extra));
    return {
      installed: status.installed,
      adapter,
      support,
      extraInstalled,
      manifestExists,
      hasChartsDir,
      hasConfig,
    };
  }

  /**
   * Installs dbt-charts (plus the project's adapter extra) into its own
   * venv. Runs inside an install task; `signal` stops pip while it is still
   * downloading.
   */
  static async install({
    projectPath,
    signal,
    markUnsafeToStop,
  }: {
    projectPath?: string;
    signal?: AbortSignal;
    markUnsafeToStop?: () => void;
  }): Promise<DbtChartsStatus> {
    const emit = (line: string) =>
      broadcastToRenderers('dbt-charts:installLine', { line });

    let python: string;
    try {
      python = await PythonRuntimesService.requireBinary(DBT_CHARTS_PYTHON);
    } catch {
      emit(`Downloading Python ${DBT_CHARTS_PYTHON}…`);
      await PythonRuntimesService.installRuntime(DBT_CHARTS_PYTHON);
      python = await PythonRuntimesService.requireBinary(DBT_CHARTS_PYTHON);
    }

    const marker = await readMarker();
    const venvPython = resolveVenvPython(venvDir());
    const venvUsable =
      marker?.pythonVersion === DBT_CHARTS_PYTHON &&
      (await fs.pathExists(venvPython));
    if (!venvUsable) {
      await fs.remove(rootDir());
      await fs.ensureDir(rootDir());
      emit('Creating the dbt Charts environment…');
      const created = await runProcess(python, ['-m', 'venv', venvDir()], {
        timeoutMs: 120_000,
        signal,
      });
      if (created.code !== 0) {
        throw new Error(
          lastLines(`${created.stdout}\n${created.stderr}`).join('\n') ||
            'Could not create the dbt Charts environment.',
        );
      }
    }
    // Only a marker for the pinned version counts; anything else reinstalls.
    await fs.remove(markerPath());
    this.statusCache = null;

    const wanted = new Set(
      marker?.dbtChartsVersion === DBT_CHARTS_VERSION ? marker.extras : [],
    );
    if (projectPath) {
      const support = extraForAdapter(await readTargetAdapterType(projectPath));
      if (support.extra) wanted.add(support.extra);
    }
    const extras = Array.from(wanted).sort();
    const spec = extras.length
      ? `dbt-charts[${extras.join(',')}]==${DBT_CHARTS_VERSION}`
      : `dbt-charts==${DBT_CHARTS_VERSION}`;

    emit(`pip install ${spec}`);
    const pip = await runProcess(
      venvPython,
      [
        '-m',
        'pip',
        'install',
        '--disable-pip-version-check',
        '--no-input',
        '--progress-bar',
        'off',
        spec,
      ],
      {
        env: { PYTHONUNBUFFERED: '1' },
        signal,
        onLine: (line) => {
          if (line.includes(PIP_INSTALL_PHASE_MARKER)) markUnsafeToStop?.();
          emit(line);
        },
      },
    );
    if (pip.code !== 0) {
      throw new Error(
        lastLines(`${pip.stdout}\n${pip.stderr}`).join('\n') ||
          `pip install exited with code ${pip.code}`,
      );
    }

    const version = await runProcess(dctBin(), ['--version'], {
      timeoutMs: 60_000,
      env: { DO_NOT_TRACK: '1' },
    });
    const found = VERSION_PATTERN.exec(`${version.stdout} ${version.stderr}`);
    if (version.code !== 0 || !found || found[1] !== DBT_CHARTS_VERSION) {
      throw new Error(
        `Expected dbt-charts ${DBT_CHARTS_VERSION}, found ${found?.[1] ?? 'nothing'}.`,
      );
    }

    await fs.writeJson(markerPath(), {
      pythonVersion: DBT_CHARTS_PYTHON,
      dbtChartsVersion: DBT_CHARTS_VERSION,
      extras,
    } satisfies EnvMarker);
    this.statusCache = null;
    emit(`dbt Charts ${DBT_CHARTS_VERSION} is installed.`);
    return this.getStatus();
  }

  /** `dbt parse` with the project's dbt, so dct has target/manifest.json. */
  static async runParse(projectPath: string): Promise<ChartsParseResult> {
    const settings = await SettingsService.loadSettings();
    if (!settings.dbtPath) {
      return {
        ok: false,
        lines: ['dbt is not installed. Set it up in Settings.'],
      };
    }
    const { env, secrets } = await buildDbtChartsEnv(projectPath);
    const redact = createRedactor(secrets);
    try {
      const result = await runProcess(settings.dbtPath, ['parse'], {
        cwd: projectPath,
        env,
        timeoutMs: PARSE_TIMEOUT_MS,
      });
      if (result.code === 0) return { ok: true, lines: [] };
      return {
        ok: false,
        lines: lastLines(redact(`${result.stdout}\n${result.stderr}`)),
      };
    } catch (error) {
      return {
        ok: false,
        lines: [redact(error instanceof Error ? error.message : String(error))],
      };
    }
  }

  static async ensureServer(projectPath: string): Promise<ChartsServerStatus> {
    // A stop (or a start for another project) while this one is still
    // checking or running dbt parse cancels it.
    const generation = serverGeneration();
    const superseded = () => serverGeneration() !== generation;
    const state = await this.getProjectState(projectPath);
    if (!state.support.supported) {
      throw new Error(state.support.reason ?? 'This project is not supported.');
    }
    if (!state.extraInstalled) {
      throw new Error('Install dbt Charts first.');
    }
    const running = readServerStatus(projectPath);
    if (running.state === 'running') return running;
    if (superseded()) return pendingServerStatus(projectPath);

    if (!state.manifestExists && running.state !== 'starting') {
      publishServerStatus({ projectPath, state: 'parsing' });
      appendServerLog(projectPath, [
        '$ dbt parse   (target/manifest.json is missing)',
      ]);
      const parsed = await this.runParse(projectPath);
      appendServerLog(
        projectPath,
        parsed.ok ? ['dbt parse finished.'] : parsed.lines,
      );
      // Stop was pressed while dbt parse ran: don't start the server.
      if (superseded()) return pendingServerStatus(projectPath);
      if (!parsed.ok) {
        const failed: ChartsServerStatus = {
          projectPath,
          state: 'parse-failed',
          lines: parsed.lines,
          error: 'dbt parse failed.',
        };
        publishServerStatus(failed);
        return failed;
      }
    }

    const { env, secrets } = await buildDbtChartsEnv(projectPath);
    if (superseded()) return pendingServerStatus(projectPath);
    return ensureServerProcess({
      projectPath,
      dctBin: dctBin(),
      env,
      redact: createRedactor(secrets),
    });
  }

  static getServerStatus(projectPath: string): ChartsServerStatus {
    return readServerStatus(projectPath);
  }

  /** Stop from the CHARTS SERVER tab: board tabs then wait for Start. */
  static async stopServer({ force }: { force?: boolean } = {}): Promise<void> {
    await stopServerProcess({ force, byUser: true });
  }

  static async restartServer(projectPath: string): Promise<ChartsServerStatus> {
    await stopServerProcess();
    return this.ensureServer(projectPath);
  }

  static getServerLog(projectPath: string): string[] {
    return readServerLog(projectPath);
  }

  static clearServerLog(): void {
    clearServerLogLines();
  }

  /**
   * `dct validate --json` for one board (offline, no warehouse). A partial
   * or meta.yml is checked through the whole charts/ folder, keeping the
   * findings that point at it.
   */
  static async validate({
    projectPath,
    filePath,
  }: {
    projectPath: string;
    filePath: string;
  }): Promise<ChartsValidationResult> {
    const status = await this.getStatus();
    if (!status.installed) {
      throw new Error(
        'dbt Charts is not installed. Click "Install dbt Charts" in a charts/ file.',
      );
    }
    const absolute = await resolveChartsFile(projectPath, filePath);
    const relative = chartsRelativePath(projectPath, absolute) ?? filePath;
    const partial = isChartsPartial(absolute);
    const target = partial ? CHARTS_DIR : relative;

    const { env, secrets } = await buildDbtChartsEnv(projectPath);
    const redact = createRedactor(secrets);
    try {
      const result = await runProcess(
        dctBin(),
        ['validate', target, '--json', '--project-dir', projectPath],
        { cwd: projectPath, env, timeoutMs: VALIDATE_TIMEOUT_MS },
      );
      const parsed = parseValidateJson(
        result.stdout,
        redact(lastLines(result.stderr).join('\n')),
        result.code,
      );
      // A board keeps findings from the partials it imports (they explain
      // why it fails); a partial keeps only its own.
      return partial ? diagnosticsForFile(parsed, relative) : parsed;
    } catch (error) {
      return parseValidateJson(
        '',
        redact(error instanceof Error ? error.message : String(error)),
        null,
      );
    }
  }
}

export default DbtChartsService;
