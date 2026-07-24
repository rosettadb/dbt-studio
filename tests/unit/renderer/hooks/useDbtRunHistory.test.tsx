import { act, renderHook } from '@testing-library/react';
import { useDbtRunHistory } from '../../../../src/renderer/hooks/useDbtRunHistory';

describe('useDbtRunHistory', () => {
  const projectId = 'project-1';
  const storageKey = `dbt-studio:run-history:${projectId}`;

  beforeEach(() => {
    localStorage.clear();
  });

  it('recovers a running command left by an earlier renderer session', () => {
    localStorage.setItem(
      storageKey,
      JSON.stringify([
        {
          id: 'stale-run',
          projectId,
          projectName: 'Project',
          projectPath: '/projects/project-1',
          command: 'debug',
          fullCommand: 'dbt debug',
          status: 'running',
          startedAt: '2026-07-22T09:24:41.000Z',
          summary: { total: 0, success: 0, error: 0, warn: 0, skipped: 0 },
        },
      ]),
    );

    const { result } = renderHook(() => useDbtRunHistory(projectId));

    expect(result.current.history[0]).toMatchObject({
      id: 'stale-run',
      status: 'cancelled',
      errorMessage: 'Command was interrupted before completion.',
    });
    expect(JSON.parse(localStorage.getItem(storageKey) || '[]')[0].status).toBe(
      'cancelled',
    );
  });

  it('finishes successful commands that do not have an artifact', async () => {
    const { result } = renderHook(() => useDbtRunHistory(projectId));
    let runId = '';

    act(() => {
      runId = result.current.recordCommandStart({
        projectId,
        projectName: 'Project',
        projectPath: '/projects/project-1',
        command: 'deps',
        fullCommand: 'dbt deps',
      });
    });

    await act(async () => {
      await result.current.recordCommandFinished(runId, projectId);
    });

    expect(result.current.history[0]).toMatchObject({
      id: runId,
      status: 'success',
    });
    expect(result.current.history[0].completedAt).toBeDefined();
  });
});
