import { ipcMain, BrowserWindow, app } from 'electron';
import path from 'path';
import fs from 'fs-extra';
import yaml from 'js-yaml';
import { ProcessAdapter } from '../adapters';
import {
  TaskManagerService,
  SettingsService,
  RunnerService,
} from '../services';
import { getRunnerToolEnvironment } from '../services/runnerEnvironment';
import { discoverSparkHome } from '../services/sparkEnvironment';

// Separate ProcessAdapter instance (own 'runner:*' channels) so a pipeline
// run never collides with the shared 'process:*' slot used by "Serve Docs".
const runnerProcessAdapter = new ProcessAdapter('runner');

function usesPySpark(content: string): boolean {
  const pipeline = yaml.load(content) as {
    jobs?: { steps?: { plugin?: string }[] }[];
  } | null;
  return (
    Array.isArray(pipeline?.jobs) &&
    pipeline.jobs.some(
      (job) =>
        Array.isArray(job?.steps) &&
        job.steps.some((step) => step?.plugin === 'pyspark@v1'),
    )
  );
}

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

      const toolEnv = await getRunnerToolEnvironment(settings);
      try {
        // pipelineFile is relative to rosetta/pipelines/ (or the legacy
        // .rosetta/ folder), the same places ProjectsService.listPipelines
        // looks, in the same order.
        const pipelinePaths = [
          path.resolve(workspaceDir, 'rosetta', 'pipelines', pipelineFile),
          path.resolve(workspaceDir, '.rosetta', pipelineFile),
        ];
        const pipelinePathExists = await Promise.all(
          pipelinePaths.map((pipelinePath) => fs.pathExists(pipelinePath)),
        );
        const pipelinePath = pipelinePaths.find(
          (_, index) => pipelinePathExists[index],
        );
        const content = pipelinePath
          ? await fs.readFile(pipelinePath, 'utf8')
          : '';
        if (usesPySpark(content)) {
          if (!RunnerService.supportsPySpark(settings.runnerVersion)) {
            return {
              success: false,
              error:
                'PySpark requires runner 1.7.6 or newer. Upgrade the local runner in Settings.',
            };
          }
          const java = await RunnerService.checkJavaRuntime(toolEnv);
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
        ...toolEnv,
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

      // The pip-installed spark-submit launcher calls find-spark-home, which
      // splits Studio's "Application Support" path when resolving SPARK_HOME.
      // Locate it in the managed venv and pass it to Spark directly.
      if (settings.pythonPath && (await fs.pathExists(settings.pythonPath))) {
        const sparkHome = await discoverSparkHome(settings.pythonPath);
        if (sparkHome) {
          env.SPARK_HOME = sparkHome;
          env.PYSPARK_PYTHON = settings.pythonPath;
          env.PYSPARK_DRIVER_PYTHON = settings.pythonPath;
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
