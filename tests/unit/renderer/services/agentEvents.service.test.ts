import {
  normalizePipelineCloudRunRequest,
  normalizeProjectFileMutation,
  resolveProjectMutationPath,
  subscribeToAgentDbtCommandLifecycle,
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

  it('normalizes only successful, confirmation-gated cloud run intents', () => {
    expect(
      normalizePipelineCloudRunRequest({
        conversationId: 7,
        toolCallId: 'run-1',
        toolName: 'pipeline_cloud_request_run',
        result: {
          success: true,
          mutation: 'pipeline-cloud-run-requested',
          projectId: 'project-1',
          path: '.rosetta/ci.yml',
          pipelineFile: 'ci.yml',
          requiresUserConfirmation: true,
          runStarted: false,
        },
      }),
    ).toEqual({
      conversationId: 7,
      toolCallId: 'run-1',
      projectId: 'project-1',
      path: '.rosetta/ci.yml',
      pipelineFile: 'ci.yml',
      requiresUserConfirmation: true,
      runStarted: false,
    });

    expect(
      normalizePipelineCloudRunRequest({
        conversationId: 7,
        toolCallId: 'run-2',
        toolName: 'pipeline_cloud_request_run',
        result: {
          success: true,
          mutation: 'pipeline-cloud-run-requested',
          projectId: 'project-1',
          path: '.rosetta/ci.yml',
          pipelineFile: 'ci.yml',
          requiresUserConfirmation: true,
          runStarted: true,
        },
      }),
    ).toBeNull();
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

  it('emits Agent dbt start and failure lifecycle events', () => {
    let streamListener: ((payload: unknown) => void) | undefined;
    (window.electron.ipcRenderer.on as unknown as jest.Mock).mockImplementation(
      (channel, listener) => {
        if (channel === 'chat:message:stream-chunk') streamListener = listener;
        return jest.fn();
      },
    );
    const events: unknown[] = [];
    const unsubscribe = subscribeToAgentDbtCommandLifecycle((event) =>
      events.push(event),
    );

    streamListener?.({
      conversationId: 9,
      done: false,
      chunk: {
        type: 'tool-call',
        toolCallId: 'dbt-1',
        toolName: 'studio_cli_run_dbt',
        input: { command: 'run', select: 'customers' },
      },
    });
    streamListener?.({
      conversationId: 9,
      done: false,
      chunk: {
        type: 'tool-result',
        toolCallId: 'dbt-1',
        toolName: 'studio_cli_run_dbt',
        output: { ok: false, error: 'dbt failed' },
      },
    });

    expect(events).toEqual([
      {
        phase: 'started',
        conversationId: 9,
        toolCallId: 'dbt-1',
        toolName: 'studio_cli_run_dbt',
        args: { command: 'run', select: 'customers' },
      },
      {
        phase: 'finished',
        conversationId: 9,
        toolCallId: 'dbt-1',
        toolName: 'studio_cli_run_dbt',
        result: { ok: false, error: 'dbt failed' },
        failed: true,
        error: 'dbt failed',
      },
    ]);
    unsubscribe();
  });

  it('fails an unfinished Agent dbt command when the stream ends', () => {
    let streamListener: ((payload: unknown) => void) | undefined;
    (window.electron.ipcRenderer.on as unknown as jest.Mock).mockImplementation(
      (channel, listener) => {
        if (channel === 'chat:message:stream-chunk') streamListener = listener;
        return jest.fn();
      },
    );
    const events: unknown[] = [];
    subscribeToAgentDbtCommandLifecycle((event) => events.push(event));

    streamListener?.({
      conversationId: 10,
      done: false,
      chunk: {
        type: 'tool-call',
        toolCallId: 'dbt-unfinished',
        toolName: 'runDbtCommand',
        input: { command: 'test' },
      },
    });
    streamListener?.({ conversationId: 10, done: true, chunk: '' });

    expect(events[1]).toEqual({
      phase: 'finished',
      conversationId: 10,
      toolCallId: 'dbt-unfinished',
      toolName: 'runDbtCommand',
      failed: true,
      error: 'Agent dbt command ended without a tool result.',
    });
  });
});
