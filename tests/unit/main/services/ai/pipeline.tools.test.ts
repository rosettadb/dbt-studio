import fs from 'fs';
import os from 'os';
import path from 'path';
import {
  buildProjectPipelineContext,
  createStudioPipelineTools,
  generateProjectPipeline,
  isProtectedPipelineWritePath,
  listProjectPipelines,
  PIPELINE_MAX_BYTES,
  PIPELINE_MAX_FILES,
  readProjectPipeline,
  resolvePipelineReadPath,
  validatePipelineContent,
  updateProjectPipeline,
} from '../../../../../src/main/services/ai/tools/studio/pipeline.tools';

jest.mock('ai', () => ({
  tool: jest.fn((definition) => definition),
}));

const VALID_PIPELINE = `name: "CI"
jobs:
  - name: "build"
    steps:
      - name: "Run models"
        plugin: "dbt@v1"
        command: "dbt run"
`;

const pipelineWithStep = (step: string) => `name: "Plugin test"
jobs:
  - name: "build"
    steps:
${step}
`;

describe('Project Agent pipeline read tools', () => {
  let projectPath: string;

  beforeEach(() => {
    projectPath = fs.mkdtempSync(path.join(os.tmpdir(), 'pipeline-tools-'));
  });

  afterEach(() => {
    fs.rmSync(projectPath, { recursive: true, force: true });
  });

  const writeProjectFile = (relativePath: string, content = VALID_PIPELINE) => {
    const absolutePath = path.join(projectPath, ...relativePath.split('/'));
    fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
    fs.writeFileSync(absolutePath, content, 'utf8');
    return absolutePath;
  };

  describe('path policy', () => {
    it('accepts nested canonical and legacy relative pipeline paths', () => {
      writeProjectFile('rosetta/pipelines/quality/nightly.yml');
      writeProjectFile('.rosetta/legacy.yaml');

      expect(
        resolvePipelineReadPath(
          projectPath,
          'rosetta\\pipelines\\quality\\nightly.yml',
        ),
      ).toMatchObject({
        success: true,
        relativePath: 'rosetta/pipelines/quality/nightly.yml',
        location: 'canonical',
      });
      expect(
        resolvePipelineReadPath(projectPath, '.rosetta/legacy.yaml'),
      ).toMatchObject({
        success: true,
        location: 'legacy',
      });
    });

    it.each([
      '../pipeline.yml',
      '/tmp/pipeline.yml',
      'models/schema.yml',
      'rosetta/pipelines/main.conf',
      'rosetta/pipelines/pipeline.YML',
      'rosetta/pipelines/../pipeline.yml',
      'rosetta/pipelines/pipeline.yml\0escape',
    ])('rejects invalid pipeline path %s', (candidate) => {
      expect(resolvePipelineReadPath(projectPath, candidate)).toMatchObject({
        success: false,
        code: 'INVALID_PATH',
      });
    });

    it('rejects symbolic-link ancestors', () => {
      const outside = fs.mkdtempSync(
        path.join(os.tmpdir(), 'pipeline-outside-'),
      );
      try {
        fs.mkdirSync(path.join(projectPath, 'rosetta'), { recursive: true });
        fs.symlinkSync(outside, path.join(projectPath, 'rosetta', 'pipelines'));
        expect(
          resolvePipelineReadPath(projectPath, 'rosetta/pipelines/linked.yml'),
        ).toMatchObject({ success: false, code: 'UNSAFE_PATH' });
      } finally {
        fs.rmSync(outside, { recursive: true, force: true });
      }
    });
  });

  describe('validation', () => {
    it('accepts the minimum contract and preserves unknown fields', () => {
      const content = `${VALID_PIPELINE.replace(
        '        command: "dbt run"\n',
        '        command: "dbt run"\n        custom_option: true\n',
      )}
custom_root:
  retained: true
`;
      expect(validatePipelineContent(content)).toEqual({
        valid: true,
        issues: [],
        warnings: [],
      });
    });

    it.each([
      ['', 'empty'],
      [
        '---\nname: one\njobs: []\n---\nname: two\njobs: []\n',
        'one YAML document',
      ],
      ['name: [unterminated', 'unexpected end'],
      [
        'name: CI\njobs:\n  - name: build\n    steps:\n      - name: run\n',
        'plugin',
      ],
      ['- name\n- jobs', 'object'],
    ])('rejects invalid YAML or structure', (content, expectedMessage) => {
      const result = validatePipelineContent(content);
      expect(result.valid).toBe(false);
      expect(
        result.issues
          .map((issue) => `${issue.path} ${issue.message}`)
          .join(' '),
      ).toMatch(new RegExp(expectedMessage, 'i'));
    });

    it('rejects oversized content before parsing', () => {
      const result = validatePipelineContent(
        'x'.repeat(PIPELINE_MAX_BYTES + 1),
      );
      expect(result).toMatchObject({ valid: false });
      expect(result.issues[0].message).toContain('byte limit');
    });

    it('returns YAML parse diagnostics without source excerpts', () => {
      const result = validatePipelineContent(
        'name: broken\njobs: [{ name: build\nsteps: []',
      );

      expect(result.valid).toBe(false);
      expect(result.issues[0].message).toMatch(/\(\d+:\d+\)$/u);
      expect(result.issues[0].message).not.toContain('\n');
      expect(result.issues[0].message).not.toContain('name: broken');
      expect(result.issues[0].message).not.toContain('^');
    });

    it.each([
      ['dbt@v1', '        command: dbt test\n'],
      ['rosetta@v1', '        command: rosetta apply -s bigquery\n'],
      ['terraform@v1', '        command: terraform plan\n'],
      ['command@v1', '        command: echo ready\n'],
      ['s3@v1', '        command: aws s3 ls\n'],
      ['kinetica_cli@v1', '        command: kisql --sql "SELECT 1"\n'],
    ])('accepts addable plugin %s for authoring', (plugin, fields) => {
      const content = pipelineWithStep(
        `      - name: plugin step\n        plugin: ${plugin}\n${fields}`,
      );
      expect(validatePipelineContent(content, { mode: 'generate' })).toEqual({
        valid: true,
        issues: [],
        warnings: [],
      });
    });

    it.each(['dbt run', 'dbt test', 'dbt compile', 'dbt debug'])(
      'treats %s as a dbt@v1 command rather than a plugin ID',
      (command) => {
        const content = pipelineWithStep(
          `      - name: dbt command\n        plugin: dbt@v1\n        command: ${command}\n`,
        );
        expect(
          validatePipelineContent(content, { mode: 'generate' }).valid,
        ).toBe(true);
      },
    );

    it('warns when reading unknown plugins and rejects introducing them', () => {
      const content = pipelineWithStep(
        '      - name: invented\n        plugin: dbt-test\n        custom: retained\n',
      );
      const read = validatePipelineContent(content);
      expect(read).toMatchObject({ valid: true, issues: [] });
      expect(read.warnings.join(' ')).toContain('Unknown plugin "dbt-test"');

      const generate = validatePipelineContent(content, { mode: 'generate' });
      expect(generate.valid).toBe(false);
      expect(generate.issues[0]).toMatchObject({
        path: 'jobs.0.steps.0.plugin',
      });
    });

    it('requires catalog fields and prevents new compatibility-only steps', () => {
      const missingCommand = pipelineWithStep(
        '      - name: missing command\n        plugin: command@v1\n',
      );
      expect(
        validatePipelineContent(missingCommand, { mode: 'generate' }).issues,
      ).toContainEqual({
        path: 'jobs.0.steps.0.command',
        message: 'command@v1 requires command',
      });

      const gitClone = pipelineWithStep(
        '      - name: clone\n        plugin: git_clone@v1\n        url: https://example.com/repo.git\n',
      );
      expect(validatePipelineContent(gitClone).valid).toBe(true);
      expect(
        validatePipelineContent(gitClone, { mode: 'generate' }).valid,
      ).toBe(false);
    });
  });

  describe('discovery and context', () => {
    it('lists recursively, sorts paths, and prefers canonical duplicates', async () => {
      writeProjectFile('.rosetta/shared.yml');
      writeProjectFile('.rosetta/legacy/only.yaml');
      writeProjectFile('rosetta/pipelines/shared.yaml');
      writeProjectFile('rosetta/pipelines/nested/nightly.yml');
      writeProjectFile('rosetta/pipelines/main.conf');
      writeProjectFile('rosetta/pipelines/ignored.txt');

      const result = await listProjectPipelines(projectPath);
      expect(result).toMatchObject({
        success: true,
        count: 3,
        truncated: false,
      });
      if (!result.success) throw new Error(result.error);
      expect(result.pipelines).toEqual([
        expect.objectContaining({
          path: '.rosetta/legacy/only.yaml',
          name: 'legacy/only',
          location: 'legacy',
        }),
        expect.objectContaining({
          path: 'rosetta/pipelines/nested/nightly.yml',
          name: 'nested/nightly',
          location: 'canonical',
        }),
        expect.objectContaining({
          path: 'rosetta/pipelines/shared.yaml',
          name: 'shared',
          location: 'canonical',
        }),
      ]);
    });

    it('returns an empty result when pipeline roots do not exist', async () => {
      await expect(listProjectPipelines(projectPath)).resolves.toEqual({
        success: true,
        count: 0,
        truncated: false,
        pipelines: [],
      });
    });

    it('caps the inventory and marks truncation', async () => {
      for (let index = 0; index <= PIPELINE_MAX_FILES; index += 1) {
        writeProjectFile(
          `rosetta/pipelines/pipeline-${String(index).padStart(3, '0')}.yml`,
        );
      }
      const result = await listProjectPipelines(projectPath);
      expect(result).toMatchObject({
        success: true,
        count: PIPELINE_MAX_FILES,
        truncated: true,
      });
    });

    it('builds bounded context without pipeline bodies or absolute paths', async () => {
      writeProjectFile(
        'rosetta/pipelines/untrusted-name.yml',
        `${VALID_PIPELINE}secret_body_marker: do-not-inject\n`,
      );
      const context = await buildProjectPipelineContext(projectPath);
      expect(context).toContain('"rosetta/pipelines/untrusted-name.yml"');
      expect(context).toContain('untrusted project data');
      expect(context).not.toContain('secret_body_marker');
      expect(context).not.toContain(projectPath);
    });

    it('describes the exact visual node and plugin authoring contract', async () => {
      const context = await buildProjectPipelineContext(projectPath);
      expect(context).toContain('node represents one YAML step');
      expect(context).toContain('Jobs group ordered step nodes');
      [
        'dbt@v1',
        'rosetta@v1',
        'terraform@v1',
        'command@v1',
        's3@v1',
        'kinetica_cli@v1',
      ].forEach((plugin) => expect(context).toContain(`\`${plugin}\``));
      expect(context).toContain('`plugin: dbt@v1`');
      expect(context).toContain('`dbt-run`');
      expect(context).toContain('are not plugin IDs');
      expect(context).toContain('`git_clone@v1`');
      expect(context).toContain('preserved unchanged');
    });
  });

  describe('read tool', () => {
    it('reads malformed content and returns validation plus a stable hash', async () => {
      const relativePath = 'rosetta/pipelines/broken.yml';
      writeProjectFile(relativePath, 'name: broken\njobs: nope\n');
      const first = await readProjectPipeline(projectPath, relativePath);
      const second = await readProjectPipeline(projectPath, relativePath);
      expect(first).toMatchObject({
        success: true,
        path: relativePath,
        valid: false,
        content: 'name: broken\njobs: nope\n',
      });
      if (!first.success || !second.success) throw new Error('read failed');
      expect(first.contentHash).toHaveLength(64);
      expect(first.contentHash).toBe(second.contentHash);
    });

    it('returns bounded failures without the absolute project path', async () => {
      const result = await readProjectPipeline(
        projectPath,
        'rosetta/pipelines/missing.yml',
      );
      expect(result).toMatchObject({ success: false, code: 'NOT_FOUND' });
      expect(JSON.stringify(result)).not.toContain(projectPath);
    });

    it('creates the two read and two Code-mode mutation definitions', () => {
      expect(Object.keys(createStudioPipelineTools(projectPath))).toEqual([
        'studio_pipeline_list',
        'studio_pipeline_read',
        'studio_pipeline_generate',
        'studio_pipeline_update',
      ]);
    });
  });

  describe('generate', () => {
    it('generates a validated nested canonical pipeline without overwriting', async () => {
      const relativePath = 'rosetta/pipelines/nested/generated.yml';
      const result = await generateProjectPipeline(
        projectPath,
        relativePath,
        VALID_PIPELINE,
      );
      expect(result).toMatchObject({
        success: true,
        mutation: 'pipeline-file-written',
        path: relativePath,
        created: true,
        linesAdded: expect.any(Number),
        linesRemoved: 0,
      });
      expect(
        fs.readFileSync(path.join(projectPath, relativePath), 'utf8'),
      ).toBe(VALID_PIPELINE);

      await expect(
        generateProjectPipeline(projectPath, relativePath, VALID_PIPELINE),
      ).resolves.toMatchObject({
        success: false,
        code: 'ALREADY_EXISTS',
      });
    });

    it('rejects legacy generation and invalid content before creating directories', async () => {
      await expect(
        generateProjectPipeline(
          projectPath,
          '.rosetta/new.yml',
          VALID_PIPELINE,
        ),
      ).resolves.toMatchObject({ success: false, code: 'INVALID_PATH' });
      await expect(
        generateProjectPipeline(
          projectPath,
          'rosetta/pipelines/new/deep/invalid.yml',
          'name: invalid\njobs: nope\n',
        ),
      ).resolves.toMatchObject({
        success: false,
        code: 'INVALID_PIPELINE',
      });
      expect(
        fs.existsSync(path.join(projectPath, 'rosetta', 'pipelines')),
      ).toBe(false);
    });

    it('does not delete a competing target when exclusive creation loses a race', async () => {
      const relativePath = 'rosetta/pipelines/race.yml';
      const absolutePath = path.join(projectPath, relativePath);
      const competingContent = `${VALID_PIPELINE}competing: true\n`;
      const originalOpenSync = fs.openSync.bind(fs);
      const openSpy = jest.spyOn(fs, 'openSync').mockImplementation(((
        candidate: fs.PathLike,
        flags: fs.OpenMode,
        mode?: fs.Mode,
      ) => {
        if (candidate === absolutePath && flags === 'wx') {
          fs.writeFileSync(absolutePath, competingContent, 'utf8');
          throw Object.assign(new Error('exists'), { code: 'EEXIST' });
        }
        return originalOpenSync(candidate, flags, mode);
      }) as typeof fs.openSync);
      try {
        await expect(
          generateProjectPipeline(projectPath, relativePath, VALID_PIPELINE),
        ).resolves.toMatchObject({
          success: false,
          code: 'ALREADY_EXISTS',
        });
        expect(fs.readFileSync(absolutePath, 'utf8')).toBe(competingContent);
      } finally {
        openSpy.mockRestore();
      }
    });

    it('returns a bounded filesystem code when exclusive creation is unsupported', async () => {
      const relativePath = 'rosetta/pipelines/unsupported.yml';
      const absolutePath = path.join(projectPath, relativePath);
      const originalOpenSync = fs.openSync.bind(fs);
      const openSpy = jest.spyOn(fs, 'openSync').mockImplementation(((
        candidate: fs.PathLike,
        flags: fs.OpenMode,
        mode?: fs.Mode,
      ) => {
        if (candidate === absolutePath && flags === 'wx') {
          throw Object.assign(new Error(`unsupported at ${absolutePath}`), {
            code: 'ENOTSUP',
          });
        }
        return originalOpenSync(candidate, flags, mode);
      }) as typeof fs.openSync);
      try {
        await expect(
          generateProjectPipeline(projectPath, relativePath, VALID_PIPELINE),
        ).resolves.toMatchObject({
          success: false,
          code: 'WRITE_FAILED',
          filesystemCode: 'ENOTSUP',
          error: 'Pipeline could not be generated (ENOTSUP)',
        });
      } finally {
        openSpy.mockRestore();
      }
      expect(fs.existsSync(absolutePath)).toBe(false);
    });

    it('removes its own target when post-create verification fails', async () => {
      const relativePath = 'rosetta/pipelines/verify-failure.yml';
      const absolutePath = path.join(projectPath, relativePath);
      const originalReadFileSync = fs.readFileSync.bind(fs);
      const readSpy = jest.spyOn(fs, 'readFileSync').mockImplementation(((
        candidate: fs.PathOrFileDescriptor,
        options?: any,
      ) => {
        if (candidate === absolutePath) return 'corrupted persisted bytes';
        return originalReadFileSync(candidate, options);
      }) as typeof fs.readFileSync);
      try {
        await expect(
          generateProjectPipeline(projectPath, relativePath, VALID_PIPELINE),
        ).resolves.toMatchObject({
          success: false,
          code: 'WRITE_FAILED',
        });
      } finally {
        readSpy.mockRestore();
      }
      expect(fs.existsSync(absolutePath)).toBe(false);
    });
  });

  describe('update', () => {
    it('updates canonical and legacy files using the read hash', async () => {
      const paths = ['rosetta/pipelines/current.yml', '.rosetta/legacy.yml'];
      await Promise.all(
        paths.map(async (relativePath) => {
          writeProjectFile(relativePath);
          const read = await readProjectPipeline(projectPath, relativePath);
          if (!read.success) throw new Error(read.error);
          const updated = VALID_PIPELINE.replace('"CI"', '"Updated"');
          const result = await updateProjectPipeline(
            projectPath,
            relativePath,
            updated,
            read.contentHash,
          );
          expect(result).toMatchObject({
            success: true,
            path: relativePath,
            created: false,
            linesAdded: expect.any(Number),
            linesRemoved: expect.any(Number),
            previousContent: VALID_PIPELINE,
          });
          expect(
            fs.readFileSync(path.join(projectPath, relativePath), 'utf8'),
          ).toBe(updated);
        }),
      );
    });

    it('rejects missing, invalid, and stale hashes without changing bytes', async () => {
      const relativePath = 'rosetta/pipelines/stale.yml';
      writeProjectFile(relativePath);
      const absolutePath = path.join(projectPath, relativePath);
      const original = fs.readFileSync(absolutePath, 'utf8');

      await expect(
        updateProjectPipeline(
          projectPath,
          relativePath,
          VALID_PIPELINE.replace('CI', 'Updated'),
          'bad-hash',
        ),
      ).resolves.toMatchObject({
        success: false,
        code: 'STALE_CONTENT',
        stale: true,
      });
      await expect(
        updateProjectPipeline(
          projectPath,
          relativePath,
          VALID_PIPELINE.replace('CI', 'Updated'),
          'a'.repeat(64),
        ),
      ).resolves.toMatchObject({
        success: false,
        code: 'STALE_CONTENT',
        stale: true,
      });
      expect(fs.readFileSync(absolutePath, 'utf8')).toBe(original);

      await expect(
        updateProjectPipeline(
          projectPath,
          'rosetta/pipelines/missing.yml',
          VALID_PIPELINE,
          'a'.repeat(64),
        ),
      ).resolves.toMatchObject({ success: false, code: 'NOT_FOUND' });
    });

    it('restores the original bytes when persisted verification fails', async () => {
      const relativePath = 'rosetta/pipelines/restore.yml';
      const absolutePath = writeProjectFile(relativePath);
      const read = await readProjectPipeline(projectPath, relativePath);
      if (!read.success) throw new Error(read.error);
      const originalReadFileSync = fs.readFileSync.bind(fs);
      let targetReads = 0;
      const readSpy = jest.spyOn(fs, 'readFileSync').mockImplementation(((
        candidate: fs.PathOrFileDescriptor,
        options?: any,
      ) => {
        if (candidate === absolutePath) {
          targetReads += 1;
          if (targetReads === 2) return 'corrupted persisted bytes';
        }
        return originalReadFileSync(candidate, options);
      }) as typeof fs.readFileSync);
      try {
        await expect(
          updateProjectPipeline(
            projectPath,
            relativePath,
            VALID_PIPELINE.replace('CI', 'Updated'),
            read.contentHash,
          ),
        ).resolves.toMatchObject({
          success: false,
          code: 'WRITE_FAILED',
          restored: true,
        });
      } finally {
        readSpy.mockRestore();
      }
      expect(fs.readFileSync(absolutePath, 'utf8')).toBe(VALID_PIPELINE);
    });

    it('preserves an existing unknown step but rejects changing or adding one', async () => {
      const relativePath = 'rosetta/pipelines/compatibility.yml';
      const existingUnknown = pipelineWithStep(
        '      - name: custom step\n        plugin: future@v2\n        custom_option: retained\n',
      );
      writeProjectFile(relativePath, existingUnknown);
      const read = await readProjectPipeline(projectPath, relativePath);
      if (!read.success) throw new Error(read.error);

      const preserved = existingUnknown.replace(
        'name: "Plugin test"',
        'name: "Renamed pipeline"',
      );
      await expect(
        updateProjectPipeline(
          projectPath,
          relativePath,
          preserved,
          read.contentHash,
        ),
      ).resolves.toMatchObject({
        success: true,
        warnings: [expect.stringContaining('preserved unchanged')],
      });

      const reread = await readProjectPipeline(projectPath, relativePath);
      if (!reread.success) throw new Error(reread.error);
      const changedUnknown = preserved.replace(
        'custom_option: retained',
        'custom_option: changed',
      );
      await expect(
        updateProjectPipeline(
          projectPath,
          relativePath,
          changedUnknown,
          reread.contentHash,
        ),
      ).resolves.toMatchObject({
        success: false,
        code: 'INVALID_PIPELINE',
        issues: [expect.objectContaining({ path: 'jobs.0.steps.0.plugin' })],
      });
      expect(
        fs.readFileSync(path.join(projectPath, relativePath), 'utf8'),
      ).toBe(preserved);
    });
  });

  describe('generic write protection policy', () => {
    it('recognizes canonical, legacy, nested, and symlink-alias targets', () => {
      const canonical = writeProjectFile('rosetta/pipelines/current.yml');
      const legacy = writeProjectFile('.rosetta/legacy.yaml');
      expect(isProtectedPipelineWritePath(projectPath, canonical)).toBe(true);
      expect(
        isProtectedPipelineWritePath(
          projectPath,
          path.join(projectPath, 'rosetta', 'Pipelines', 'current.yml'),
        ),
      ).toBe(true);
      expect(
        isProtectedPipelineWritePath(
          projectPath,
          path.join(projectPath, 'rosetta', 'pipelines', 'current.YML'),
        ),
      ).toBe(true);
      expect(isProtectedPipelineWritePath(projectPath, legacy)).toBe(true);
      expect(
        isProtectedPipelineWritePath(
          projectPath,
          path.join(projectPath, 'rosetta/pipelines/new/nested.yml'),
        ),
      ).toBe(true);
      expect(
        isProtectedPipelineWritePath(
          projectPath,
          path.join(projectPath, 'models/schema.yml'),
        ),
      ).toBe(false);

      const alias = path.join(projectPath, 'pipeline-alias');
      fs.symlinkSync(path.join(projectPath, 'rosetta', 'pipelines'), alias);
      expect(
        isProtectedPipelineWritePath(
          projectPath,
          path.join(alias, 'through-alias.yml'),
        ),
      ).toBe(true);
    });
  });
});
