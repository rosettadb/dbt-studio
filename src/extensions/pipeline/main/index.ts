import type {
  ExtensionMainApi,
  ExtensionMainModule,
} from '../../../extensionApi/main';
import { runInstallTask } from '../../../extensionApi/studioMain/installTask';
import { SettingsService } from '../../../extensionApi/studioMain/services';
import {
  loadPluginDefinitions,
  resolveProjectMacroDirs,
} from './pipelineShared';
import RunnerService from './runner.service';
import { registerRunnerHandlers, stopRunner } from './runnerHandlers';
import { registerPipelineTemplatesHandlers } from './pipelineTemplatesHandlers';
import { extractRequiredEnvVars, listPipelines } from './pipelineProjects';
import { pipelineToolset } from './pipelineToolset';

/**
 * Main-process half of the Pipelines extension: running a pipeline with the
 * local runner, the runner's plugins and tools, pipeline templates, and the
 * pipelines of a project.
 */
const activate = (api: ExtensionMainApi): void => {
  // Behind the splash screen: make sure the local runner is in place.
  api.startup.addTask({
    id: 'pipeline.runner-setup',
    run: async ({ setMessage }) => {
      await RunnerService.downloadRunnerForDevelopment(() =>
        setMessage('Downloading the local runner...'),
      );
      await RunnerService.copyBundledRunnerToUserData();
    },
  });

  registerRunnerHandlers(api);
  registerPipelineTemplatesHandlers(api);

  // The pipeline authoring tools of the project agent.
  api.projectAgent.addTools(pipelineToolset);

  // The plugins of the local runner, for the pipeline designer.
  api.ipc.handle('runner:plugins:manifest', async () => {
    return loadPluginDefinitions();
  });

  api.ipc.handle(
    'runner:plugins:macros',
    async (_event, projectPath: string) => {
      return resolveProjectMacroDirs(projectPath);
    },
  );

  api.ipc.handle('runner:requirements:check', async () => {
    return RunnerService.checkRequirements();
  });

  api.ipc.handle('runner:pyspark:install', async () => {
    return runInstallTask('install:pyspark', 'Installing PySpark', () =>
      SettingsService.installPackage('pyspark'),
    );
  });

  api.ipc.handle('runner:pyspark:uninstall', async () => {
    return runInstallTask('install:pyspark', 'Uninstalling PySpark', () =>
      SettingsService.uninstallPySpark(),
    );
  });

  // KiSQL (Kinetica CLI) handlers
  api.ipc.handle('kisql:check', async () => {
    return RunnerService.checkKisqlVersion();
  });

  api.ipc.handle('kisql:install', async () => {
    return runInstallTask('install:runner', 'Installing KiSQL', () =>
      RunnerService.installKisql(),
    );
  });

  api.ipc.handle('kisql:uninstall', async () => {
    return runInstallTask('install:runner', 'Uninstalling KiSQL', () =>
      RunnerService.uninstallKisql(),
    );
  });

  api.ipc.handle(
    'project:extractRequiredEnvVars',
    async (
      _event,
      body: { projectId: string; pipelineRelativePath?: string },
    ) => {
      return extractRequiredEnvVars(body.projectId, body.pipelineRelativePath);
    },
  );

  api.ipc.handle(
    'project:listPipelines',
    async (_event, body: { projectId: string }) => {
      return listPipelines(body.projectId);
    },
  );
};

// A pipeline that is still running is stopped when the extension stops,
// which includes Studio quitting.
const deactivate = (): Promise<void> => stopRunner();

export const pipelineMain: ExtensionMainModule = { activate, deactivate };
