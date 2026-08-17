import { ipcMain, BrowserWindow, app } from 'electron';
import path from 'path';
import fs from 'fs-extra';
import { ProcessAdapter } from '../adapters';
import { TaskManagerService, SettingsService } from '../services';

// Separate ProcessAdapter instance (own 'runner:*' channels) so a pipeline
// run never collides with the shared 'process:*' slot used by "Serve Docs".
const runnerProcessAdapter = new ProcessAdapter('runner');

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
  workspaceDir: string;
  pipelineFile: string;
  runTeardown?: boolean;
}

const registerRunnerHandlers = (mainWindow: BrowserWindow) => {
  removeRunnerIpcHandlers();

  ipcMain.handle(
    'runner:run',
    async (
      _event,
      { workspaceDir, pipelineFile, runTeardown = false }: RunPipelineRequest,
    ) => {
      const settings = await SettingsService.loadSettings();
      const binaryPath = settings.runnerPath;

      if (!binaryPath || !(await fs.pathExists(binaryPath))) {
        return {
          success: false,
          error: 'Local runner binary is not installed.',
        };
      }
      if (!workspaceDir || !pipelineFile) {
        return {
          success: false,
          error: 'workspaceDir and pipelineFile are required.',
        };
      }

      const taskId = `runner-${Date.now()}`;
      const logDir = path.join(app.getPath('userData'), 'runner-logs');
      await fs.mkdirp(logDir);
      const logFile = path.join(logDir, `${taskId}.log`);

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
        settings.dbtPath,
        settings.rosettaPath,
        settings.kisqlPath,
      ]
        .filter((toolPath): toolPath is string => Boolean(toolPath))
        .map((toolPath) => path.dirname(toolPath));
      if (toolDirs.length) {
        env.PATH = [...toolDirs, process.env.PATH].join(path.delimiter);
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

  app.on('before-quit', async () => {
    if (runnerProcessAdapter.isRunning()) {
      await runnerProcessAdapter.stop(true);
    }
  });

  app.on('window-all-closed', async () => {
    if (runnerProcessAdapter.isRunning()) {
      await runnerProcessAdapter.stop(true);
    }
  });
};

export default registerRunnerHandlers;
