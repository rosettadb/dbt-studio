import {
  collectSuccessfulPipelineMutations,
  getSuccessfulPipelineMutation,
  resolveProjectMutationPath,
} from '../../../../src/renderer/components/chat/pipelineToolResults';

describe('pipeline tool result presentation policy', () => {
  it('extracts only successful pipeline-file mutations', () => {
    expect(
      getSuccessfulPipelineMutation('studio_pipeline_generate', {
        success: true,
        mutation: 'pipeline-file-written',
        path: 'rosetta/pipelines/nested/new.yml',
        linesAdded: 12,
        linesRemoved: 0,
      }),
    ).toEqual({
      relativePath: 'rosetta/pipelines/nested/new.yml',
      added: 12,
      removed: 0,
    });
    expect(
      getSuccessfulPipelineMutation('studio_pipeline_update', {
        success: false,
        code: 'STALE_CONTENT',
        stale: true,
      }),
    ).toBeNull();
    expect(
      getSuccessfulPipelineMutation('writeFile', {
        success: true,
        path: 'rosetta/pipelines/new.yml',
      }),
    ).toBeNull();
  });

  it('resolves canonical and legacy paths inside the selected project', () => {
    expect(
      resolveProjectMutationPath(
        '/projects/demo',
        'rosetta/pipelines/nested/new.yml',
      ),
    ).toBe('/projects/demo/rosetta/pipelines/nested/new.yml');
    expect(
      resolveProjectMutationPath('/projects/demo', '.rosetta/legacy.yaml'),
    ).toBe('/projects/demo/.rosetta/legacy.yaml');
  });

  it.each([
    '../outside.yml',
    '/tmp/outside.yml',
    'rosetta/pipelines/../outside.yml',
    'models/not-a-pipeline.yml',
    'rosetta/pipelines/not-yaml.txt',
    'rosetta\\pipelines\\outside.yml',
  ])('rejects an untrusted mutation path: %s', (relativePath) => {
    expect(
      resolveProjectMutationPath('/projects/demo', relativePath),
    ).toBeNull();
  });

  it('keeps the latest successful mutation per contained path', () => {
    expect(
      collectSuccessfulPipelineMutations('/projects/demo', [
        {
          toolName: 'studio_pipeline_update',
          status: 'done',
          result: {
            success: true,
            mutation: 'pipeline-file-written',
            path: 'rosetta/pipelines/nightly.yml',
            linesAdded: 1,
            linesRemoved: 1,
          },
        },
        {
          toolName: 'studio_pipeline_update',
          status: 'done',
          result: {
            success: true,
            mutation: 'pipeline-file-written',
            path: 'rosetta/pipelines/nightly.yml',
            linesAdded: 3,
            linesRemoved: 2,
          },
        },
        {
          toolName: 'studio_pipeline_generate',
          status: 'done',
          result: { success: false, stale: true },
        },
        {
          toolName: 'studio_pipeline_generate',
          status: 'running',
          result: {
            success: true,
            mutation: 'pipeline-file-written',
            path: 'rosetta/pipelines/incomplete.yml',
          },
        },
      ]),
    ).toEqual([
      {
        path: '/projects/demo/rosetta/pipelines/nightly.yml',
        added: 3,
        removed: 2,
      },
    ]);
  });
});
