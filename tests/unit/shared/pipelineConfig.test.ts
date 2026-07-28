import {
  isReadablePipelineRelativePath,
  isWritablePipelineRelativePath,
  validatePipelineContent,
} from '../../../src/shared/pipelines/pipelineConfig';

const VALID_PIPELINE = `name: CI
jobs:
  - name: build
    steps:
      - name: Run models
        plugin: dbt@v1
        command: dbt run
`;

describe('shared pipeline config', () => {
  it('accepts the supported pipeline structure and warns about unknown fields', () => {
    expect(validatePipelineContent(VALID_PIPELINE)).toMatchObject({
      valid: true,
      warnings: [],
    });

    expect(
      validatePipelineContent(`${VALID_PIPELINE}custom_root_field: keep-me\n`),
    ).toMatchObject({
      valid: true,
      warnings: [expect.stringContaining('visual editor')],
    });
  });

  it('returns bounded structural and YAML errors', () => {
    expect(validatePipelineContent('name: CI\njobs: nope\n')).toMatchObject({
      valid: false,
      issues: [{ path: 'jobs' }],
    });
    expect(validatePipelineContent('name: [\n')).toEqual({
      valid: false,
      issues: [{ path: '$', message: 'Pipeline YAML could not be parsed' }],
      warnings: [],
    });
  });

  it('allows direct reads but restricts writes to direct .yml files', () => {
    expect(isReadablePipelineRelativePath('.rosetta/ci.yml')).toBe(true);
    expect(isReadablePipelineRelativePath('.rosetta/ci.yaml')).toBe(true);
    expect(isWritablePipelineRelativePath('.rosetta/ci.yml')).toBe(true);
    expect(isWritablePipelineRelativePath('.rosetta/ci.yaml')).toBe(false);
    expect(isWritablePipelineRelativePath('.rosetta/nested/ci.yml')).toBe(
      false,
    );
    expect(isWritablePipelineRelativePath('.rosetta/../ci.yml')).toBe(false);
    expect(isWritablePipelineRelativePath('/tmp/ci.yml')).toBe(false);
    expect(isReadablePipelineRelativePath('.rosetta/main.conf')).toBe(false);
  });
});
