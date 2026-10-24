import React from 'react';
import { render, screen } from '@testing-library/react';
import { TaskManagerSettings } from '../../../src/renderer/components/settings/TaskManagerSettings';
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

let mockTasks: TaskRecord[] = [];
jest.mock('../../../src/renderer/context/TaskManagerProvider', () => ({
  ...jest.requireActual('../../../src/renderer/context/TaskManagerProvider'),
  useTaskManager: () => ({
    tasks: mockTasks,
    cancel: jest.fn(),
    remove: jest.fn(),
    subscribe: jest.fn(),
    getTask: jest.fn(),
    stuckTaskIds: [],
  }),
}));

const task = (
  label: string,
  status: TaskRecord['status'],
  startedAt: number,
): TaskRecord => ({
  id: label,
  type: 'install:dbt',
  label,
  status,
  startedAt,
  cancellable: status === 'pending',
});

describe('TaskManagerSettings', () => {
  it('lists the running install first, then the queue in the order it runs', () => {
    // The provider hands tasks over newest first; queued tasks' startedAt is
    // when they joined the queue.
    mockTasks = [
      task('Installing dbt-kinetica', 'pending', 4),
      task('Installing dbt-databricks 1.12.4', 'pending', 3),
      task('Installing dbt-bigquery 1.11.2', 'running', 5),
      task('Installing dbt-redshift 1.11.1', 'pending', 2),
    ];
    render(<TaskManagerSettings />);

    const labels = screen
      .getAllByText(/^Installing /)
      .map((element) => element.textContent);
    expect(labels).toEqual([
      'Installing dbt-bigquery 1.11.2',
      'Installing dbt-redshift 1.11.1',
      'Installing dbt-databricks 1.12.4',
      'Installing dbt-kinetica',
    ]);
  });
});
