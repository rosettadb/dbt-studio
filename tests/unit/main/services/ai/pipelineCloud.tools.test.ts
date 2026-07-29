import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';
import fsExtra from 'fs-extra';
import RosettaCloudService from '../../../../../src/main/services/rosettaCloud.service';
import SettingsService from '../../../../../src/main/services/settings.service';
import {
  createPipelineCloudTools,
  sanitizePipelineCloudLog,
} from '../../../../../src/main/services/ai/tools/studio/pipelineCloud.tools';
import { PIPELINE_PLUGIN_CATALOG } from '../../../../../src/shared/pipelines/pluginCatalog';

jest.mock('../../../../../src/main/services/settings.service');
jest.mock('../../../../../src/main/services/rosettaCloud.service');

const execute = async (
  tools: ReturnType<typeof createPipelineCloudTools>,
  name: keyof ReturnType<typeof createPipelineCloudTools>,
  input: Record<string, unknown> = {},
) => (tools[name] as any).execute(input, {});

describe('Project Agent pipeline cloud tools', () => {
  let projectPath: string;

  beforeEach(async () => {
    jest.resetAllMocks();
    projectPath = await fs.mkdtemp(
      path.join(os.tmpdir(), 'dbt-studio-pipeline-cloud-tools-'),
    );
    await fs.mkdir(path.join(projectPath, '.rosetta'));
    await fs.writeFile(
      path.join(projectPath, '.rosetta', 'ci.yml'),
      'name: CI\njobs: []\n',
    );
    (SettingsService.loadSettings as jest.Mock).mockResolvedValue({
      env: 'cloud',
    });
    (RosettaCloudService.isAuthenticated as jest.Mock).mockResolvedValue(true);
  });

  afterEach(async () => {
    await fsExtra.remove(projectPath);
  });

  it('returns the shared deterministic serializable plugin catalog', async () => {
    const tools = createPipelineCloudTools({
      project: {
        id: 'project-1',
        name: 'Project',
        path: projectPath,
        createdAt: '',
      },
      projectPath,
    });
    const result = await execute(tools, 'pipeline_plugins_list');
    expect(result.count).toBe(PIPELINE_PLUGIN_CATALOG.length);
    expect(result.plugins.map((plugin: { id: string }) => plugin.id)).toEqual(
      PIPELINE_PLUGIN_CATALOG.map((plugin) => plugin.id),
    );
    expect(JSON.parse(JSON.stringify(result))).toEqual(result);
  });

  it('uses the local action mapping and shapes status without commands', async () => {
    (RosettaCloudService.getActionStatus as jest.Mock).mockResolvedValue({
      steps: [
        {
          id: 'step-1',
          name: 'Build',
          status: 'success',
          plugin: 'dbt@v1',
          command: 'dbt run --password secret',
          working_dir: '/private/project',
          duration: 12,
        },
      ],
    });
    const tools = createPipelineCloudTools({
      project: {
        id: 'project-1',
        name: 'Project',
        path: projectPath,
        createdAt: '',
        pipelineRuns: { 'ci.yml': 'action-1' },
      },
      projectPath,
      activePipelinePath: '.rosetta/ci.yml',
    });
    const result = await execute(tools, 'pipeline_cloud_status', {});
    expect(result).toMatchObject({
      success: true,
      actionId: 'action-1',
      state: 'success',
      terminal: true,
      steps: [{ name: 'Build', status: 'success', plugin: 'dbt@v1' }],
    });
    expect(result.steps[0]).not.toHaveProperty('command');
    expect(result.steps[0]).not.toHaveProperty('working_dir');
    expect(RosettaCloudService.findActionForPipeline).not.toHaveBeenCalled();
  });

  it('sanitizes and bounds log credentials and control sequences', () => {
    const result = sanitizePipelineCloudLog(
      '\u001b[31mAuthorization: Bearer super-secret\u001b[0m password=hunter2',
    );
    expect(result.message).not.toContain('super-secret');
    expect(result.message).not.toContain('hunter2');
    expect(result.message).not.toContain('\u001b');
    expect(result.redacted).toBe(true);
  });

  it('fails closed in Local mode before cloud I/O', async () => {
    (SettingsService.loadSettings as jest.Mock).mockResolvedValue({
      env: 'local',
    });
    const tools = createPipelineCloudTools({
      project: {
        id: 'project-1',
        name: 'Project',
        path: projectPath,
        createdAt: '',
      },
      projectPath,
      activePipelinePath: '.rosetta/ci.yml',
    });
    await expect(
      execute(tools, 'pipeline_cloud_status'),
    ).resolves.toMatchObject({
      success: false,
      code: 'CLOUD_MODE_REQUIRED',
    });
    expect(RosettaCloudService.getActionStatus).not.toHaveBeenCalled();
    expect(RosettaCloudService.findActionForPipeline).not.toHaveBeenCalled();
  });

  it('returns a UI intent and never starts a cloud run', async () => {
    const tools = createPipelineCloudTools({
      project: {
        id: 'project-1',
        name: 'Project',
        path: projectPath,
        createdAt: '',
      },
      projectPath,
      activePipelinePath: '.rosetta/ci.yml',
    });
    await expect(
      execute(tools, 'pipeline_cloud_request_run'),
    ).resolves.toMatchObject({
      success: true,
      mutation: 'pipeline-cloud-run-requested',
      requiresUserConfirmation: true,
      runStarted: false,
    });
    expect(RosettaCloudService.pushProjectToCloud).not.toHaveBeenCalled();
  });
});
