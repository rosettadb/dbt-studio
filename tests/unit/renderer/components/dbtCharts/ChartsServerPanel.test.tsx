import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import type { Project } from '../../../../../src/types/backend';
import type {
  ChartsServerLogEvent,
  ChartsServerStatus,
} from '../../../../../src/shared/dbtCharts';

const statusFor: Record<string, ChartsServerStatus> = {};
const logFor: Record<string, string[]> = {};
let statusHandler: ((status: ChartsServerStatus) => void) | null = null;
let logHandler: ((event: ChartsServerLogEvent) => void) | null = null;
const stopChartsServer = jest.fn<Promise<void>, [boolean?]>(() =>
  Promise.resolve(),
);
const restartChartsServer = jest.fn((projectPath: string) =>
  Promise.resolve({ projectPath, state: 'running' } as ChartsServerStatus),
);
const clearChartsServerLog = jest.fn(() => Promise.resolve());

jest.mock('../../../../../src/renderer/services/dbtCharts.service', () => ({
  getChartsServerStatus: (projectPath: string) =>
    Promise.resolve(
      statusFor[projectPath] ?? { projectPath, state: 'stopped' },
    ),
  getChartsServerLog: (projectPath: string) =>
    Promise.resolve(logFor[projectPath] ?? []),
  subscribeToChartsServerStatus: (handler: typeof statusHandler) => {
    statusHandler = handler;
    return () => undefined;
  },
  subscribeToChartsServerLog: (handler: typeof logHandler) => {
    logHandler = handler;
    return () => undefined;
  },
  stopChartsServer: (force?: boolean) => stopChartsServer(force),
  restartChartsServer: (projectPath: string) =>
    restartChartsServer(projectPath),
  clearChartsServerLog: () => clearChartsServerLog(),
}));

jest.mock('../../../../../src/renderer/hooks', () => ({
  useAppContext: () => ({ openChatWithMessage: jest.fn() }),
}));

jest.mock(
  '../../../../../src/renderer/controllers/dbtCharts.controller',
  () => ({
    chartsErrorMessage: (error: unknown) => String(error),
  }),
);

jest.mock('react-toastify', () => ({ toast: { error: jest.fn() } }));

// eslint-disable-next-line import/first
import {
  chartsServerPanel,
  isChartsServerTabVisible,
} from '../../../../../src/renderer/components/dbtCharts/ChartsServerPanel';
// eslint-disable-next-line import/first
import { requestChartsServerPanelFocus } from '../../../../../src/renderer/components/dbtCharts/chartsServerStore';

const projectAt = (path: string) =>
  ({ id: path, name: 'shop', path }) as Project;

const { Component } = chartsServerPanel;
const HeaderActions = chartsServerPanel.HeaderActions!;

const flush = () =>
  act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });

const StateProbe: React.FC<{ project: Project }> = ({ project }) => {
  const { visible, activity } = chartsServerPanel.useState({ project });
  return (
    <div data-testid="probe">{`${visible ? 'visible' : 'hidden'}:${activity}`}</div>
  );
};

beforeEach(() => {
  stopChartsServer.mockClear();
  restartChartsServer.mockClear();
  clearChartsServerLog.mockClear();
});

describe('CHARTS SERVER terminal tab', () => {
  it('shows the status, pid and log main already has', async () => {
    const path = '/projects/running';
    statusFor[path] = {
      projectPath: path,
      state: 'running',
      url: 'http://127.0.0.1:9123',
      pid: 4242,
      startedAt: Date.now() - 65_000,
      command: 'dct serve --host 127.0.0.1 --port 9123 --project-dir /p',
    };
    logFor[path] = [
      '$ dct serve --host 127.0.0.1',
      '   URL: http://127.0.0.1:9123',
    ];

    render(<Component project={projectAt(path)} />);
    await flush();

    expect(screen.getByText('RUNNING')).toBeInTheDocument();
    expect(screen.getByText('PID: 4242')).toBeInTheDocument();
    expect(screen.getByText('1m 5s')).toBeInTheDocument();
    expect(screen.getByText('http://127.0.0.1:9123')).toBeInTheDocument();
    expect(
      screen.getByText(/URL: http:\/\/127\.0\.0\.1:9123/),
    ).toBeInTheDocument();
  });

  it('appends live lines, escapes markup and clears on reset', async () => {
    const path = '/projects/live';
    render(<Component project={projectAt(path)} />);
    await flush();

    act(() => {
      logHandler?.({ projectPath: path, lines: ['<b>not bold</b>'] });
      logHandler?.({ projectPath: '/projects/other', lines: ['elsewhere'] });
    });
    expect(screen.getByText('<b>not bold</b>')).toBeInTheDocument();
    expect(screen.queryByText('elsewhere')).not.toBeInTheDocument();

    act(() => {
      logHandler?.({ projectPath: path, lines: [], reset: true });
    });
    expect(screen.queryByText('<b>not bold</b>')).not.toBeInTheDocument();
  });

  it('uses the plain tab label; its actions sit right of the tab strip', () => {
    expect(chartsServerPanel.Label).toBeUndefined();
    expect(chartsServerPanel.label).toBe('CHARTS SERVER');
  });

  it('shows Restart and Stop while running, no × and no menu', async () => {
    const path = '/projects/menu';
    statusFor[path] = {
      projectPath: path,
      state: 'running',
      pid: 7,
      startedAt: Date.now(),
    };
    render(<HeaderActions project={projectAt(path)} />);
    await flush();

    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Start Server' }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Close charts server tab' }),
    ).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Stop Server' }));
    expect(stopChartsServer).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole('button', { name: 'Restart Server' }));
    expect(restartChartsServer).toHaveBeenCalledWith(path);
  });

  it('disables Start while the server starts, Stop stays available', async () => {
    const path = '/projects/starting';
    statusFor[path] = { projectPath: path, state: 'starting' };
    render(<HeaderActions project={projectAt(path)} />);
    await flush();

    expect(screen.getByRole('button', { name: 'Start Server' })).toBeDisabled();
    expect(
      screen.getByRole('button', { name: 'Stop Server' }),
    ).not.toBeDisabled();
    expect(
      screen.queryByRole('button', { name: 'Close charts server tab' }),
    ).not.toBeInTheDocument();
  });

  it('shows Start and × instead of Stop once the server is stopped', async () => {
    const path = '/projects/stopped';
    render(<HeaderActions project={projectAt(path)} />);
    await flush();
    act(() => {
      statusHandler?.({
        projectPath: path,
        state: 'stopped',
        userStopped: true,
      });
    });

    expect(
      screen.queryByRole('button', { name: 'Stop Server' }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Close charts server tab' }),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Start Server' }));
    expect(restartChartsServer).toHaveBeenCalledWith(path);
  });

  it('× after a crash hides the tab and keeps the log', async () => {
    const path = '/projects/close';
    statusFor[path] = {
      projectPath: path,
      state: 'crashed',
      error: 'dbt Charts stopped.',
    };
    logFor[path] = ['$ dct serve', '■ dct exited (code 1).'];
    render(
      <>
        <HeaderActions project={projectAt(path)} />
        <StateProbe project={projectAt(path)} />
      </>,
    );
    await flush();
    const probe = () => screen.getByTestId('probe').textContent ?? '';
    expect(probe().startsWith('visible:')).toBe(true);

    fireEvent.click(
      screen.getByRole('button', { name: 'Close charts server tab' }),
    );
    expect(probe().startsWith('hidden:')).toBe(true);
    expect(stopChartsServer).not.toHaveBeenCalled();
    expect(clearChartsServerLog).not.toHaveBeenCalled();

    // Show server log brings it back with the log.
    act(() => {
      requestChartsServerPanelFocus();
    });
    expect(probe().startsWith('visible:')).toBe(true);

    // Closed again, then the server restarts: shown again.
    fireEvent.click(
      screen.getByRole('button', { name: 'Close charts server tab' }),
    );
    expect(probe().startsWith('hidden:')).toBe(true);
    act(() => {
      statusHandler?.({ projectPath: path, state: 'starting' });
    });
    expect(probe().startsWith('visible:')).toBe(true);
  });

  it('is visible while running or with a log, and focus requests bump activity', async () => {
    const path = '/projects/visible';
    render(<StateProbe project={projectAt(path)} />);
    await flush();
    const before = screen.getByTestId('probe').textContent ?? '';
    expect(before.startsWith('hidden:')).toBe(true);

    act(() => {
      statusHandler?.({ projectPath: path, state: 'running' });
    });
    expect(
      screen.getByTestId('probe').textContent?.startsWith('visible:'),
    ).toBe(true);

    const activity = Number(before.split(':')[1]);
    act(() => {
      requestChartsServerPanelFocus();
    });
    expect(screen.getByTestId('probe').textContent).toBe(
      `visible:${activity + 1}`,
    );
  });

  it('keeps the tab after a stop or a crash until × closes it', () => {
    const at = (status: Partial<ChartsServerStatus>) =>
      ({
        projectPath: '/p',
        state: 'stopped',
        ...status,
      }) as ChartsServerStatus;

    expect(isChartsServerTabVisible(null, 0, false)).toBe(false);
    expect(isChartsServerTabVisible(at({ state: 'starting' }), 0, false)).toBe(
      true,
    );
    expect(isChartsServerTabVisible(at({ state: 'parsing' }), 0, false)).toBe(
      true,
    );
    expect(isChartsServerTabVisible(at({ state: 'running' }), 0, false)).toBe(
      true,
    );
    expect(isChartsServerTabVisible(at({ state: 'crashed' }), 3, false)).toBe(
      true,
    );
    expect(
      isChartsServerTabVisible(at({ state: 'parse-failed' }), 3, false),
    ).toBe(true);
    expect(isChartsServerTabVisible(at({ state: 'crashed' }), 0, false)).toBe(
      false,
    );
    expect(isChartsServerTabVisible(at({ userStopped: true }), 3, false)).toBe(
      true,
    );
    expect(isChartsServerTabVisible(at({ userStopped: true }), 0, true)).toBe(
      true,
    );
    expect(
      isChartsServerTabVisible(at({ userStopped: true }), 3, false, true),
    ).toBe(false);
    expect(
      isChartsServerTabVisible(at({ state: 'running' }), 3, false, true),
    ).toBe(false);
  });

  it('stays after Stop; × hides it until Show server log or a new start', async () => {
    const path = '/projects/reveal';
    statusFor[path] = { projectPath: path, state: 'running' };
    logFor[path] = ['$ dct serve'];
    render(
      <>
        <HeaderActions project={projectAt(path)} />
        <StateProbe project={projectAt(path)} />
      </>,
    );
    await flush();
    const probe = () => screen.getByTestId('probe').textContent ?? '';
    expect(probe().startsWith('visible:')).toBe(true);

    // Stopped by the user: the tab stays, now with Start and ×.
    act(() => {
      logHandler?.({
        projectPath: path,
        lines: ['■ dbt Charts server stopped.'],
      });
      statusHandler?.({
        projectPath: path,
        state: 'stopped',
        userStopped: true,
      });
    });
    expect(probe().startsWith('visible:')).toBe(true);

    fireEvent.click(
      screen.getByRole('button', { name: 'Close charts server tab' }),
    );
    expect(probe().startsWith('hidden:')).toBe(true);

    act(() => {
      requestChartsServerPanelFocus();
    });
    expect(probe().startsWith('visible:')).toBe(true);

    fireEvent.click(
      screen.getByRole('button', { name: 'Close charts server tab' }),
    );
    act(() => {
      statusHandler?.({ projectPath: path, state: 'starting' });
    });
    expect(probe().startsWith('visible:')).toBe(true);
  });
});
