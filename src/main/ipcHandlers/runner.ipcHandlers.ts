import { ipcMain, BrowserWindow, app } from 'electron';
import path from 'path';
import fs from 'fs-extra';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { ProcessAdapter } from '../adapters';
import {
  TaskManagerService,
  SettingsService,
  RunnerService,
} from '../services';

// Separate ProcessAdapter instance (own 'runner:*' channels) so a pipeline
// run never collides with the shared 'process:*' slot used by "Serve Docs".
const runnerProcessAdapter = new ProcessAdapter('runner');
const execFileAsync = promisify(execFile);

const handlerChannels = ['runner:run', 'runner:stop', 'runner:status'];

const listenerChannels = [
  'runner:output',
  'runner:error',
  'runner:started',
  'runner:exit',
  'runner:done',
];

const removeRunnerIpcHandlers = () => {
  handlerChannels.forEach((channel) => {
    ipcMain.removeHandler(channel);
  });
  listenerChannels.forEach((channel) => {
    ipcMain.removeAllListeners(channel);
  });
};

interface RunPipelineRequest {
  taskId: string;
  workspaceDir: string;
  pipelineFile: string;
  runTeardown?: boolean;
}

let appListenersRegistered = false;
let isQuitting = false;

// registerRunnerHandlers runs once per window (main window, setup window),
// but these app-level listeners must only ever be attached once - otherwise
// they accumulate and stop() gets called multiple times on every quit.
const registerAppLifecycleListeners = () => {
  if (appListenersRegistered) return;
  appListenersRegistered = true;

  app.on('before-quit', (event) => {
    if (isQuitting || !runnerProcessAdapter.isRunning()) return;
    event.preventDefault();
    isQuitting = true;
    runnerProcessAdapter
      .stop(true)
      .then(() => app.quit())
      .catch(() => app.quit());
  });

  app.on('window-all-closed', () => {
    if (runnerProcessAdapter.isRunning()) {
      runnerProcessAdapter.stop(true).catch(() => {});
    }
  });
};

const registerRunnerHandlers = (mainWindow: BrowserWindow) => {
  removeRunnerIpcHandlers();
  registerAppLifecycleListeners();

  ipcMain.handle(
    'runner:run',
    async (
      _event,
      {
        taskId,
        workspaceDir,
        pipelineFile,
        runTeardown = false,
      }: RunPipelineRequest,
    ) => {
      const settings = await SettingsService.loadSettings();
      const binaryPath = settings.runnerPath;

      if (!binaryPath || !(await fs.pathExists(binaryPath))) {
        return {
          success: false,
          error: 'Local runner binary is not installed.',
        };
      }
      if (!taskId || !workspaceDir || !pipelineFile) {
        return {
          success: false,
          error: 'taskId, workspaceDir and pipelineFile are required.',
        };
      }

      try {
        const content = await fs.readFile(
          path.resolve(workspaceDir, pipelineFile),
          'utf8',
        );
        if (/\bplugin:\s*["']?pyspark@v1\b/.test(content)) {
          const java = await RunnerService.checkJavaRuntime();
          if (!java.available) {
            return {
              success: false,
              error: java.version
                ? `Java ${java.version} was found. PySpark requires Java 17 or newer.`
                : 'Java was not found. PySpark requires Java 17 or newer.',
            };
          }
        }
      } catch {
        // The runner reports missing or invalid pipeline files itself.
      }

      const logDir = path.join(app.getPath('userData'), 'runner-logs');
      await fs.mkdirp(logDir);
      // taskId is a deterministic id built from a filesystem path and may
      // contain '/', '\' or ':' - strip those before using it as a filename.
      const safeLogName = taskId.replace(/[^a-zA-Z0-9_-]/g, '_');
      const logFile = path.join(logDir, `${safeLogName}.log`);

      const env: Record<string, string> = {
        RUN_MODE: 'studio',
        WORKSPACE_DIR: workspaceDir,
        EXECUTION_MODE: 'pipeline',
        PIPELINE_FILE: pipelineFile,
        LOG_FILE: logFile,
        ROSETTA_RUN_TEARDOWN: runTeardown ? 'true' : 'false',
      };
      if (settings.runnerHome) {
        env.RUNNER_HOME = settings.runnerHome;
      }

      // In studio mode the dbt@v1/rosetta@v1 plugin scripts just call the
      // bare `dbt`/`rosetta` commands (no auto-install, no absolute-path
      // support) - so Studio's own managed installs, which live in a venv /
      // app-data dir rather than the system PATH, need to be put on PATH for
      // the runner's child process to find them.
      const toolDirs = [
        settings.pythonPath,
        settings.dbtPath,
        settings.rosettaPath,
        settings.kisqlPath,
      ]
        .filter((toolPath): toolPath is string => Boolean(toolPath))
        .map((toolPath) => path.dirname(toolPath));

      // On macOS, Electron's PATH often omits Homebrew directories because
      // the app is launched via launchd rather than a login shell. Add the
      // standard Homebrew prefixes so tools like terraform, git, and aws
      // that are installed via Homebrew are visible to the runner.
      const homebrewDirs =
        process.platform === 'darwin'
          ? [
              '/opt/homebrew/bin', // Apple Silicon
              '/usr/local/bin', // Intel
            ]
          : [];

      // Homebrew's versioned JDK is keg-only, so a system Java 11 can appear
      // first on PATH even when Java 17 is installed. Spark 4 requires 17+.
      if (process.platform === 'darwin') {
        const javaHomes = ['/opt/homebrew', '/usr/local'].map((prefix) =>
          path.join(
            prefix,
            'opt',
            'openjdk@17',
            'libexec',
            'openjdk.jdk',
            'Contents',
            'Home',
          ),
        );
        const installed = await Promise.all(
          javaHomes.map((javaHome) =>
            fs.pathExists(path.join(javaHome, 'bin', 'java')),
          ),
        );
        const javaHome = javaHomes.find((_, index) => installed[index]);
        if (javaHome) {
          env.JAVA_HOME = javaHome;
          toolDirs.unshift(path.join(javaHome, 'bin'));
        }
      }

      const basePath = process.env.PATH ?? '';
      const allDirs = [...toolDirs, ...homebrewDirs];
      if (allDirs.length) {
        env.PATH = [...allDirs, basePath].join(path.delimiter);
      }

      // The pip-installed spark-submit launcher calls find-spark-home, which
      // splits Studio's "Application Support" path when resolving SPARK_HOME.
      // Resolve it with the managed interpreter and pass it to Spark directly.
      if (settings.pythonPath && (await fs.pathExists(settings.pythonPath))) {
        try {
          const { stdout } = await execFileAsync(
            settings.pythonPath,
            [
              '-c',
              'import os, pyspark; print(os.path.dirname(pyspark.__file__))',
            ],
            { timeout: 5000 },
          );
          const sparkHome = stdout.trim();
          if (await fs.pathExists(path.join(sparkHome, 'bin', 'spark-class'))) {
            env.SPARK_HOME = sparkHome;
            env.PYSPARK_PYTHON = settings.pythonPath;
            env.PYSPARK_DRIVER_PYTHON = settings.pythonPath;
          }
        } catch {
          // PySpark is optional; other pipeline plugins still run normally.
        }
      }

      TaskManagerService.create({
        id: taskId,
        type: 'runner-pipeline',
        label: `Run pipeline: ${pipelineFile}`,
        cancellable: true,
      });
      TaskManagerService.registerCanceller(taskId, () => {
        runnerProcessAdapter.stop(true).catch(() => {});
      });

      try {
        runnerProcessAdapter.start(binaryPath, mainWindow, {
          args: [],
          cwd: workspaceDir,
          env,
          onDone: (result) => {
            if (result.success) {
              TaskManagerService.complete(taskId);
            } else {
              TaskManagerService.fail(
                taskId,
                result.errorMessage || `Runner exited with code ${result.code}`,
              );
            }
          },
        });
      } catch (err: any) {
        const message =
          err?.message || err?.toString() || 'Failed to start the runner';
        TaskManagerService.fail(taskId, message);
        return { success: false, error: message };
      }

      return { success: true, taskId, logFile };
    },
  );

  ipcMain.handle('runner:stop', async () => {
    return runnerProcessAdapter.stop(true);
  });

  ipcMain.handle('runner:status', () => {
    return runnerProcessAdapter.getStatus();
  });
};

export default registerRunnerHandlers;
