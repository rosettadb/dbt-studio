import React from 'react';
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { ThemeProvider, createTheme } from '@mui/material/styles';

import { DataFrameTableOutput } from '../../../../../src/renderer/components/notebook/python/DataFrameTableOutput';
import {
  PythonCellOutputs,
  outputsToText,
} from '../../../../../src/renderer/components/notebook/python/PythonCellOutputs';
import {
  DATAFRAME_MIME,
  DataFrameTableInfo,
} from '../../../../../src/types/pythonNotebooks';

// PythonCellOutputs renders markdown outputs; these ESM packages aren't
// transformed by Jest and aren't needed here.
jest.mock('react-markdown', () => ({
  __esModule: true,
  default: ({ children }: { children: React.ReactNode }) => (
    <span>{children}</span>
  ),
}));
jest.mock('remark-gfm', () => () => undefined);

const theme = createTheme();

const frame = (
  rows: number,
  overrides: Partial<DataFrameTableInfo> = {},
): DataFrameTableInfo => ({
  version: 1,
  columns: ['id', 'name', 'amount'],
  dtypes: ['int64', 'object', 'float64'],
  indexName: '',
  index: Array.from({ length: rows }, (_, i) => i),
  data: Array.from({ length: rows }, (_, i) => [
    i + 1,
    `name-${i + 1}`,
    i % 10 === 0 ? null : (i * 7) % 100,
  ]),
  rowCount: rows,
  totalRows: rows,
  totalColumns: 3,
  ...overrides,
});

const renderTable = (info: DataFrameTableInfo, html?: React.ReactNode) =>
  render(
    <ThemeProvider theme={theme}>
      <DataFrameTableOutput info={info} html={html} />
    </ThemeProvider>,
  );

const bodyRows = () =>
  within(screen.getByTestId('dataframe-table')).getAllByRole('row').slice(1); // header row

describe('DataFrameTableOutput', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('shows 10 rows per page and pages through all of them', () => {
    renderTable(frame(200));

    expect(screen.getByTestId('dataframe-table-summary')).toHaveTextContent(
      '200 rows × 3 columns',
    );
    expect(bodyRows()).toHaveLength(10);
    expect(bodyRows()[0]).toHaveTextContent('name-1');

    act(() => {
      fireEvent.click(screen.getByRole('button', { name: /next page/i }));
    });
    expect(bodyRows()[0]).toHaveTextContent('name-11');
  });

  it('filters over all rows, not only the current page', () => {
    renderTable(frame(200));

    act(() => {
      fireEvent.change(screen.getByTestId('dataframe-table-filter'), {
        target: { value: 'name-199' },
      });
    });
    expect(bodyRows()).toHaveLength(1);
    expect(bodyRows()[0]).toHaveTextContent('name-199');
  });

  it('sorts the whole frame, not only the current page', () => {
    renderTable(frame(200));
    const header = screen.getByRole('button', { name: 'amount' });

    act(() => {
      fireEvent.click(header); // ascending
    });
    // amount = (i * 7) % 100, null for every 10th row: smallest is 1
    const firstAsc = within(bodyRows()[0]).getAllByRole('cell')[3];
    expect(firstAsc).toHaveTextContent(/^1$/);

    act(() => {
      fireEvent.click(header); // descending
    });
    const firstDesc = within(bodyRows()[0]).getAllByRole('cell')[3];
    expect(firstDesc).toHaveTextContent(/^99$/);
  });

  it('keeps missing values last in both directions', () => {
    // All 12 rows on one page; rows 0 and 10 have no amount
    localStorage.setItem('python-dataframe-table-per-page', '25');
    renderTable(frame(12));
    const header = screen.getByRole('button', { name: 'amount' });
    const lastAmounts = () =>
      bodyRows()
        .slice(-2)
        .map((row) => within(row).getAllByRole('cell')[3].textContent);

    act(() => {
      fireEvent.click(header);
    });
    expect(lastAmounts()).toEqual(['null', 'null']);
    act(() => {
      fireEvent.click(header);
    });
    expect(lastAmounts()).toEqual(['null', 'null']);
  });

  it('says when the kernel sent only the first rows', () => {
    renderTable(frame(30, { totalRows: 50_000 }));
    expect(screen.getByTestId('dataframe-table-summary')).toHaveTextContent(
      '50,000 rows × 3 columns · showing the first 30',
    );
  });

  it('handles duplicate column names and missing values', () => {
    renderTable(
      frame(2, {
        columns: ['a', 'a'],
        dtypes: ['float64', 'float64'],
        data: [
          [1.5, null],
          [null, 2],
        ],
        totalColumns: 2,
      }),
    );
    expect(screen.getAllByRole('button', { name: 'a' })).toHaveLength(2);
    expect(screen.getAllByText('null')).toHaveLength(2);
  });

  it('toggles to pandas HTML and back', () => {
    renderTable(frame(3), <div>pandas html</div>);

    act(() => {
      fireEvent.click(screen.getByTestId('dataframe-table-toggle'));
    });
    expect(screen.getByText('pandas html')).toBeInTheDocument();
    expect(screen.queryByTestId('dataframe-table')).not.toBeInTheDocument();

    act(() => {
      fireEvent.click(screen.getByTestId('dataframe-table-toggle'));
    });
    expect(screen.getByTestId('dataframe-table')).toBeInTheDocument();
  });
});

describe('PythonCellOutputs with DataFrames', () => {
  it('renders the interactive table when the bundle has the DataFrame mime', () => {
    render(
      <ThemeProvider theme={theme}>
        <PythonCellOutputs
          outputs={[
            {
              output_type: 'execute_result',
              execution_count: 3,
              data: {
                'text/plain': 'df',
                'text/html': '<table></table>',
                [DATAFRAME_MIME]: frame(5),
              },
              metadata: {},
            },
          ]}
        />
      </ThemeProvider>,
    );
    expect(screen.getByTestId('dataframe-table')).toBeInTheDocument();
    // Colab-style: no `Out[n]:` label next to the result
    expect(screen.queryByText('Out[3]:')).not.toBeInTheDocument();
  });

  it('keeps the HTML output for bundles without it', () => {
    render(
      <ThemeProvider theme={theme}>
        <PythonCellOutputs
          outputs={[
            {
              output_type: 'display_data',
              data: { 'text/html': '<table></table>' },
              metadata: {},
            },
          ]}
        />
      </ThemeProvider>,
    );
    expect(screen.queryByTestId('dataframe-table')).not.toBeInTheDocument();
    expect(screen.getByTitle('html-output')).toBeInTheDocument();
  });
});

describe('PythonCellOutputs output section', () => {
  const outputs = [
    { output_type: 'stream' as const, name: 'stdout' as const, text: 'hi\n' },
    {
      output_type: 'display_data' as const,
      data: { 'text/plain': 'x' },
      metadata: {},
    },
  ];

  const renderOutputs = (
    props: Partial<React.ComponentProps<typeof PythonCellOutputs>> = {},
  ) =>
    render(
      <ThemeProvider theme={theme}>
        <PythonCellOutputs
          outputs={outputs}
          collapsed={props.collapsed}
          onExpand={props.onExpand}
          onClearOutputs={props.onClearOutputs}
        />
      </ThemeProvider>,
    );

  const openMenu = () =>
    act(() => {
      fireEvent.click(screen.getByTestId('python-cell-output-menu'));
    });

  it('shows a summary while collapsed and expands on click', () => {
    const onExpand = jest.fn();
    renderOutputs({ collapsed: true, onExpand });
    expect(screen.queryByText('hi')).not.toBeInTheDocument();
    expect(screen.getByTestId('python-cell-outputs-hidden')).toHaveTextContent(
      '2 outputs hidden',
    );
    act(() => {
      fireEvent.click(screen.getByTestId('python-cell-outputs-hidden'));
    });
    expect(onExpand).toHaveBeenCalledTimes(1);
  });

  it('copies the outputs, not the code, when a code editor holds the selection', () => {
    // Monaco answers copy events on its textarea with the code as plain text
    // and HTML; Excel pastes the HTML.
    const editor = document.createElement('textarea');
    document.body.appendChild(editor);
    editor.addEventListener('copy', (event) => {
      event.clipboardData?.setData('text/plain', 'df');
      event.clipboardData?.setData('text/html', '<span>df</span>');
      event.preventDefault();
    });
    const clipboard = new Map<string, string>();
    Object.defineProperty(document, 'execCommand', {
      value: jest.fn(() => {
        const event = new Event('copy', { bubbles: true, cancelable: true });
        Object.defineProperty(event, 'clipboardData', {
          value: {
            setData: (type: string, value: string) =>
              clipboard.set(type, value),
          },
        });
        editor.dispatchEvent(event);
        return true;
      }),
      configurable: true,
    });
    renderOutputs();
    openMenu();
    act(() => {
      fireEvent.click(screen.getByTestId('python-cell-output-copy'));
    });
    expect(Object.fromEntries(clipboard)).toEqual({ 'text/plain': 'hi\nx' });
    editor.remove();
  });

  it('clears the outputs only when the cell handles it', () => {
    const onClearOutputs = jest.fn();
    const { unmount } = renderOutputs({ onClearOutputs });
    openMenu();
    act(() => {
      fireEvent.click(screen.getByTestId('python-cell-output-clear'));
    });
    expect(onClearOutputs).toHaveBeenCalledTimes(1);
    unmount();

    renderOutputs();
    openMenu();
    expect(
      screen.queryByTestId('python-cell-output-clear'),
    ).not.toBeInTheDocument();
  });

  it('shows the outputs fullscreen and closes again', async () => {
    renderOutputs();
    openMenu();
    act(() => {
      fireEvent.click(screen.getByTestId('python-cell-output-fullscreen'));
    });
    expect(screen.getByText('Cell output')).toBeInTheDocument();
    expect(screen.getAllByText('hi')).toHaveLength(2); // cell + fullscreen

    act(() => {
      fireEvent.click(
        screen.getByTestId('python-cell-output-fullscreen-close'),
      );
    });
    // The dialog leaves after its exit transition
    await waitFor(() =>
      expect(screen.queryByText('Cell output')).not.toBeInTheDocument(),
    );
  });
});

describe('outputsToText', () => {
  it('joins text outputs and turns DataFrames into TSV', () => {
    const text = outputsToText([
      { output_type: 'stream', name: 'stdout', text: 'loading\n' },
      {
        output_type: 'execute_result',
        execution_count: 1,
        data: {
          'text/plain': 'ignored for frames',
          [DATAFRAME_MIME]: frame(2, {
            data: [
              [1, 'a\tb', null],
              [2, 'c', 3.5],
            ],
          }),
        },
        metadata: {},
      },
      {
        output_type: 'error',
        ename: 'ValueError',
        evalue: 'bad',
        traceback: ['\u001b[31mTraceback\u001b[0m'],
      },
    ]);
    expect(text).toBe(
      [
        'loading',
        '\tid\tname\tamount',
        '0\t1\ta b\t',
        '1\t2\tc\t3.5',
        'ValueError: bad',
        'Traceback',
      ].join('\n'),
    );
  });
});
