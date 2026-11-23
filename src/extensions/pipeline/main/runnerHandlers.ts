import { app } from 'electron';
import path from 'path';
import fs from 'fs-extra';
import { ProcessAdapter } from '../../../extensionApi/studioMain/adapters';
import {
  TaskManagerService,
  SettingsService,
} from '../../../extensionApi/studioMain/services';
import { getRunnerToolEnvironment } from './runnerEnvironment';
import { discoverSparkHome } from './sparkEnvironment';
import type { ExtensionMainApi } from '../../../extensionApi/main';

// Separate ProcessAdapter instance (own 'runner:*' channels) so a pipeline
// run never collides with the shared 'process:*' slot used by "Serve Docs".
const runnerProcessAdapter = new ProcessAdapter('runner');

interface RunPipelineRequest {
  taskId: string;
  workspaceDir: string;
  pipelineFile: string;
  runTeardown?: boolean;
}

/**
 * Stops a running pipeline. Called when the extension stops, which
 * includes Studio quitting.
 */
export const stopRunner = async (): Promise<void> => {
  if (runnerProcessAdapter.isRunning()) {
    await runnerProcessAdapter.stop(true);
  }
};

export const registerRunnerHandlers = (api: ExtensionMainApi): void => {
  api.ipc.handle(
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
      // The runner's output is streamed to the window that shows its logs.
      const mainWindow = api.windows.getMainWindow();
      if (!mainWindow) {
        return { success: false, error: 'The Studio window is not open.' };
      }

      const toolEnv = await getRunnerToolEnvironment(settings);
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

  api.ipc.handle('runner:stop', async () => {
    return runnerProcessAdapter.stop(true);
  });

  api.ipc.handle('runner:status', () => {
    return runnerProcessAdapter.getStatus();
  });
};
