import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';
import fsExtra from 'fs-extra';
import {
  buildProjectPipelineContext,
  createStudioPipelineTools,
} from '../../../../../src/main/services/ai/tools/studio/pipeline.tools';
import { createFilesystemTools } from '../../../../../src/main/services/ai/tools/filesystem.tools';

const VALID_PIPELINE = `name: CI
jobs:
  - name: build
    steps:
      - name: Run models
        plugin: dbt@v1
        command: dbt run
`;

const execute = async (
  tools: ReturnType<typeof createStudioPipelineTools>,
  name: keyof ReturnType<typeof createStudioPipelineTools>,
  input: Record<string, unknown>,
) => (tools[name] as any).execute(input, {});

describe('Project Agent pipeline tools', () => {
  let projectPath: string;

  beforeEach(async () => {
    projectPath = await fs.mkdtemp(
      path.join(os.tmpdir(), 'dbt-studio-pipeline-tools-'),
    );
  });

  afterEach(async () => {
    await fsExtra.remove(projectPath);
  });

  it('builds a bounded relative inventory without file bodies', async () => {
    await fs.mkdir(path.join(projectPath, '.rosetta'));
    await fs.writeFile(
      path.join(projectPath, '.rosetta', 'ci.yml'),
      VALID_PIPELINE,
    );

    const context = buildProjectPipelineContext(projectPath);
    expect(context).toContain('.rosetta/ci.yml');
    expect(context).not.toContain('Run models');
    expect(context).not.toContain(projectPath);
  });

  it('creates, reads, validates, and hash-guards pipeline writes', async () => {
    const tools = createStudioPipelineTools(projectPath);
    const created = await execute(tools, 'studio_pipeline_write', {
      path: '.rosetta/ci.yml',
      content: VALID_PIPELINE,
    });
    expect(created).toMatchObject({
      success: true,
      mutation: 'pipeline-file-written',
      path: '.rosetta/ci.yml',
      created: true,
    });

    const read = await execute(tools, 'studio_pipeline_read', {
      path: '.rosetta/ci.yml',
    });
    expect(read).toMatchObject({
      success: true,
      valid: true,
      content: VALID_PIPELINE,
    });
    expect(read.contentHash).toHaveLength(64);

    await expect(
      execute(tools, 'studio_pipeline_read', {
        path: 'ci.yml',
      }),
    ).resolves.toMatchObject({
      success: true,
      path: '.rosetta/ci.yml',
      content: VALID_PIPELINE,
    });

    await expect(
      execute(tools, 'studio_pipeline_read', {
        path: path.join(projectPath, '.rosetta', 'ci.yml'),
      }),
    ).resolves.toMatchObject({
      success: true,
      path: '.rosetta/ci.yml',
      content: VALID_PIPELINE,
    });

    await expect(
      execute(tools, 'studio_pipeline_write', {
        path: '.rosetta/ci.yml',
        content: VALID_PIPELINE.replace('CI', 'CI 2'),
      }),
    ).resolves.toMatchObject({
      success: false,
      error: expect.stringContaining('expectedContentHash'),
    });

    await fs.writeFile(
      path.join(projectPath, '.rosetta', 'ci.yml'),
      VALID_PIPELINE.replace('CI', 'External'),
    );
    await expect(
      execute(tools, 'studio_pipeline_write', {
        path: '.rosetta/ci.yml',
        content: VALID_PIPELINE.replace('CI', 'Agent'),
        expectedContentHash: read.contentHash,
      }),
    ).resolves.toMatchObject({ success: false, stale: true });
  });

  it('leaves an existing file unchanged after validation failure', async () => {
    const rosettaPath = path.join(projectPath, '.rosetta');
    const pipelinePath = path.join(rosettaPath, 'ci.yml');
    await fs.mkdir(rosettaPath);
    await fs.writeFile(pipelinePath, VALID_PIPELINE);
    const tools = createStudioPipelineTools(projectPath);
    const read = await execute(tools, 'studio_pipeline_read', {
      path: '.rosetta/ci.yml',
    });

    const result = await execute(tools, 'studio_pipeline_write', {
      path: '.rosetta/ci.yml',
      content: 'name: broken\njobs: nope\n',
      expectedContentHash: read.contentHash,
    });
    expect(result).toMatchObject({ success: false });
    await expect(fs.readFile(pipelinePath, 'utf8')).resolves.toBe(
      VALID_PIPELINE,
    );
  });

  it('rejects unsupported paths and symlinked pipeline files', async () => {
    const tools = createStudioPipelineTools(projectPath);
    await expect(
      execute(tools, 'studio_pipeline_write', {
        path: '.rosetta/ci.yaml',
        content: VALID_PIPELINE,
      }),
    ).resolves.toMatchObject({ success: false });
    await expect(
      execute(tools, 'studio_pipeline_read', {
        path: path.join(path.dirname(projectPath), 'outside.yml'),
      }),
    ).resolves.toMatchObject({ success: false });
    await expect(
      execute(tools, 'studio_pipeline_write', {
        path: '.rosetta/nested/ci.yml',
        content: VALID_PIPELINE,
      }),
    ).resolves.toMatchObject({ success: false });

    const outside = path.join(projectPath, 'outside.yml');
    const rosettaPath = path.join(projectPath, '.rosetta');
    await fs.writeFile(outside, VALID_PIPELINE);
    await fs.mkdir(rosettaPath);
    await fs.symlink(outside, path.join(rosettaPath, 'linked.yml'));
    await expect(
      execute(tools, 'studio_pipeline_read', {
        path: '.rosetta/linked.yml',
      }),
    ).resolves.toMatchObject({
      success: false,
      error: expect.stringContaining('symbolic links'),
    });
  });

  it('prevents generic filesystem writes from bypassing pipeline validation', async () => {
    const tools = createFilesystemTools(projectPath);
    const pipelinePath = path.join(projectPath, '.rosetta', 'ci.yml');
    const result = await (tools.writeFile as any).execute(
      { filePath: pipelinePath, content: VALID_PIPELINE },
      {},
    );

    expect(result).toMatchObject({
      success: false,
      error: expect.stringContaining('studio_pipeline_write'),
    });
    await expect(fs.stat(pipelinePath)).rejects.toMatchObject({
      code: 'ENOENT',
    });
  });
});
