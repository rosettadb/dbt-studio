import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { toast } from 'react-toastify';
import { PythonSettings } from '../../../src/renderer/components/settings/PythonSettings';
import { INSTALL_CANCELLED_MESSAGE } from '../../../src/shared/installTasks';
import type { TaskRecord } from '../../../src/types/ipc';

// The settings components pull in the ESM-only markdown stack.
jest.mock('react-markdown', () => ({
  __esModule: true,
  default: ({ children }: { children?: React.ReactNode }) => (
    <div>{children}</div>
  ),
}));
jest.mock('remark-gfm', () => jest.fn());
jest.mock('rehype-raw', () => jest.fn());
jest.mock('rehype-highlight', () => jest.fn());
jest.mock('rehype-sanitize', () => jest.fn());

jest.mock('react-toastify', () => ({
  toast: { success: jest.fn(), error: jest.fn(), info: jest.fn() },
}));

// Captures the callbacks the page passes to its version check, install and
// uninstall calls.
const mockCallbacks: Record<string, any> = {};
jest.mock('../../../src/renderer/controllers', () => ({
  useCheckPythonVersions: (options: any) => {
    mockCallbacks.check = options;
    return { mutate: jest.fn(), isLoading: false };
  },
  useInstallPythonVersion: (options: any) => {
    mockCallbacks.install = options;
    return { mutate: jest.fn(), isLoading: false };
  },
  useUninstallPython: (options: any) => {
    mockCallbacks.uninstall = options;
    return { mutate: jest.fn(), isLoading: false };
  },
}));

jest.mock('../../../src/renderer/hooks/useIsTaskTypeActive', () => ({
  useIsTaskTypeActive: () => false,
}));

// Installs running or waiting in the task manager, which is not mounted here.
let mockActiveTasks: TaskRecord[] = [];
jest.mock('../../../src/renderer/hooks/useActiveInstallTasks', () => ({
  useActiveInstallTasks: () => mockActiveTasks,
}));

const task = (
  type: string,
  label: string,
  status: TaskRecord['status'],
): TaskRecord => ({
  id: label,
  type,
  label,
  status,
  startedAt: 1,
  cancellable: status === 'pending',
});

describe('PythonSettings popups', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockActiveTasks = [];
  });

  it('keeps the popups dev shows when an install finishes or fails', () => {
    render(<PythonSettings settings={{ pythonPath: '' } as any} />);

    mockCallbacks.install.onSuccess({ success: true, version: '3.12.0' });
    expect(toast.success).toHaveBeenCalledWith(
      'Python 3.12.0 installed successfully',
    );

    mockCallbacks.install.onError(new Error('network down'));
    expect(toast.error).toHaveBeenCalledWith(
      'Installation failed: network down',
    );
  });

  it('shows no failure popup for an install cancelled while queued', () => {
    render(<PythonSettings settings={{ pythonPath: '' } as any} />);

    mockCallbacks.install.onError(
      new Error(`Error invoking remote method: ${INSTALL_CANCELLED_MESSAGE}`),
    );
    mockCallbacks.uninstall.onError(new Error(INSTALL_CANCELLED_MESSAGE));
    expect(toast.error).not.toHaveBeenCalled();
  });

  it('tells you a switch cancels dbt installs and to install dbt Core first', () => {
    mockActiveTasks = [
      task('install:dbt', 'Installing dbt-snowflake', 'running'),
      task('install:dbt', 'Installing dbt-bigquery 1.11.2', 'pending'),
      task('install:flowfile', 'Installing Flowfile', 'pending'),
    ];
    render(
      <PythonSettings
        settings={
          {
            pythonPath: '/managed/venv/bin/python3',
            pythonVersion: '3.10.17',
          } as any
        }
      />,
    );
    act(() => {
      mockCallbacks.check.onSuccess({
        currentVersion: '3.10.17',
        currentPath: '/managed/venv/bin/python3',
        recommendedVersion: '3.10.17',
        availableVersions: [
          {
            version: '3.12.10',
            isRecommended: false,
            isNewer: true,
            isOlder: false,
          },
        ],
      });
    });

    fireEvent.click(screen.getByRole('button', { name: 'Upgrade' }));

    const question = screen.getByText(/Are you sure you want to switch/);
    expect(question).toHaveTextContent(
      '1 queued dbt install (dbt Core and adapters) will be cancelled and removed.',
    );
    expect(question).toHaveTextContent(
      '"Installing dbt-snowflake" is running now and finishes first; it will be removed with the old environment.',
    );
    expect(question).toHaveTextContent(
      '1 other queued install will run after the switch.',
    );
    expect(question).toHaveTextContent(
      'After the switch, install dbt Core first: adapters need dbt Core before they can be installed.',
    );
  });
});
