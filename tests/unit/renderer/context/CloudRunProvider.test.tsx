import React from 'react';
import { act, renderHook } from '@testing-library/react';
import {
  CloudRunProvider,
  useActiveCloudRun,
  useCloudRunActionId,
  useCloudRuns,
} from '../../../../src/renderer/context/CloudRunProvider';

const wrapper: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <CloudRunProvider>{children}</CloudRunProvider>
);

describe('CloudRunProvider', () => {
  it('starting a run makes it active and bumps startedSeq', () => {
    const { result } = renderHook(
      () => ({ runs: useCloudRuns(), active: useActiveCloudRun() }),
      { wrapper },
    );

    expect(result.current.active).toEqual({ run: null, startedSeq: 0 });

    act(() => {
      result.current.runs.publishStarted({
        actionId: 'a1',
        projectId: 'p1',
        pipelineFile: 'nightly.yml',
      });
    });

    expect(result.current.active.run?.actionId).toBe('a1');
    expect(result.current.active.startedSeq).toBe(1);
  });

  it('viewing a run changes the active run without bumping startedSeq', () => {
    const { result } = renderHook(
      () => ({ runs: useCloudRuns(), active: useActiveCloudRun() }),
      { wrapper },
    );

    act(() => {
      result.current.runs.publishStarted({ actionId: 'a1', projectId: 'p1' });
    });
    act(() => {
      result.current.runs.publishViewed({
        actionId: 'a2',
        projectId: 'p1',
        pipelineFile: 'other.yml',
      });
    });

    expect(result.current.active.run?.actionId).toBe('a2');
    expect(result.current.active.startedSeq).toBe(1);

    act(() => {
      result.current.runs.publishViewed(null);
    });
    expect(result.current.active.run).toBeNull();
  });

  it('subscribers keyed by pipeline see only their own run', () => {
    const { result } = renderHook(
      () => ({
        runs: useCloudRuns(),
        nightly: useCloudRunActionId('p1', 'nightly.yml'),
        other: useCloudRunActionId('p1', 'other.yml'),
        command: useCloudRunActionId('p1'),
      }),
      { wrapper },
    );

    act(() => {
      result.current.runs.publishStarted({
        actionId: 'a1',
        projectId: 'p1',
        pipelineFile: 'nightly.yml',
      });
      result.current.runs.publishStarted({ actionId: 'cmd', projectId: 'p1' });
    });

    expect(result.current.nightly).toBe('a1');
    expect(result.current.other).toBeNull();
    expect(result.current.command).toBe('cmd');
  });
});
