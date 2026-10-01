/**
 * Make a Monaco editor container accept schema objects dragged from the Data
 * tree.
 *
 * Why native capture-phase listeners instead of React `onDrop`:
 * Monaco registers its own `drop` handler on the editor's DOM and inserts the
 * drag's `text/plain` (that's what makes the bare drag work even without this
 * hook). When we *do* want richer handling — precise drop position, Shift to
 * expand a table into a SELECT — we must run *before* Monaco and stop the
 * event, otherwise the text would be inserted twice. A capture-phase listener
 * on an ancestor runs before any listener on the target, so it can claim the
 * event. Drags that don't carry the schema MIME are left untouched.
 */

import { useEffect, type RefObject } from 'react';
import type * as monaco from 'monaco-editor';
import {
  buildDragSelectStatement,
  buildDragText,
  hasSchemaDragData,
  readSchemaDragData,
  type SchemaDragPayload,
} from '../utils/sql/schemaDragPayload';
import {
  getPositionAtClientPoint,
  insertTextAtCursor,
} from '../lib/monaco/insertText';

export type SchemaObjectDropOptions = {
  /** Disable the drop target without unmounting. Defaults to true. */
  enabled?: boolean;
  /** Called after text has been inserted. */
  onDropped?: (payload: SchemaDragPayload, insertedText: string) => void;
};

/** Text to insert for a drop; Shift expands tables/views into a SELECT. */
export const buildDropText = (
  payload: SchemaDragPayload,
  expand: boolean,
): string =>
  expand ? buildDragSelectStatement(payload) : buildDragText(payload);

export function useSchemaObjectDrop(
  containerRef: RefObject<HTMLElement | null>,
  getEditor: () => monaco.editor.ICodeEditor | null | undefined,
  options: SchemaObjectDropOptions = {},
): void {
  const { enabled = true, onDropped } = options;

  useEffect(() => {
    const element = containerRef.current;
    if (!element || !enabled) return undefined;

    const handleDragOver = (event: DragEvent) => {
      if (!hasSchemaDragData(event.dataTransfer)) return;
      event.preventDefault();
      if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy';
    };

    const handleDrop = (event: DragEvent) => {
      const payload = readSchemaDragData(event.dataTransfer);
      if (!payload) return;

      const editor = getEditor();
      if (!editor) return;

      // Claim the event so Monaco's default text/plain drop doesn't also fire.
      event.preventDefault();
      event.stopPropagation();

      const position =
        getPositionAtClientPoint(editor, event.clientX, event.clientY) ??
        editor.getPosition();
      const text = buildDropText(payload, event.shiftKey);

      if (insertTextAtCursor(editor, text, { position })) {
        onDropped?.(payload, text);
      }
    };

    element.addEventListener('dragover', handleDragOver, true);
    element.addEventListener('drop', handleDrop, true);
    return () => {
      element.removeEventListener('dragover', handleDragOver, true);
      element.removeEventListener('drop', handleDrop, true);
    };
  }, [containerRef, getEditor, enabled, onDropped]);
}
