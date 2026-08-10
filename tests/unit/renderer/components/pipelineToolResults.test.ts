import {
  collectSuccessfulPipelineMutations,
  getSuccessfulPipelineMutation,
  isSuccessfulGenericFileWrite,
  refreshCleanPipelineDraft,
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

  it('keeps only generated files in the delete-backed changed-files flow', () => {
    expect(
      collectSuccessfulPipelineMutations('/projects/demo', [
        {
          toolName: 'studio_pipeline_generate',
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
          toolName: 'studio_pipeline_generate',
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
          toolName: 'studio_pipeline_update',
          status: 'done',
          result: {
            success: true,
            mutation: 'pipeline-file-written',
            path: 'rosetta/pipelines/existing.yml',
            linesAdded: 4,
            linesRemoved: 1,
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

  it('refreshes only a matching clean pipeline draft', () => {
    const cleanDraft = {
      path: '/projects/demo/rosetta/pipelines/nightly.yml',
      content: 'old',
      savedContent: 'old',
      isModified: false,
    };
    expect(
      refreshCleanPipelineDraft(cleanDraft, cleanDraft.path, 'agent update'),
    ).toEqual({
      ...cleanDraft,
      content: 'agent update',
      savedContent: 'agent update',
    });
    expect(
      refreshCleanPipelineDraft(
        { ...cleanDraft, content: 'draft', isModified: true },
        cleanDraft.path,
        'agent update',
      ),
    ).toEqual({ ...cleanDraft, content: 'draft', isModified: true });
    expect(
      refreshCleanPipelineDraft(
        cleanDraft,
        '/projects/demo/rosetta/pipelines/other.yml',
        'agent update',
      ),
    ).toBe(cleanDraft);
  });

  it('does not treat rejected generic writes as discardable files', () => {
    expect(
      isSuccessfulGenericFileWrite('writeFile', 'done', {
        error: 'Pipeline writes require the dedicated tool',
      }),
    ).toBe(false);
    expect(
      isSuccessfulGenericFileWrite('writeDbtModel', 'done', {
        success: true,
        bytesWritten: 20,
      }),
    ).toBe(true);
  });
});
