import React from 'react';
import { act, render } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from 'react-query';
import { toast } from 'react-toastify';
import { TaskManagerProvider } from '../../../../src/renderer/context/TaskManagerProvider';
import type { TaskEvent, TaskRecord } from '../../../../src/types/ipc';

jest.mock('react-toastify', () => ({
  toast: { warning: jest.fn(), success: jest.fn(), error: jest.fn() },
}));

// The task feed from the main process: `mockInitialTasks` is what the window
// finds when it loads, `emit` sends later task events.
let mockInitialTasks: TaskRecord[] = [];
let mockEventHandler: ((event: TaskEvent) => void) | undefined;
jest.mock('../../../../src/renderer/services', () => ({
  taskManagerService: {
    list: () => Promise.resolve(mockInitialTasks),
    onEvent: (handler: (event: TaskEvent) => void) => {
      mockEventHandler = handler;
      return () => undefined;
    },
    cancel: jest.fn(),
    remove: jest.fn(),
  },
}));

const MINUTE = 60 * 1000;

const install = (
  type: string,
  label: string,
  status: TaskRecord['status'] = 'running',
  startedAt = Date.now(),
): TaskRecord => ({
  id: label,
  type,
  label,
  status,
  startedAt,
  cancellable: false,
});

const emit = (task: TaskRecord) =>
  act(() => {
    mockEventHandler?.({ type: 'updated', task });
  });

const renderProvider = async () => {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <TaskManagerProvider>
        <div />
      </TaskManagerProvider>
    </QueryClientProvider>,
  );
  // Lets the initial task list load.
  await act(async () => {
    await Promise.resolve();
  });
};

describe('TaskManagerProvider long-running installs', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.clearAllMocks();
    mockInitialTasks = [];
    mockEventHandler = undefined;
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('shows one popup when Flowfile is still running after 30 minutes', async () => {
    await renderProvider();
    emit(install('install:flowfile', 'Installing Flowfile'));

    act(() => {
      jest.advanceTimersByTime(29 * MINUTE);
    });
    expect(toast.warning).not.toHaveBeenCalled();

    act(() => {
      jest.advanceTimersByTime(MINUTE);
    });
    expect(toast.warning).toHaveBeenCalledTimes(1);
    expect(toast.warning).toHaveBeenCalledWith(
      "Installing Flowfile is still running after 30 minutes and may be stuck. It can't be stopped safely right now; if it stays stuck, quit the app.",
    );

    // Later updates of the same install don't start a second timer.
    emit(install('install:flowfile', 'Installing Flowfile'));
    act(() => {
      jest.advanceTimersByTime(60 * MINUTE);
    });
    expect(toast.warning).toHaveBeenCalledTimes(1);
  });

  it('shows nothing when the install finishes before 30 minutes', async () => {
    await renderProvider();
    const sqlglot = install('install:sqlglot', 'Installing sqlglot');
    emit(sqlglot);

    act(() => {
      jest.advanceTimersByTime(10 * MINUTE);
    });
    emit({ ...sqlglot, status: 'completed' });
    act(() => {
      jest.advanceTimersByTime(30 * MINUTE);
    });
    expect(toast.warning).not.toHaveBeenCalled();
  });

  it('only watches installs with no time limit', async () => {
    await renderProvider();
    emit(install('install:dbt', 'Installing dbt-postgres 1.9.0'));
    emit(install('install:python', 'Installing Python 3.12.10'));

    act(() => {
      jest.advanceTimersByTime(45 * MINUTE);
    });
    expect(toast.warning).not.toHaveBeenCalled();
  });

  it('counts from when the install started, even if the window loads later', async () => {
    mockInitialTasks = [
      install(
        'install:app-update',
        'Downloading app update',
        'running',
        Date.now() - 29 * MINUTE,
      ),
    ];
    await renderProvider();

    act(() => {
      jest.advanceTimersByTime(MINUTE);
    });
    expect(toast.warning).toHaveBeenCalledTimes(1);
  });
});
