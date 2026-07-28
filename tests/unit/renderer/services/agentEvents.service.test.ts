import {
  normalizeProjectFileMutation,
  resolveProjectMutationPath,
} from '../../../../src/renderer/services/agentEvents.service';

describe('agent project file mutation normalization', () => {
  it('normalizes successful pipeline writes from the tool result', () => {
    expect(
      normalizeProjectFileMutation({
        conversationId: 1,
        toolCallId: 'tool-1',
        toolName: 'studio_pipeline_write',
        args: {
          path: '.rosetta/wrong.yml',
          content: 'not exposed by the mutation',
        },
        result: {
          success: true,
          mutation: 'pipeline-file-written',
          path: '.rosetta/ci.yml',
          bytesWritten: 10,
        },
        status: 'done',
      }),
    ).toEqual({
      conversationId: 1,
      toolCallId: 'tool-1',
      toolName: 'studio_pipeline_write',
      path: '.rosetta/ci.yml',
      kind: 'pipeline-file-written',
    });
  });

  it('ignores failed and unrelated tool results', () => {
    expect(
      normalizeProjectFileMutation({
        conversationId: 1,
        toolCallId: 'tool-1',
        toolName: 'studio_pipeline_write',
        args: { path: '.rosetta/ci.yml' },
        result: { success: false, error: 'invalid' },
        status: 'done',
      }),
    ).toBeNull();
    expect(
      normalizeProjectFileMutation({
        conversationId: 1,
        toolCallId: 'tool-2',
        toolName: 'readFile',
        args: { filePath: '/project/model.sql' },
        result: { success: true },
        status: 'done',
      }),
    ).toBeNull();
  });

  it('resolves relative paths inside the active project and rejects outsiders', () => {
    expect(resolveProjectMutationPath('/project', '.rosetta/ci.yml')).toBe(
      '/project/.rosetta/ci.yml',
    );
    expect(
      resolveProjectMutationPath('/project', '/project/models/a.sql'),
    ).toBe('/project/models/a.sql');
    expect(resolveProjectMutationPath('/project', '/other/a.sql')).toBeNull();
    expect(resolveProjectMutationPath('/project', '../other/a.sql')).toBeNull();
  });
});
