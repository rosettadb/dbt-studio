import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { ThemeProvider, createTheme } from '@mui/material/styles';

import { PythonCellOutputs } from '../../../../../src/renderer/components/notebook/python/PythonCellOutputs';
import { buildAskAgentPrompt } from '../../../../../src/renderer/components/notebook/python/pythonCells';
import type {
  PythonCellOutput,
  PythonNotebookCell,
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

const error: PythonCellOutput = {
  output_type: 'error',
  ename: 'KeyError',
  evalue: "'region'",
  traceback: ['Traceback', "KeyError: 'region'"],
};

const cell = (
  overrides: Partial<PythonNotebookCell> = {},
): PythonNotebookCell => ({
  id: 'c3',
  cell_type: 'code',
  source: "df['regionx']",
  outputs: [],
  execution_count: 3,
  metadata: {},
  ...overrides,
});

const renderOutputs = (onAskAgent?: jest.Mock) =>
  render(
    <ThemeProvider theme={theme}>
      <PythonCellOutputs outputs={[error]} onAskAgent={onAskAgent} />
    </ThemeProvider>,
  );

describe('error output entry points', () => {
  it('shows Explain error and Fix with AI when the agent is available', () => {
    const onAskAgent = jest.fn();
    renderOutputs(onAskAgent);

    fireEvent.click(screen.getByTestId('python-cell-error-fix'));
    expect(onAskAgent).toHaveBeenCalledWith({
      kind: 'fix-error',
      ename: 'KeyError',
      evalue: "'region'",
    });

    fireEvent.click(screen.getByTestId('python-cell-error-explain'));
    expect(onAskAgent).toHaveBeenLastCalledWith(
      expect.objectContaining({ kind: 'explain-error' }),
    );
  });

  it('shows neither button without an AI provider', () => {
    renderOutputs();
    expect(screen.queryByTestId('python-cell-error-fix')).toBeNull();
    expect(screen.queryByTestId('python-cell-error-explain')).toBeNull();
    expect(screen.getByText("KeyError: 'region'")).toBeInTheDocument();
  });
});

describe('buildAskAgentPrompt', () => {
  it('names the cell and its id for a fix, without pasting source', () => {
    const prompt = buildAskAgentPrompt(cell(), 2, {
      kind: 'fix-error',
      ename: 'KeyError',
      evalue: "'region'",
    });
    expect(prompt).toBe(
      "Fix the error in cell 3 (Python, id `c3`): KeyError: 'region'. Read the cell and its output, update the cell, and run it again to confirm.",
    );
    expect(prompt).not.toContain('regionx');
  });

  it('names the SQL variable and cleans up the error value', () => {
    const prompt = buildAskAgentPrompt(
      cell({
        cell_type: 'sql',
        metadata: { rosetta: { language: 'sql', variable: 'df_2' } },
      }),
      0,
      {
        kind: 'explain-error',
        ename: 'QueryError',
        evalue: `\u001b[31m${'x'.repeat(300)}\u001b[0m\nsecond line`,
      },
    );
    expect(
      prompt.startsWith(
        'Explain the error in cell 1 (SQL → `df_2`, id `c3`): QueryError: x',
      ),
    ).toBe(true);
    expect(prompt).not.toContain('\u001b');
    expect(prompt).not.toContain('second line');
    expect(prompt).toContain('…. Read the cell and its output, then explain');
  });

  it('asks to explain a cell', () => {
    expect(
      buildAskAgentPrompt(cell({ cell_type: 'markdown' }), 0, {
        kind: 'explain-cell',
      }),
    ).toBe(
      'Explain what cell 1 (Markdown, id `c3`) does. Read the cell and its output first.',
    );
  });
});
