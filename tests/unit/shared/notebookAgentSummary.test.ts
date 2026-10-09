import {
  buildAgentNotebookState,
  summarizeCell,
} from '../../../src/shared/notebookAgentSummary';
import {
  DATAFRAME_MIME,
  SQL_FALLBACK_MIME,
} from '../../../src/types/pythonNotebooks';
import type {
  DataFrameTableInfo,
  PythonCellOutput,
  PythonNotebookCell,
} from '../../../src/types/pythonNotebooks';

const cell = (
  overrides: Partial<PythonNotebookCell> = {},
): PythonNotebookCell => ({
  id: 'c1',
  cell_type: 'code',
  source: 'print(1)',
  outputs: [],
  execution_count: null,
  metadata: {},
  ...overrides,
});

const frame = (totalRows: number, totalColumns = 3): DataFrameTableInfo => {
  const rows = Math.min(totalRows, 20);
  const columns = Array.from({ length: totalColumns }, (_, i) => `c${i}`);
  return {
    version: 1,
    columns,
    dtypes: columns.map(() => 'int64'),
    indexName: '',
    index: Array.from({ length: rows }, (_, i) => i),
    data: Array.from({ length: rows }, (_, r) => columns.map((_c, i) => r + i)),
    rowCount: rows,
    totalRows,
    totalColumns,
  };
};

const display = (data: Record<string, unknown>): PythonCellOutput => ({
  output_type: 'display_data',
  data: data as any,
  metadata: {},
});

describe('summarizeCell', () => {
  it('summarizes a DataFrame: 10 preview rows, dtypes and size, no HTML', () => {
    const result = summarizeCell(
      cell({
        outputs: [
          display({
            [DATAFRAME_MIME]: frame(1204, 7),
            'text/html': '<table>…</table>',
          }),
        ],
        execution_count: 3,
      }),
      0,
    );
    expect(result.outputs).toHaveLength(1);
    const [output] = result.outputs;
    expect(output.kind).toBe('dataframe');
    if (output.kind !== 'dataframe') return;
    expect(output.rows).toHaveLength(10);
    expect(output.columns[0]).toEqual({ name: 'c0', dtype: 'int64' });
    expect(output.totalRows).toBe(1204);
    expect(output.totalColumns).toBe(7);
    expect(output.truncated).toBe(true);
    expect(JSON.stringify(result)).not.toContain('<table>');
    expect(result).toMatchObject({
      cellId: 'c1',
      index: 1,
      status: 'ok',
      executionCount: 3,
    });
  });

  it('cuts long DataFrame values at 200 chars', () => {
    const info = frame(1, 1);
    info.data = [['x'.repeat(500)]];
    const [output] = summarizeCell(
      cell({ outputs: [display({ [DATAFRAME_MIME]: info })] }),
      0,
    ).outputs;
    if (output.kind !== 'dataframe') throw new Error('expected a dataframe');
    expect(String(output.rows[0][0])).toHaveLength(200);
  });

  it('reports the SQL fallback even though its bundle carries a table', () => {
    const [output] = summarizeCell(
      cell({
        cell_type: 'sql',
        outputs: [
          display({
            [SQL_FALLBACK_MIME]: { variable: 'df', rowCount: 42 },
            [DATAFRAME_MIME]: frame(42),
          }),
        ],
      }),
      0,
    ).outputs;
    expect(output).toEqual({
      kind: 'sql_without_pandas',
      variable: 'df',
      rowCount: 42,
    });
  });

  it('reports images without their data', () => {
    const result = summarizeCell(
      cell({
        outputs: [
          display({ 'image/png': 'iVBORw0KGgo=', 'text/plain': '<Figure>' }),
        ],
      }),
      0,
    );
    expect(result.outputs).toEqual([{ kind: 'image', mime: 'image/png' }]);
  });

  it('turns HTML into text', () => {
    const [output] = summarizeCell(
      cell({
        outputs: [
          display({
            'text/html':
              '<style>p{}</style><p>Tom &amp; Jerry&#39;s</p>\n\n<p>   two   words </p>',
          }),
        ],
      }),
      0,
    ).outputs;
    expect(output).toEqual({
      kind: 'text',
      mime: 'text/html',
      text: "Tom & Jerry's\ntwo words",
      truncated: false,
    });
  });

  it('strips ANSI codes from errors and keeps the last 40 traceback lines', () => {
    const traceback = Array.from(
      { length: 60 },
      (_, i) => `\u001b[0;31mline ${i}\u001b[0m`,
    );
    const [output] = summarizeCell(
      cell({
        outputs: [
          {
            output_type: 'error',
            ename: 'KeyError',
            evalue: "\u001b[1m'region'\u001b[0m",
            traceback,
          },
        ],
      }),
      0,
    ).outputs;
    if (output.kind !== 'error') throw new Error('expected an error');
    expect(output.evalue).toBe("'region'");
    const lines = output.traceback.split('\n');
    expect(lines).toHaveLength(40);
    expect(lines[0]).toBe('line 20');
    expect(output.traceback).not.toContain('\u001b');
  });

  it('keeps the head and the tail of long streams', () => {
    const text = `${'a'.repeat(1000)}${'b'.repeat(5000)}${'c'.repeat(2000)}`;
    const [output] = summarizeCell(
      cell({ outputs: [{ output_type: 'stream', name: 'stdout', text }] }),
      0,
    ).outputs;
    if (output.kind !== 'stream') throw new Error('expected a stream');
    expect(output.truncated).toBe(true);
    expect(output.text.startsWith('a'.repeat(500))).toBe(true);
    expect(output.text.endsWith('c'.repeat(2000))).toBe(true);
    expect(output.text).toContain('5,000 chars omitted');
  });

  it('drops outputs past the budget but always keeps errors', () => {
    const big = (i: number): PythonCellOutput => ({
      output_type: 'stream',
      name: i % 2 ? 'stdout' : 'stderr',
      text: `${i}`.repeat(3000),
    });
    const outputs: PythonCellOutput[] = [
      big(1),
      big(2),
      big(3),
      big(4),
      big(5),
      {
        output_type: 'error',
        ename: 'ValueError',
        evalue: 'bad',
        traceback: [],
      },
    ];
    const result = summarizeCell(cell({ outputs }), 0);
    expect(result.omittedOutputs).toBeGreaterThan(0);
    expect(result.outputs[result.outputs.length - 1].kind).toBe('error');
    const nonErrors = result.outputs.filter((o) => o.kind !== 'error');
    expect(JSON.stringify(nonErrors).length).toBeLessThanOrEqual(12_000);
  });

  it('applies the status rules', () => {
    expect(summarizeCell(cell(), 0).status).toBe('never_run');
    expect(summarizeCell(cell(), 0, 'queued').status).toBe('queued');
    expect(summarizeCell(cell({ execution_count: 2 }), 0).status).toBe('ok');
    // SQL statements without rows: output, but no execution count
    expect(
      summarizeCell(
        cell({
          cell_type: 'sql',
          outputs: [
            {
              output_type: 'stream',
              name: 'stdout',
              text: 'Statement executed.\n',
            },
          ],
        }),
        0,
      ).status,
    ).toBe('ok');
    expect(
      summarizeCell(
        cell({
          execution_count: 4,
          outputs: [
            { output_type: 'error', ename: 'E', evalue: '', traceback: [] },
          ],
        }),
        0,
        'running',
      ).status,
    ).toBe('running');
    expect(
      summarizeCell(
        cell({
          execution_count: 4,
          outputs: [
            { output_type: 'error', ename: 'E', evalue: '', traceback: [] },
          ],
        }),
        0,
      ).status,
    ).toBe('error');
  });
});

describe('buildAgentNotebookState', () => {
  it('lists cells 1-based with previews, variables, labels and run phases', () => {
    const state = buildAgentNotebookState({
      notebookId: 'nb',
      name: 'Revenue analysis',
      runtime: { pythonVersion: '3.12', venvPath: '/v', status: 'ready' },
      kernelStatus: 'busy',
      cells: [
        cell({
          id: 'a',
          source: '\n\nimport pandas as pd\nimport numpy',
          execution_count: 1,
        }),
        cell({
          id: 'b',
          cell_type: 'sql',
          source: 'SELECT 1',
          metadata: { rosetta: { language: 'sql', variable: 'df' } },
          outputs: [display({ [DATAFRAME_MIME]: frame(1204, 7) })],
        }),
        cell({ id: 'c', cell_type: 'markdown', source: '# Title' }),
        cell({
          id: 'd',
          outputs: [
            {
              output_type: 'stream',
              name: 'stdout',
              text: 'one\ntwo\nthree\n',
            },
          ],
        }),
        cell({
          id: 'e',
          outputs: [
            {
              output_type: 'error',
              ename: 'KeyError',
              evalue: "'region'",
              traceback: [],
            },
          ],
        }),
        cell({ id: 'f', outputs: [display({ 'image/png': 'x' })] }),
      ],
      activeCellIds: ['d', 'e'],
      selectedCellId: 'b',
      runningAll: false,
    });
    expect(state).toMatchObject({
      notebookId: 'nb',
      name: 'Revenue analysis',
      pythonVersion: '3.12',
      envStatus: 'ready',
      kernelStatus: 'busy',
      selectedCellId: 'b',
    });
    expect(state.cells.map((c) => c.index)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(state.cells[0]).toMatchObject({
      preview: 'import pandas as pd',
      lines: 4,
      status: 'ok',
    });
    expect(state.cells[1]).toMatchObject({
      variable: 'df',
      output: 'DataFrame 1,204 × 7',
    });
    expect(state.cells[2]).toMatchObject({ type: 'markdown', output: '' });
    expect(state.cells[3]).toMatchObject({
      status: 'running',
      output: 'stdout (3 lines)',
    });
    expect(state.cells[4]).toMatchObject({
      status: 'queued',
      output: "KeyError: 'region'",
    });
    expect(state.cells[5].output).toBe('image/png');
  });

  it('reports a missing runtime as a missing env', () => {
    const state = buildAgentNotebookState({
      notebookId: 'nb',
      name: 'x',
      runtime: null,
      kernelStatus: 'stopped',
      cells: [],
      activeCellIds: [],
      selectedCellId: null,
      runningAll: true,
    });
    expect(state).toMatchObject({
      pythonVersion: '',
      envStatus: 'missing',
      runningAll: true,
      cells: [],
    });
  });
});
