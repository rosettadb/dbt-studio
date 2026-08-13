import fs from 'fs';
import os from 'os';
import path from 'path';
import { createFilesystemTools } from '../../../../../src/main/services/ai/tools/filesystem.tools';
import { createDbtTools } from '../../../../../src/main/services/ai/tools/dbt.tools';
import FileMutationRollbackService from '../../../../../src/main/services/ai/fileMutationRollback.service';

jest.mock('ai', () => ({
  tool: jest.fn((definition) => definition),
}));

jest.mock('../../../../../src/main/services/agent.service', () => ({
  __esModule: true,
  default: { currentAgentContext: null },
}));

jest.mock('../../../../../src/main/services/settings.service', () => ({
  __esModule: true,
  default: {},
}));

jest.mock('../../../../../src/main/services/dbtCoreVersion.service', () => ({
  DbtCoreVersionService: {},
}));

jest.mock('../../../../../src/main/services/secureStorage.service', () => ({
  __esModule: true,
  default: {},
}));

describe('Project Agent generic pipeline write guards', () => {
  let projectPath: string;

  beforeEach(() => {
    projectPath = fs.mkdtempSync(path.join(os.tmpdir(), 'pipeline-guards-'));
  });

  afterEach(() => {
    FileMutationRollbackService.clear();
    fs.rmSync(projectPath, { recursive: true, force: true });
  });

  it('blocks project-bound filesystem and dbt writes to pipeline paths', async () => {
    const targets = [
      path.join(projectPath, 'rosetta', 'pipelines', 'new.yml'),
      path.join(projectPath, '.rosetta', 'legacy.yaml'),
    ];
    const filesystemWrite = (
      createFilesystemTools(projectPath).writeFile as any
    ).execute;
    const dbtWrite = (createDbtTools(projectPath).writeDbtModel as any).execute;

    await Promise.all(
      targets.map(async (filePath) => {
        await expect(
          filesystemWrite({ filePath, content: 'blocked' }),
        ).resolves.toMatchObject({
          error: expect.stringContaining('studio_pipeline_generate'),
        });
        await expect(
          dbtWrite({ filePath, content: 'blocked' }),
        ).resolves.toMatchObject({
          error: expect.stringContaining('studio_pipeline_update'),
        });
      }),
    );

    targets.forEach((target) => expect(fs.existsSync(target)).toBe(false));
  });

  it('preserves ordinary project-bound writes', async () => {
    const markdownPath = path.join(projectPath, 'docs', 'notes.md');
    const schemaPath = path.join(projectPath, 'models', 'schema.yml');
    const filesystemWrite = (
      createFilesystemTools(projectPath).writeFile as any
    ).execute;
    const dbtWrite = (createDbtTools(projectPath).writeDbtModel as any).execute;

    await expect(
      filesystemWrite({ filePath: markdownPath, content: '# Notes\n' }),
    ).resolves.toMatchObject({ success: true, created: true });
    await expect(
      dbtWrite({ filePath: schemaPath, content: 'version: 2\n' }),
    ).resolves.toMatchObject({ success: true, created: true });

    const filesystemUpdate = await filesystemWrite({
      filePath: markdownPath,
      content: '# Updated\n',
    });
    const dbtUpdate = await dbtWrite({
      filePath: schemaPath,
      content: 'version: 3\n',
    });

    expect(filesystemUpdate).toMatchObject({
      success: true,
      created: false,
      mutationId: expect.any(String),
    });
    expect(dbtUpdate).toMatchObject({
      success: true,
      created: false,
      mutationId: expect.any(String),
    });
    expect(filesystemUpdate).not.toHaveProperty('previousContent');
    expect(dbtUpdate).not.toHaveProperty('previousContent');
    expect(fs.readFileSync(markdownPath, 'utf8')).toBe('# Updated\n');
    expect(fs.readFileSync(schemaPath, 'utf8')).toBe('version: 3\n');

    FileMutationRollbackService.restore(filesystemUpdate.mutationId);
    FileMutationRollbackService.restore(dbtUpdate.mutationId);
    expect(fs.readFileSync(markdownPath, 'utf8')).toBe('# Notes\n');
    expect(fs.readFileSync(schemaPath, 'utf8')).toBe('version: 2\n');
  });
});
