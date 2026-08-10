import fs from 'fs';
import os from 'os';
import path from 'path';
import {
  buildProjectPipelineContext,
  createStudioPipelineTools,
  listProjectPipelines,
  PIPELINE_MAX_BYTES,
  PIPELINE_MAX_FILES,
  readProjectPipeline,
  resolvePipelineReadPath,
  validatePipelineContent,
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

    it('creates only the two read-only tool definitions', () => {
      expect(Object.keys(createStudioPipelineTools(projectPath))).toEqual([
        'studio_pipeline_list',
        'studio_pipeline_read',
      ]);
    });
  });
});
