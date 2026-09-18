/**
 * Registry of live Monaco editors for notebook SQL cells.
 *
 * Cells own their editor instance privately; the notebook editor and the
 * notebooks screen need to reach the *active* cell's editor to insert text
 * (Data tree context menu → "Insert name" / "Generate SQL"). Rather than
 * threading refs through several components, cells register here on mount
 * and mark themselves active when focused.
 */

import type * as monaco from 'monaco-editor';

type CellEditor = monaco.editor.ICodeEditor;

const editorsByNotebook = new Map<string, Map<string, CellEditor>>();
const activeCellByNotebook = new Map<string, string>();

export const registerNotebookCellEditor = (
  notebookId: string,
  cellId: string,
  editor: CellEditor,
): (() => void) => {
  let cells = editorsByNotebook.get(notebookId);
  if (!cells) {
    cells = new Map();
    editorsByNotebook.set(notebookId, cells);
  }
  cells.set(cellId, editor);

  return () => {
    const current = editorsByNotebook.get(notebookId);
    // A newer editor for the same cell may have replaced this one; leave it.
    if (!current || current.get(cellId) !== editor) return;

    current.delete(cellId);
    if (current.size === 0) editorsByNotebook.delete(notebookId);
    if (activeCellByNotebook.get(notebookId) === cellId) {
      activeCellByNotebook.delete(notebookId);
    }
  };
};

export const setActiveNotebookCell = (
  notebookId: string,
  cellId: string,
): void => {
  activeCellByNotebook.set(notebookId, cellId);
};

export const getActiveNotebookCellId = (
  notebookId: string,
): string | undefined => activeCellByNotebook.get(notebookId);

/**
 * The editor of the most recently focused cell, or `null` when no cell has
 * been focused yet (or it has since unmounted).
 */
export const getActiveNotebookCellEditor = (
  notebookId: string,
): CellEditor | null => {
  const cellId = activeCellByNotebook.get(notebookId);
  if (!cellId) return null;
  return editorsByNotebook.get(notebookId)?.get(cellId) ?? null;
};

/** Test helper. */
export const resetNotebookCellEditorRegistry = (): void => {
  editorsByNotebook.clear();
  activeCellByNotebook.clear();
};
