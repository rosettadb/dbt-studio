/**
 * Insert text into a Monaco editor at the cursor (or a given position).
 *
 * Uses `executeEdits` rather than `setValue` so the edit is undoable, fires
 * `onDidChangeModelContent` (which keeps React-controlled editors in sync via
 * their `onChange`), and does not reset the view state.
 *
 * Only type imports from `monaco-editor` are used so this module can be unit
 * tested without loading the Monaco bundle.
 */

import type * as monaco from 'monaco-editor';

export type InsertTextOptions = {
  /** Insert at this position instead of the current selection. */
  position?: monaco.IPosition | null;
  /** Focus the editor after inserting. Defaults to true. */
  focus?: boolean;
  /** Undo-stack source label. */
  source?: string;
};

type EditorLike = Pick<
  monaco.editor.ICodeEditor,
  | 'getModel'
  | 'getSelection'
  | 'getPosition'
  | 'executeEdits'
  | 'setPosition'
  | 'revealPositionInCenterIfOutsideViewport'
  | 'focus'
>;

/**
 * Returns `true` when the text was inserted, `false` when the editor has no
 * model (e.g. it was disposed).
 */
export const insertTextAtCursor = (
  editor: EditorLike | null | undefined,
  text: string,
  options: InsertTextOptions = {},
): boolean => {
  if (!editor) return false;
  const model = editor.getModel();
  if (!model) return false;

  let range: monaco.IRange;
  if (options.position) {
    const { lineNumber, column } = options.position;
    range = {
      startLineNumber: lineNumber,
      startColumn: column,
      endLineNumber: lineNumber,
      endColumn: column,
    };
  } else {
    const selection = editor.getSelection();
    if (selection) {
      range = {
        startLineNumber: selection.startLineNumber,
        startColumn: selection.startColumn,
        endLineNumber: selection.endLineNumber,
        endColumn: selection.endColumn,
      };
    } else {
      const position = editor.getPosition() ?? { lineNumber: 1, column: 1 };
      range = {
        startLineNumber: position.lineNumber,
        startColumn: position.column,
        endLineNumber: position.lineNumber,
        endColumn: position.column,
      };
    }
  }

  editor.executeEdits(options.source ?? 'schema-tree', [
    { range, text, forceMoveMarkers: true },
  ]);

  const startOffset = model.getOffsetAt({
    lineNumber: range.startLineNumber,
    column: range.startColumn,
  });
  const endPosition = model.getPositionAt(startOffset + text.length);
  editor.setPosition(endPosition);
  editor.revealPositionInCenterIfOutsideViewport(endPosition);

  if (options.focus !== false) {
    editor.focus();
  }
  return true;
};

/**
 * Resolve the text position under a client-space point, e.g. from a drop
 * event. Returns `null` when the point is outside the text area.
 */
export const getPositionAtClientPoint = (
  editor:
    | Pick<monaco.editor.ICodeEditor, 'getTargetAtClientPoint'>
    | null
    | undefined,
  clientX: number,
  clientY: number,
): monaco.IPosition | null => {
  if (!editor) return null;
  const target = editor.getTargetAtClientPoint(clientX, clientY);
  return target?.position ?? null;
};
