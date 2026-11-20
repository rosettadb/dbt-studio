import React from 'react';
import { act, render, screen, waitFor } from '@testing-library/react';
import { chartsFileView } from '../../../../../src/renderer/components/fileViews/ChartsFileView';
import type { EditorTabState } from '../../../../../src/types/editor';
import type { Project } from '../../../../../src/types/backend';

jest.mock('split-pane-react', () => {
  const Wrap = ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  );
  return { __esModule: true, default: Wrap, Pane: Wrap };
});

jest.mock('../../../../../src/renderer/components/editor', () => ({
  Editor: ({ extraActions }: { extraActions?: React.ReactNode }) => (
    <div data-testid="yaml-editor">{extraActions}</div>
  ),
}));

jest.mock(
  '../../../../../src/renderer/components/fileViews/CodeFileView',
  () => ({
    codeFileView: {
      id: 'code',
      matches: () => true,
      Component: () => <div data-testid="code-view" />,
    },
  }),
);

jest.mock('../../../../../src/renderer/context/TabsProvider', () => ({
  useTabs: () => ({
    updateTabContent: jest.fn(),
    markTabSaved: jest.fn(),
    setTabError: jest.fn(),
    openFile: jest.fn(),
  }),
}));

jest.mock('../../../../../src/renderer/context/TaskManagerProvider', () => ({
  useTaskManager: () => ({ tasks: [], cancel: jest.fn() }),
}));

jest.mock('../../../../../src/renderer/hooks/useRefreshProjectFiles', () => ({
  useRefreshProjectFiles: () => jest.fn(),
}));

jest.mock('../../../../../src/renderer/controllers', () => ({
  useGetSettings: () => ({ data: { dbtVersion: '1.10.0' } }),
}));

jest.mock(
  '../../../../../src/renderer/components/dbtCharts/useChartsMarkers',
  () => ({
    useChartsMarkers: jest.fn(),
  }),
);

let toolResultHandler: ((payload: any) => void) | null = null;
jest.mock('../../../../../src/renderer/services/agentEvents.service', () => ({
  subscribeToToolResult: (handler: (payload: any) => void) => {
    toolResultHandler = handler;
    return () => {
      toolResultHandler = null;
    };
  },
}));

const validate = jest.fn();
let validation: {
  diagnostics: unknown[];
  errorCount: number;
  warningCount: number;
} | null = null;

jest.mock(
  '../../../../../src/renderer/controllers/dbtCharts.controller',
  () => ({
    chartsErrorMessage: (error: unknown) => String(error),
    useProjectChartsState: () => ({
      isLoading: false,
      refetch: jest.fn(),
      data: {
        installed: true,
        adapter: 'duckdb',
        support: { supported: true },
        extraInstalled: true,
        manifestExists: true,
        hasChartsDir: true,
        hasConfig: false,
      },
    }),
    useInstallDbtCharts: () => ({ mutateAsync: jest.fn() }),
    useRunChartsDbtParse: () => ({ mutateAsync: jest.fn(), isLoading: false }),
    useChartsInstallLine: () => null,
    useChartsServer: () => ({
      status: {
        projectPath: '/projects/shop',
        state: 'running',
        url: 'http://127.0.0.1:9123',
      },
      startError: null,
      retry: jest.fn(),
    }),
    useChartsValidation: () => ({
      result: validation,
      checking: false,
      validate,
    }),
  }),
);

const project = { id: 'p1', path: '/projects/shop' } as Project;

const tabFor = (relative: string, savedContent = 'title: A\n') =>
  ({
    id: relative,
    path: `/projects/shop/${relative}`,
    title: relative,
    content: savedContent,
    savedContent,
    isModified: false,
    isLoading: false,
  }) as EditorTabState;

const View = chartsFileView.Component;

describe('ChartsFileView', () => {
  beforeEach(() => {
    validate.mockReset();
    validate.mockResolvedValue(undefined);
    validation = { diagnostics: [], errorCount: 0, warningCount: 0 };
    toolResultHandler = null;
    try {
      window.localStorage.clear();
    } catch {
      // ignore
    }
  });

  it('matches YAML in any charts folder', () => {
    expect(chartsFileView.matches(tabFor('charts/a.yml'))).toBe(true);
    expect(chartsFileView.matches(tabFor('models/charts/a.yml'))).toBe(true);
    expect(chartsFileView.matches(tabFor('models/a.yml'))).toBe(false);
  });

  it('renders the plain code view for a charts folder outside the root', () => {
    render(<View tab={tabFor('models/charts/a.yml')} project={project} />);
    expect(screen.getByTestId('code-view')).toBeInTheDocument();
    expect(screen.queryByTitle('dbt Charts board')).not.toBeInTheDocument();
  });

  it('renders the YAML editor and the live board for a root board', async () => {
    render(<View tab={tabFor('charts/sales.yml')} project={project} />);
    expect(screen.getByTestId('yaml-editor')).toBeInTheDocument();
    const frame = screen.getByTitle('dbt Charts board');
    expect(frame).toHaveAttribute('src', 'http://127.0.0.1:9123/sales/');
    await waitFor(() => expect(validate).toHaveBeenCalledTimes(1));
  });

  it('re-validates on save without reloading the board (dct live-reloads)', async () => {
    const { rerender } = render(
      <View tab={tabFor('charts/sales.yml', 'title: A\n')} project={project} />,
    );
    await waitFor(() => expect(validate).toHaveBeenCalledTimes(1));
    const before = screen.getByTitle('dbt Charts board');
    rerender(
      <View tab={tabFor('charts/sales.yml', 'title: B\n')} project={project} />,
    );
    await waitFor(() => expect(validate).toHaveBeenCalledTimes(2));
    expect(screen.getByTitle('dbt Charts board')).toBe(before);
  });

  it('shows the error bar when validation finds errors', () => {
    validation = { diagnostics: [], errorCount: 2, warningCount: 0 };
    render(<View tab={tabFor('charts/sales.yml')} project={project} />);
    expect(
      screen.getByText('Board has 2 errors. See the marked lines.'),
    ).toBeInTheDocument();
    expect(screen.getByText('2 errors')).toBeInTheDocument();
  });

  it('reloads the board for a refresh tool result on this file only', async () => {
    render(<View tab={tabFor('charts/sales.yml')} project={project} />);
    const before = screen.getByTitle('dbt Charts board');

    act(() => {
      toolResultHandler?.({
        toolName: 'studio_charts_refresh_preview',
        result: {
          ok: true,
          mutation: 'dbt-charts-preview-refresh',
          relativePath: 'charts/other.yml',
        },
      });
    });
    expect(screen.getByTitle('dbt Charts board')).toBe(before);

    act(() => {
      toolResultHandler?.({
        toolName: 'studio_charts_refresh_preview',
        result: {
          ok: true,
          mutation: 'dbt-charts-preview-refresh',
          relativePath: 'charts/sales.yml',
        },
      });
    });
    expect(screen.getByTitle('dbt Charts board')).not.toBe(before);
  });

  it('shows a partial with a folder preview button instead of a page', () => {
    render(<View tab={tabFor('charts/_queries.yml')} project={project} />);
    expect(
      screen.getByText(
        'This file is shared by other boards. It has no page of its own.',
      ),
    ).toBeInTheDocument();
    expect(screen.queryByTitle('dbt Charts board')).not.toBeInTheDocument();
  });
});
