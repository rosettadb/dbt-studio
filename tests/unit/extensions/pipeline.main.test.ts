import fs from 'fs-extra';
import os from 'os';
import path from 'path';
import { app, ipcMain } from 'electron';
import { ExtensionHostMain } from '../../../src/extensionHost/main/ExtensionHost.main';
import { pipelineManifest } from '../../../src/extensions/pipeline/manifest.shared';
import { pipelineMain } from '../../../src/extensions/pipeline/main';
import RunnerService from '../../../src/extensions/pipeline/main/runner.service';
import { TaskManagerService } from '../../../src/main/services';

// Studio's side of the API, stubbed: only the extension is under test.
// The runner's process adapter is created when the extension's code loads,
// so the stand-in is made inside the mock and fetched from it below.
jest.mock('../../../src/main/adapters', () => {
  const adapter = {
    isRunning: jest.fn(() => false),
    stop: jest.fn(async () => undefined),
    start: jest.fn(),
    getStatus: jest.fn(),
  };
  return { ProcessAdapter: jest.fn(() => adapter), mockAdapter: adapter };
});
jest.mock('../../../src/main/services', () => ({
  SettingsService: {
    loadSettings: jest.fn(async () => ({ runnerPath: '/bin/runner' })),
    installPackage: jest.fn(),
    uninstallPySpark: jest.fn(),
  },
  TaskManagerService: {
    create: jest.fn(),
    registerCanceller: jest.fn(),
    complete: jest.fn(),
    fail: jest.fn(),
  },
  ProjectsService: {},
}));
jest.mock('../../../src/main/services/settings.service', () => ({
  __esModule: true,
  default: {},
}));
jest.mock('../../../src/main/services/pluginManifest.service', () => ({
  getPluginDefinitions: jest.fn(),
  loadPluginDefinitions: jest.fn(),
  resolveProjectMacroDirs: jest.fn(),
}));
jest.mock('../../../src/main/utils/installTask', () => ({
  downloadForInstall: jest.fn(),
  runInstallTask: jest.fn(),
}));
jest.mock('../../../src/extensions/pipeline/main/runner.service', () => ({
  __esModule: true,
  default: {
    downloadRunnerForDevelopment: jest.fn(async (onDownload: () => void) =>
      onDownload(),
    ),
    copyBundledRunnerToUserData: jest.fn(async () => undefined),
  },
}));
jest.mock('../../../src/extensions/pipeline/main/runnerEnvironment', () => ({
  getRunnerToolEnvironment: jest.fn(async () => ({})),
}));

const { mockAdapter } = jest.requireMock('../../../src/main/adapters') as {
  mockAdapter: {
    isRunning: jest.Mock;
    stop: jest.Mock;
    start: jest.Mock;
    getStatus: jest.Mock;
  };
};

let userData: string;

const startHost = async () => {
  const host = new ExtensionHostMain({ studioVersion: '1.7.8' });
  host.registerBuiltin(pipelineManifest, pipelineMain);
  await host.start();
  return host;
};

const handlerFor = (channel: string) => {
  const call = (ipcMain.handle as jest.Mock).mock.calls.find(
    ([registered]) => registered === channel,
  );
  if (!call) throw new Error(`No handler registered for ${channel}`);
  return call[1] as (...args: unknown[]) => Promise<any>;
};

beforeEach(() => {
  userData = fs.mkdtempSync(path.join(os.tmpdir(), 'studio-pipeline-'));
  (app.getPath as jest.Mock).mockReturnValue(userData);
  (ipcMain.handle as jest.Mock).mockClear();
  (ipcMain.removeHandler as jest.Mock).mockClear();
  Object.values(mockAdapter).forEach((mock) => mock.mockClear());
  mockAdapter.isRunning.mockReturnValue(false);
  (TaskManagerService.create as jest.Mock).mockClear();
});

afterEach(() => fs.removeSync(userData));

describe('Pipelines extension, main half', () => {
  it('answers the same channels the pipeline tool always used', async () => {
    const host = await startHost();

    expect(host.list()).toMatchObject([
      { id: 'rosetta.pipeline', state: 'active' },
    ]);
    expect(
      (ipcMain.handle as jest.Mock).mock.calls.map(([channel]) => channel),
    ).toEqual([
      'runner:run',
      'runner:stop',
      'runner:status',
      'pipeline-templates:list',
      'pipeline-templates:fetch-content',
      'pipeline-templates:apply-zip',
      'runner:plugins:manifest',
      'runner:plugins:macros',
      'runner:requirements:check',
      'runner:pyspark:install',
      'runner:pyspark:uninstall',
      'kisql:check',
      'kisql:install',
      'kisql:uninstall',
      'project:extractRequiredEnvVars',
      'project:listPipelines',
    ]);
  });

  it('puts the local runner in place while Studio starts', async () => {
    const host = await startHost();
    const setMessage = jest.fn(async () => undefined);

    await host.runStartupTasks(setMessage);

    expect(setMessage).toHaveBeenCalledWith('Downloading the local runner...');
    expect(RunnerService.copyBundledRunnerToUserData).toHaveBeenCalledTimes(1);
  });

  it('lets Studio start when the runner cannot be set up', async () => {
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
    (
      RunnerService.copyBundledRunnerToUserData as jest.Mock
    ).mockRejectedValueOnce(new Error('disk full'));
    const host = await startHost();

    await expect(host.runStartupTasks(jest.fn())).resolves.toBeUndefined();
  });

  it('refuses to run a pipeline while no window can show its logs', async () => {
    jest
      .spyOn(fs, 'pathExists')
      .mockImplementation((async () => true) as never);
    await startHost();

    const result = await handlerFor('runner:run')(
      {},
      { taskId: 't1', workspaceDir: '/p', pipelineFile: 'load.yml' },
    );

    expect(result).toEqual({
      success: false,
      error: 'The Studio window is not open.',
    });
    expect(TaskManagerService.create).not.toHaveBeenCalled();
    expect(mockAdapter.start).not.toHaveBeenCalled();
  });

  it('runs a pipeline with the local runner and streams it to the main window', async () => {
    jest
      .spyOn(fs, 'pathExists')
      .mockImplementation((async () => true) as never);
    const host = await startHost();
    const window = { isDestroyed: () => false };
    host.setMainWindow(window as never);

    const result = await handlerFor('runner:run')(
      {},
      { taskId: 't1', workspaceDir: '/p', pipelineFile: 'load.yml' },
    );

    expect(result).toMatchObject({ success: true, taskId: 't1' });
    expect(TaskManagerService.create).toHaveBeenCalledWith(
      expect.objectContaining({ id: 't1', type: 'runner-pipeline' }),
    );
    expect(mockAdapter.start).toHaveBeenCalledWith(
      '/bin/runner',
      window,
      expect.objectContaining({
        cwd: '/p',
        env: expect.objectContaining({
          EXECUTION_MODE: 'pipeline',
          PIPELINE_FILE: 'load.yml',
          WORKSPACE_DIR: '/p',
        }),
      }),
    );
  });

  it('stops a running pipeline and removes its handlers when the extension stops', async () => {
    const host = await startHost();
    mockAdapter.isRunning.mockReturnValue(true);

    await host.deactivateAll();

    expect(mockAdapter.stop).toHaveBeenCalledWith(true);
    expect(ipcMain.removeHandler).toHaveBeenCalledWith('runner:run');
    expect(ipcMain.removeHandler).toHaveBeenCalledWith('project:listPipelines');
  });
});
