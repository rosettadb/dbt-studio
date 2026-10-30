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
  /**
   * Treat the text as a full statement: add only the line breaks needed so a
   * blank line separates it from any text above and below.
   */
  asStatement?: boolean;
};

type ModelLike = Pick<
  monaco.editor.ITextModel,
  'getLineContent' | 'getLineCount'
>;

const lineBreaksBeforeStatement = (
  model: ModelLike,
  lineNumber: number,
  column: number,
): string => {
  const textBeforeCursor = model
    .getLineContent(lineNumber)
    .slice(0, column - 1);
  if (textBeforeCursor.trim()) return '\n\n';
  if (lineNumber === 1 || !model.getLineContent(lineNumber - 1).trim()) {
    return '';
  }
  return '\n';
};

const lineBreaksAfterStatement = (
  model: ModelLike,
  lineNumber: number,
  column: number,
): string => {
  const textAfterCursor = model.getLineContent(lineNumber).slice(column - 1);
  if (textAfterCursor.trim()) return '\n\n';
  if (
    lineNumber === model.getLineCount() ||
    !model.getLineContent(lineNumber + 1).trim()
  ) {
    return '';
  }
  return '\n';
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

  // The cursor lands at the end of the statement, not after the padding.
  let insertedText = text;
  let cursorOffset = text.length;
  if (options.asStatement) {
    const before = lineBreaksBeforeStatement(
      model,
      range.startLineNumber,
      range.startColumn,
    );
    const after = lineBreaksAfterStatement(
      model,
      range.endLineNumber,
      range.endColumn,
    );
    insertedText = before + text + after;
    cursorOffset = before.length + text.length;
  }

  editor.executeEdits(options.source ?? 'schema-tree', [
    { range, text: insertedText, forceMoveMarkers: true },
  ]);

  const startOffset = model.getOffsetAt({
    lineNumber: range.startLineNumber,
    column: range.startColumn,
  });
  const endPosition = model.getPositionAt(startOffset + cursorOffset);
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
