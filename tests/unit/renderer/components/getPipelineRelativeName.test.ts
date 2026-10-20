import {
  getPipelineCloudFile,
  getPipelineRelativeName,
  getPipelineRelativePath,
} from '../../../../src/renderer/components/pipelineView/getPipelineRelativeName';

describe('getPipelineRelativeName', () => {
  const projectPath = '/projects/demo';

  it('strips the pipelines base dir and the yaml extension', () => {
    expect(
      getPipelineRelativeName(
        `${projectPath}/rosetta/pipelines/nightly.yml`,
        projectPath,
      ),
    ).toBe('nightly');
  });

  it('keeps nested folders so same-named pipelines do not collide', () => {
    expect(
      getPipelineRelativeName(
        `${projectPath}/rosetta/pipelines/test/test.yaml`,
        projectPath,
      ),
    ).toBe('test/test');
  });

  it('supports the legacy .rosetta location', () => {
    expect(
      getPipelineRelativeName(
        `${projectPath}/.rosetta/legacy.yml`,
        projectPath,
      ),
    ).toBe('legacy');
  });

  it('falls back to the bare filename outside known base dirs', () => {
    expect(
      getPipelineRelativeName(`${projectPath}/elsewhere/ci.yml`, projectPath),
    ).toBe('ci');
  });

  it('derives the runner path with the real extension and the cloud file as .yml', () => {
    const file = `${projectPath}/rosetta/pipelines/test/test.yaml`;
    expect(getPipelineRelativePath(file, projectPath)).toBe('test/test.yaml');
    expect(getPipelineCloudFile(file, projectPath)).toBe('test/test.yml');
  });
});
