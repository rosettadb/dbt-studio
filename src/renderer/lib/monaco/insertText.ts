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

import {
  parseSqlEditorStatements,
  type ParsedStatement,
} from '../../components/sqlEditor/editorComponent/statements';

export type InsertTextOptions = {
  /** Insert at this position instead of the current selection. */
  position?: monaco.IPosition | null;
  /** Focus the editor after inserting. Defaults to true. */
  focus?: boolean;
  /** Undo-stack source label. */
  source?: string;
  /**
   * Treat the text as a full statement: add only the line breaks needed so a
   * blank line separates it from any text above and below. A cursor inside an
   * existing statement inserts after that statement rather than splitting it;
   * an explicit `position` or a selection is still used as given.
   */
  asStatement?: boolean;
};

type ModelLike = Pick<
  monaco.editor.ITextModel,
  | 'getLineContent'
  | 'getLineCount'
  | 'getValue'
  | 'getOffsetAt'
  | 'getPositionAt'
>;

/**
 * The parser leaves a statement's semicolon out, and a `--` comment after it
 * on the same line belongs with it, so include both here.
 */
const statementEndOffsetWithSemicolonAndComment = (
  model: ModelLike,
  statement: ParsedStatement,
): number => {
  const statementEndOffset = model.getOffsetAt({
    lineNumber: statement.endLine,
    column: statement.endColumn,
  });
  const textAfterStatement = model.getValue().slice(statementEndOffset);
  const trimmedTextAfterStatement = textAfterStatement.trimStart();
  const whitespaceLength =
    textAfterStatement.length - trimmedTextAfterStatement.length;
  const endOffset = trimmedTextAfterStatement.startsWith(';')
    ? statementEndOffset + whitespaceLength + 1
    : statementEndOffset;

  const { lineNumber, column } = model.getPositionAt(endOffset);
  const endLine = model.getLineContent(lineNumber);
  const textAfterEnd = endLine.slice(column - 1).trimStart();
  if (!textAfterEnd.startsWith('--')) return endOffset;
  return model.getOffsetAt({ lineNumber, column: endLine.length + 1 });
};

/** The end of the statement the cursor is inside, or null if it is in none. */
const endOfStatementAroundCursor = (
  model: ModelLike,
  cursor: monaco.IPosition,
): monaco.IPosition | null => {
  const cursorOffset = model.getOffsetAt(cursor);
  // Statements are in document order and never overlap, so only the last one
  // starting before the cursor can contain it.
  const statementsStartingBeforeCursor = parseSqlEditorStatements(model).filter(
    (statement) =>
      model.getOffsetAt({
        lineNumber: statement.startLine,
        column: statement.startColumn,
      }) < cursorOffset,
  );
  const closestStatement =
    statementsStartingBeforeCursor[statementsStartingBeforeCursor.length - 1];
  if (!closestStatement) return null;

  const endOffset = statementEndOffsetWithSemicolonAndComment(
    model,
    closestStatement,
  );
  return cursorOffset < endOffset ? model.getPositionAt(endOffset) : null;
};

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

  const isCursorWithoutSelection =
    !options.position &&
    range.startLineNumber === range.endLineNumber &&
    range.startColumn === range.endColumn;
  if (options.asStatement && isCursorWithoutSelection) {
    const statementEnd = endOfStatementAroundCursor(model, {
      lineNumber: range.startLineNumber,
      column: range.startColumn,
    });
    if (statementEnd) {
      range = {
        startLineNumber: statementEnd.lineNumber,
        startColumn: statementEnd.column,
        endLineNumber: statementEnd.lineNumber,
        endColumn: statementEnd.column,
      };
    }
  }

  // The cursor lands at the end of the statement, not after the padding.
  let insertedText = text;
  let insertedTextUpToCursor = text;
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
    insertedTextUpToCursor = before + text;
  }

  editor.executeEdits(options.source ?? 'schema-tree', [
    { range, text: insertedText, forceMoveMarkers: true },
  ]);

  // Count lines rather than characters: with CRLF models a line break is two
  // characters in the model but one in `text`, so offsets would land early.
  const insertedLines = insertedTextUpToCursor.split('\n');
  const lastInsertedLine = insertedLines[insertedLines.length - 1];
  const endPosition =
    insertedLines.length === 1
      ? {
          lineNumber: range.startLineNumber,
          column: range.startColumn + lastInsertedLine.length,
        }
      : {
          lineNumber: range.startLineNumber + insertedLines.length - 1,
          column: lastInsertedLine.length + 1,
        };
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
