/**
 * Python notebook agent ops
 *
 * Everything the Notebooks agent can do in an open Python notebook, behind a
 * small editor port. `createAgentOps` holds the logic: validation, insert
 * position, SQL variable naming, refusing while a cell runs or is being
 * edited, summaries, and racing a run against the wait. The editor implements
 * the port; the hook registers the ops with the bridge service.
 */

import { useEffect, useRef } from 'react';
import {
  buildAgentNotebookState,
  summarizeCell,
} from '../../shared/notebookAgentSummary';
import type { CellRunPhase } from '../../shared/notebookAgentSummary';
import { registerPythonNotebookBridge } from '../services/pythonNotebookBridge.service';
import {
  PYTHON_IDENTIFIER,
  checkRunnable,
  metadataForType,
  newCell,
} from '../components/notebook/python/pythonCells';
import type {
  AgentCellRef,
  ExecuteCellResult,
  KernelStatus,
  NotebookRuntime,
  PythonCellType,
  PythonNotebookAgentHandlers,
  PythonNotebookCell,
} from '../../types/pythonNotebooks';

export interface EditorSnapshot {
  name: string;
  runtime: NotebookRuntime | null;
  kernelStatus: KernelStatus;
  cells: PythonNotebookCell[];
  /** Cells queued or running, in order: the first one is running */
  activeCellIds: string[];
  selectedCellId: string | null;
  runningAll: boolean;
}

/** What the agent ops need from the editor. */
export interface PythonNotebookEditorPort {
  snapshot(): EditorSnapshot;
  /** Apply a cell change now and save it before resolving. */
  commit(
    update: (cells: PythonNotebookCell[]) => PythonNotebookCell[],
  ): Promise<void>;
  /** Run a cell the way the user does; null when it didn't produce a result. */
  run(cellId: string): Promise<ExecuteCellResult | null>;
  /** Select a cell and scroll it into view without moving keyboard focus. */
  reveal(cellId: string): void;
  /** Whether the user has keyboard focus inside the cell's editor. */
  isEditing(cellId: string): boolean;
}

const CELL_TYPES: PythonCellType[] = ['code', 'sql', 'markdown'];

function locate(snapshot: EditorSnapshot, cellId: string) {
  const index = snapshot.cells.findIndex((c) => c.id === cellId);
  if (index === -1) {
    throw new Error(
      `No cell with id ${cellId}. Call notebooks_get_state for current ids.`,
    );
  }
  return { cell: snapshot.cells[index], index };
}

function runPhase(
  snapshot: EditorSnapshot,
  cellId: string,
): CellRunPhase | undefined {
  const position = snapshot.activeCellIds.indexOf(cellId);
  if (position === -1) return undefined;
  return position === 0 ? 'running' : 'queued';
}

function sqlVariable(cell: PythonNotebookCell): string | undefined {
  return cell.cell_type === 'sql'
    ? (cell.metadata.rosetta?.variable ?? undefined)
    : undefined;
}

function cellRef(cell: PythonNotebookCell, index: number): AgentCellRef {
  const variable = sqlVariable(cell);
  return {
    cellId: cell.id,
    index: index + 1,
    ...(variable ? { variable } : {}),
  };
}

function assertCellType(type: string): asserts type is PythonCellType {
  if (!CELL_TYPES.includes(type as PythonCellType)) {
    throw new Error(`Unknown cell type "${type}". Use code, sql or markdown.`);
  }
}

function assertVariable(variable: string, type: PythonCellType) {
  if (type !== 'sql') {
    throw new Error('`variable` applies to SQL cells only.');
  }
  if (!PYTHON_IDENTIFIER.test(variable)) {
    throw new Error(`"${variable}" is not a valid Python variable name.`);
  }
}

function withVariable(
  cell: PythonNotebookCell,
  variable: string,
): PythonNotebookCell {
  return {
    ...cell,
    metadata: {
      ...cell.metadata,
      rosetta: { ...cell.metadata.rosetta, language: 'sql', variable },
    },
  };
}

/** Resolves true when `promise` settles within `ms`, false otherwise. */
function settlesWithin(promise: Promise<unknown>, ms: number) {
  return new Promise<boolean>((resolve) => {
    const timer = setTimeout(() => resolve(false), ms);
    const settle = () => {
      clearTimeout(timer);
      resolve(true);
    };
    promise.then(() => settle()).catch(() => settle());
  });
}

export function createAgentOps(
  notebookId: string,
  getPort: () => PythonNotebookEditorPort,
): PythonNotebookAgentHandlers {
  return {
    state: async () =>
      buildAgentNotebookState({ notebookId, ...getPort().snapshot() }),

    'cell-read': async ({ cellId }) => {
      const snapshot = getPort().snapshot();
      const { cell, index } = locate(snapshot, cellId);
      const variable = sqlVariable(cell);
      return {
        cellId,
        index: index + 1,
        type: cell.cell_type,
        ...(variable ? { variable } : {}),
        source: cell.source,
        notebookName: snapshot.name,
      };
    },

    'cell-add': async ({ cellType, source, afterCellId, variable }) => {
      assertCellType(cellType);
      if (variable !== undefined) assertVariable(variable, cellType);
      const port = getPort();
      const snapshot = port.snapshot();
      if (afterCellId !== undefined) locate(snapshot, afterCellId);

      const base = { ...newCell(cellType, snapshot.cells), source };
      const cell = variable ? withVariable(base, variable) : base;
      let insertedAt = snapshot.cells.length;
      await port.commit((cells) => {
        const after =
          afterCellId === undefined
            ? -1
            : cells.findIndex((c) => c.id === afterCellId);
        insertedAt = after === -1 ? cells.length : after + 1;
        return [
          ...cells.slice(0, insertedAt),
          cell,
          ...cells.slice(insertedAt),
        ];
      });
      port.reveal(cell.id);
      return cellRef(cell, insertedAt);
    },

    'cell-update': async ({ cellId, source, cellType, variable }) => {
      const port = getPort();
      const snapshot = port.snapshot();
      const { cell } = locate(snapshot, cellId);
      if (snapshot.activeCellIds.includes(cellId)) {
        throw new Error('The cell is running. Wait for it to finish.');
      }
      if (port.isEditing(cellId)) {
        throw new Error(
          'The user is editing this cell. Try again when they are done.',
        );
      }
      if (cellType !== undefined) assertCellType(cellType);
      if (variable !== undefined) {
        assertVariable(variable, cellType ?? cell.cell_type);
      }

      const updated: { cell?: PythonNotebookCell; index: number } = {
        index: -1,
      };
      await port.commit((cells) =>
        cells.map((c, i) => {
          if (c.id !== cellId) return c;
          let next: PythonNotebookCell = { ...c };
          if (source !== undefined) next.source = source;
          if (cellType !== undefined && cellType !== c.cell_type) {
            next = {
              ...next,
              cell_type: cellType,
              outputs: [],
              execution_count: null,
              metadata: metadataForType(cellType, c.metadata, cells),
            };
          }
          if (variable !== undefined) next = withVariable(next, variable);
          updated.cell = next;
          updated.index = i;
          return next;
        }),
      );
      if (!updated.cell) throw new Error(`No cell with id ${cellId}.`);
      return cellRef(updated.cell, updated.index);
    },

    'cell-run': async ({ cellId, expectedSource, waitMs }) => {
      const port = getPort();
      const snapshot = port.snapshot();
      const { cell, index } = locate(snapshot, cellId);
      if (cell.source !== expectedSource) {
        throw new Error(
          'The cell changed after it was approved. Read it and run it again.',
        );
      }
      if (snapshot.activeCellIds.includes(cellId)) {
        throw new Error('The cell is already running.');
      }
      const blocked =
        cell.cell_type === 'markdown'
          ? 'Markdown cells have nothing to run.'
          : checkRunnable(cell, snapshot.runtime);
      if (blocked) {
        return { ...summarizeCell(cell, index), finished: false, blocked };
      }

      const outcome: { result: ExecuteCellResult | null } = { result: null };
      const run = port.run(cellId).then((result) => {
        outcome.result = result;
        return result;
      });
      const finished = await settlesWithin(run, waitMs);

      const latest = getPort().snapshot();
      const position = latest.cells.findIndex((c) => c.id === cellId);
      const current = position === -1 ? cell : latest.cells[position];
      const at = position === -1 ? index : position;
      if (finished) {
        // The final result is the source of truth: editor state may not have
        // re-rendered yet.
        const settled = outcome.result
          ? {
              ...current,
              outputs: outcome.result.outputs,
              execution_count: outcome.result.execution_count,
            }
          : current;
        return { ...summarizeCell(settled, at), finished: true };
      }
      return {
        ...summarizeCell(current, at, runPhase(latest, cellId) ?? 'running'),
        finished: false,
      };
    },

    'cell-result': async ({ cellId }) => {
      const snapshot = getPort().snapshot();
      const { cell, index } = locate(snapshot, cellId);
      return summarizeCell(cell, index, runPhase(snapshot, cellId));
    },
  };
}

/**
 * Answer the Notebooks agent for `notebookId` while the editor is mounted.
 * The port is read on every request, so editor re-renders don't re-subscribe.
 */
export function usePythonNotebookAgentBridge(
  notebookId: string,
  port: PythonNotebookEditorPort,
): void {
  const portRef = useRef(port);
  portRef.current = port;
  useEffect(
    () =>
      registerPythonNotebookBridge(
        notebookId,
        createAgentOps(notebookId, () => portRef.current),
      ),
    [notebookId],
  );
}
