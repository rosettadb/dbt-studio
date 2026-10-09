import { renderHook } from '@testing-library/react';
import {
  EditorSnapshot,
  PythonNotebookEditorPort,
  createAgentOps,
  usePythonNotebookAgentBridge,
} from '../../../../src/renderer/hooks/usePythonNotebookAgentBridge';
import {
  OTHER_NOTEBOOK_ERROR,
  registerPythonNotebookBridge,
} from '../../../../src/renderer/services/pythonNotebookBridge.service';
import type {
  ExecuteCellResult,
  PythonNotebookAgentHandlers,
  PythonNotebookCell,
} from '../../../../src/types/pythonNotebooks';

const cell = (
  id: string,
  overrides: Partial<PythonNotebookCell> = {},
): PythonNotebookCell => ({
  id,
  cell_type: 'code',
  source: `print("${id}")`,
  outputs: [],
  execution_count: null,
  metadata: {},
  ...overrides,
});

const sqlCell = (id: string, variable: string, source = 'SELECT 1') =>
  cell(id, {
    cell_type: 'sql',
    source,
    metadata: { rosetta: { language: 'sql', variable } },
  });

function fakeEditor(cells: PythonNotebookCell[]) {
  let state: EditorSnapshot = {
    name: 'Revenue analysis',
    runtime: { pythonVersion: '3.12', venvPath: '/v', status: 'ready' },
    kernelStatus: 'idle',
    cells,
    activeCellIds: [],
    selectedCellId: null,
    runningAll: false,
  };
  const port = {
    snapshot: () => state,
    commit: jest.fn(
      async (update: (c: PythonNotebookCell[]) => PythonNotebookCell[]) => {
        state = { ...state, cells: update(state.cells) };
      },
    ),
    run: jest.fn(async (): Promise<ExecuteCellResult | null> => null),
    reveal: jest.fn(),
    isEditing: jest.fn(() => false),
  };
  return {
    port,
    ops: createAgentOps('nb', () => port as PythonNotebookEditorPort),
    get state() {
      return state;
    },
    set(patch: Partial<EditorSnapshot>) {
      state = { ...state, ...patch };
    },
  };
}

describe('createAgentOps', () => {
  it('reports live state with 1-based cells', async () => {
    const editor = fakeEditor([cell('a'), sqlCell('b', 'df')]);
    editor.set({ activeCellIds: ['b'], runningAll: true });
    const state = await editor.ops.state({});
    expect(state).toMatchObject({
      notebookId: 'nb',
      name: 'Revenue analysis',
      runningAll: true,
    });
    expect(state.cells[1]).toMatchObject({
      index: 2,
      variable: 'df',
      status: 'running',
    });
  });

  it('reads a cell with the notebook name, and names unknown ids', async () => {
    const editor = fakeEditor([sqlCell('a', 'df_2', 'SELECT * FROM t')]);
    await expect(editor.ops['cell-read']({ cellId: 'a' })).resolves.toEqual({
      cellId: 'a',
      index: 1,
      type: 'sql',
      variable: 'df_2',
      source: 'SELECT * FROM t',
      notebookName: 'Revenue analysis',
    });
    await expect(editor.ops['cell-read']({ cellId: 'zz' })).rejects.toThrow(
      /notebooks_get_state/,
    );
  });

  it('adds a SQL cell after a given cell with the next free variable', async () => {
    const editor = fakeEditor([cell('a'), sqlCell('b', 'df'), cell('c')]);
    const ref = await editor.ops['cell-add']({
      cellType: 'sql',
      source: 'SELECT status, count(*) FROM orders GROUP BY 1',
      afterCellId: 'a',
    });
    expect(ref).toMatchObject({ index: 2, variable: 'df_2' });
    expect(editor.state.cells.map((c) => c.id)).toEqual([
      'a',
      ref.cellId,
      'b',
      'c',
    ]);
    expect(editor.port.reveal).toHaveBeenCalledWith(ref.cellId);
  });

  it('appends without afterCellId and honours an explicit variable', async () => {
    const editor = fakeEditor([cell('a')]);
    const ref = await editor.ops['cell-add']({
      cellType: 'sql',
      source: 'SELECT 1',
      variable: 'orders',
    });
    expect(ref).toMatchObject({ index: 2, variable: 'orders' });
    const md = await editor.ops['cell-add']({
      cellType: 'markdown',
      source: '# Notes',
    });
    expect(md.variable).toBeUndefined();
    expect(editor.state.cells[2].cell_type).toBe('markdown');
  });

  it('rejects bad add requests', async () => {
    const editor = fakeEditor([cell('a')]);
    await expect(
      editor.ops['cell-add']({
        cellType: 'code',
        source: 'x',
        afterCellId: 'zz',
      }),
    ).rejects.toThrow(/No cell with id zz/);
    await expect(
      editor.ops['cell-add']({ cellType: 'code', source: 'x', variable: 'df' }),
    ).rejects.toThrow(/SQL cells only/);
    await expect(
      editor.ops['cell-add']({ cellType: 'sql', source: 'x', variable: '1df' }),
    ).rejects.toThrow(/not a valid Python variable/);
    expect(editor.port.commit).not.toHaveBeenCalled();
  });

  it('updates source in place, and a type change clears outputs', async () => {
    const editor = fakeEditor([
      cell('a', {
        execution_count: 3,
        outputs: [{ output_type: 'stream', name: 'stdout', text: 'x' }],
      }),
    ]);
    await editor.ops['cell-update']({ cellId: 'a', source: 'y = 2' });
    expect(editor.state.cells[0]).toMatchObject({
      source: 'y = 2',
      execution_count: 3,
    });
    const ref = await editor.ops['cell-update']({
      cellId: 'a',
      cellType: 'sql',
    });
    expect(ref.variable).toBe('df');
    expect(editor.state.cells[0]).toMatchObject({
      cell_type: 'sql',
      outputs: [],
      execution_count: null,
    });
  });

  it('refuses to update a running cell or one the user is editing', async () => {
    const editor = fakeEditor([cell('a'), cell('b')]);
    editor.set({ activeCellIds: ['a'] });
    await expect(
      editor.ops['cell-update']({ cellId: 'a', source: 'x' }),
    ).rejects.toThrow('The cell is running. Wait for it to finish.');
    editor.port.isEditing.mockImplementation(
      ((id: string) => id === 'b') as any,
    );
    await expect(
      editor.ops['cell-update']({ cellId: 'b', source: 'x' }),
    ).rejects.toThrow(/user is editing/);
    await expect(
      editor.ops['cell-update']({ cellId: 'b', variable: 'df' }),
    ).rejects.toThrow(/user is editing/);
    expect(editor.port.commit).not.toHaveBeenCalled();
  });

  it('runs only the approved source', async () => {
    const editor = fakeEditor([cell('a', { source: 'x = 1' })]);
    await expect(
      editor.ops['cell-run']({
        cellId: 'a',
        expectedSource: 'x = 0',
        waitMs: 50,
      }),
    ).rejects.toThrow(/changed after it was approved/);
    editor.set({ activeCellIds: ['a'] });
    await expect(
      editor.ops['cell-run']({
        cellId: 'a',
        expectedSource: 'x = 1',
        waitMs: 50,
      }),
    ).rejects.toThrow('The cell is already running.');
    expect(editor.port.run).not.toHaveBeenCalled();
  });

  it('returns a blocked reason without running', async () => {
    const editor = fakeEditor([
      cell('a', { source: 'x = 1' }),
      cell('b', { source: '  ' }),
    ]);
    editor.set({
      runtime: { pythonVersion: '3.12', venvPath: '/v', status: 'creating' },
    });
    const result = await editor.ops['cell-run']({
      cellId: 'a',
      expectedSource: 'x = 1',
      waitMs: 50,
    });
    expect(result).toMatchObject({
      finished: false,
      blocked: 'The environment is still being created.',
    });
    editor.set({
      runtime: { pythonVersion: '3.12', venvPath: '/v', status: 'ready' },
    });
    const empty = await editor.ops['cell-run']({
      cellId: 'b',
      expectedSource: '  ',
      waitMs: 50,
    });
    expect(empty.blocked).toBe('The cell is empty.');
    expect(editor.port.run).not.toHaveBeenCalled();
  });

  it('summarizes the final run result even before the editor re-renders', async () => {
    const editor = fakeEditor([cell('a', { source: 'x = 1' })]);
    editor.port.run.mockResolvedValue({
      cellId: 'a',
      status: 'error',
      execution_count: 4,
      outputs: [
        {
          output_type: 'error',
          ename: 'KeyError',
          evalue: "'region'",
          traceback: [],
        },
      ],
    });
    const result = await editor.ops['cell-run']({
      cellId: 'a',
      expectedSource: 'x = 1',
      waitMs: 1000,
    });
    expect(result).toMatchObject({
      finished: true,
      status: 'error',
      executionCount: 4,
      outputs: [{ kind: 'error', ename: 'KeyError' }],
    });
  });

  it('reports a cell still running after the wait', async () => {
    const editor = fakeEditor([cell('a', { source: 'sleep()' })]);
    editor.port.run.mockImplementation(() => {
      editor.set({ activeCellIds: ['a'] });
      return new Promise<never>(() => {
        // never settles: the cell keeps running
      });
    });
    const result = await editor.ops['cell-run']({
      cellId: 'a',
      expectedSource: 'sleep()',
      waitMs: 20,
    });
    expect(result).toMatchObject({ finished: false, status: 'running' });
  });

  it('reports a queued cell result', async () => {
    const editor = fakeEditor([cell('a'), cell('b')]);
    editor.set({ activeCellIds: ['a', 'b'] });
    await expect(
      editor.ops['cell-result']({ cellId: 'b' }),
    ).resolves.toMatchObject({ index: 2, status: 'queued' });
  });
});

describe('registerPythonNotebookBridge', () => {
  const ipc = () => (window as any).electron.ipcRenderer;
  let listener: (...args: unknown[]) => void;
  const unsubscribe = jest.fn();

  const handlers = (state = jest.fn(async () => ({ name: 'A' }))) =>
    ({ state }) as unknown as PythonNotebookAgentHandlers;

  const send = async (request: object) => {
    listener({ requestId: 'r1', conversationId: 1, args: {}, ...request });
    await new Promise((resolve) => {
      setTimeout(resolve, 0);
    });
    return ipc().invoke.mock.calls[ipc().invoke.mock.calls.length - 1];
  };

  beforeEach(() => {
    jest.clearAllMocks();
    ipc().on.mockImplementation((_channel: string, fn: typeof listener) => {
      listener = fn;
      return unsubscribe;
    });
    ipc().invoke.mockResolvedValue(undefined);
  });

  it("answers with the notebook's handlers", async () => {
    const off = registerPythonNotebookBridge('nb-a', handlers());
    const [channel, response] = await send({ notebookId: 'nb-a', op: 'state' });
    expect(channel).toBe('agent:python-notebook:response');
    expect(response).toEqual({
      requestId: 'r1',
      success: true,
      data: { name: 'A' },
    });
    off();
  });

  it('rejects requests for another notebook and unknown ops', async () => {
    const off = registerPythonNotebookBridge('nb-a', handlers());
    expect((await send({ notebookId: 'nb-b', op: 'state' }))[1]).toEqual({
      requestId: 'r1',
      success: false,
      error: OTHER_NOTEBOOK_ERROR,
    });
    expect(
      (await send({ notebookId: 'nb-a', op: 'cell-delete' }))[1],
    ).toMatchObject({
      success: false,
      error: 'Unknown notebook op: cell-delete',
    });
    off();
  });

  it('turns handler errors into failed responses', async () => {
    const off = registerPythonNotebookBridge(
      'nb-a',
      handlers(
        jest.fn(async () => {
          throw new Error('boom');
        }),
      ),
    );
    expect((await send({ notebookId: 'nb-a', op: 'state' }))[1]).toEqual({
      requestId: 'r1',
      success: false,
      error: 'boom',
    });
    off();
  });

  it('shares one subscription and drops it with the last notebook', async () => {
    const offA = registerPythonNotebookBridge('nb-a', handlers());
    const offB = registerPythonNotebookBridge('nb-b', handlers());
    expect(ipc().on).toHaveBeenCalledTimes(1);
    offA();
    expect(unsubscribe).not.toHaveBeenCalled();
    expect((await send({ notebookId: 'nb-a', op: 'state' }))[1].error).toBe(
      OTHER_NOTEBOOK_ERROR,
    );
    offB();
    expect(unsubscribe).toHaveBeenCalledTimes(1);
  });

  it('registers while the editor is mounted', () => {
    const editor = fakeEditor([cell('a')]);
    const { unmount } = renderHook(() =>
      usePythonNotebookAgentBridge(
        'nb-a',
        editor.port as PythonNotebookEditorPort,
      ),
    );
    expect(ipc().on).toHaveBeenCalledWith(
      'agent:python-notebook:request',
      expect.any(Function),
    );
    unmount();
    expect(unsubscribe).toHaveBeenCalledTimes(1);
  });
});
