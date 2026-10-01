import React, { useRef } from 'react';
import { render } from '@testing-library/react';

import {
  buildDropText,
  useSchemaObjectDrop,
} from '../../../../src/renderer/hooks/useSchemaObjectDrop';
import {
  SCHEMA_OBJECT_MIME,
  type SchemaDragPayload,
} from '../../../../src/renderer/utils/sql/schemaDragPayload';

const payload: SchemaDragPayload = {
  version: 1,
  kind: 'table',
  connectionType: 'postgres',
  schema: 'sales',
  table: 'orders',
  columns: ['id', 'total'],
};

const createFakeEditor = () => {
  const edits: any[] = [];
  const editor = {
    edits,
    getModel: () => ({
      getOffsetAt: () => 0,
      getPositionAt: () => ({ lineNumber: 1, column: 1 }),
    }),
    getSelection: () => null,
    getPosition: () => ({ lineNumber: 9, column: 9 }),
    getTargetAtClientPoint: (x: number) =>
      x > 0 ? { position: { lineNumber: 2, column: 3 } } : null,
    executeEdits: (_source: string, e: any[]) => {
      edits.push(...e);
      return true;
    },
    setPosition: () => {},
    revealPositionInCenterIfOutsideViewport: () => {},
    focus: () => {},
  };
  return editor;
};

const Harness: React.FC<{
  editor: any;
  enabled?: boolean;
  onDropped?: (p: SchemaDragPayload, text: string) => void;
}> = ({ editor, enabled, onDropped }) => {
  const ref = useRef<HTMLDivElement>(null);
  useSchemaObjectDrop(ref, () => editor, { enabled, onDropped });
  return (
    <div ref={ref} data-testid="container">
      <div data-testid="inner">editor</div>
    </div>
  );
};

/** jsdom has no DragEvent; build a plain Event carrying the same fields. */
const dragEvent = (
  type: string,
  init: {
    types?: string[];
    data?: Record<string, string>;
    clientX?: number;
    clientY?: number;
    shiftKey?: boolean;
  } = {},
) => {
  const event = new Event(type, { bubbles: true, cancelable: true });
  const data = init.data ?? {};
  const dataTransfer = {
    types: init.types ?? Object.keys(data),
    getData: (format: string) => data[format] ?? '',
    setData: () => {},
    dropEffect: 'none',
  };
  Object.defineProperty(event, 'dataTransfer', { value: dataTransfer });
  Object.defineProperty(event, 'clientX', { value: init.clientX ?? 10 });
  Object.defineProperty(event, 'clientY', { value: init.clientY ?? 10 });
  Object.defineProperty(event, 'shiftKey', { value: init.shiftKey ?? false });
  return { event, dataTransfer };
};

const schemaData = () => ({ [SCHEMA_OBJECT_MIME]: JSON.stringify(payload) });

describe('useSchemaObjectDrop', () => {
  it('inserts the identifier at the drop position and claims the event', () => {
    const editor = createFakeEditor();
    const onDropped = jest.fn();
    const { getByTestId } = render(
      <Harness editor={editor} onDropped={onDropped} />,
    );

    // A listener on the inner (Monaco) element must NOT run — that is what
    // prevents the double insert.
    const innerListener = jest.fn();
    getByTestId('inner').addEventListener('drop', innerListener);

    const { event } = dragEvent('drop', { data: schemaData() });
    getByTestId('inner').dispatchEvent(event);

    expect(event.defaultPrevented).toBe(true);
    expect(innerListener).not.toHaveBeenCalled();
    expect(editor.edits).toHaveLength(1);
    expect(editor.edits[0].text).toBe('sales.orders');
    expect(editor.edits[0].range).toEqual({
      startLineNumber: 2,
      startColumn: 3,
      endLineNumber: 2,
      endColumn: 3,
    });
    expect(onDropped).toHaveBeenCalledWith(payload, 'sales.orders');
  });

  it('expands tables into a SELECT when Shift is held', () => {
    const editor = createFakeEditor();
    const { getByTestId } = render(<Harness editor={editor} />);

    const { event } = dragEvent('drop', { data: schemaData(), shiftKey: true });
    getByTestId('inner').dispatchEvent(event);

    expect(editor.edits[0].text).toBe(
      'SELECT\n  id,\n  total\nFROM sales.orders\nLIMIT 100;',
    );
  });

  it('falls back to the caret when the point is outside the text', () => {
    const editor = createFakeEditor();
    const { getByTestId } = render(<Harness editor={editor} />);

    const { event } = dragEvent('drop', { data: schemaData(), clientX: 0 });
    getByTestId('inner').dispatchEvent(event);

    expect(editor.edits[0].range.startLineNumber).toBe(9);
  });

  it('allows the drop during dragover only for schema drags', () => {
    const editor = createFakeEditor();
    const { getByTestId } = render(<Harness editor={editor} />);

    const schema = dragEvent('dragover', { types: [SCHEMA_OBJECT_MIME] });
    getByTestId('inner').dispatchEvent(schema.event);
    expect(schema.event.defaultPrevented).toBe(true);
    expect(schema.dataTransfer.dropEffect).toBe('copy');

    const file = dragEvent('dragover', { types: ['Files'] });
    getByTestId('inner').dispatchEvent(file.event);
    expect(file.event.defaultPrevented).toBe(false);
  });

  it('ignores drops that do not carry the schema MIME', () => {
    const editor = createFakeEditor();
    const { getByTestId } = render(<Harness editor={editor} />);

    const innerListener = jest.fn();
    getByTestId('inner').addEventListener('drop', innerListener);

    const { event } = dragEvent('drop', { data: { 'text/plain': 'hello' } });
    getByTestId('inner').dispatchEvent(event);

    expect(event.defaultPrevented).toBe(false);
    expect(innerListener).toHaveBeenCalledTimes(1);
    expect(editor.edits).toHaveLength(0);
  });

  it('does nothing when disabled or when there is no editor', () => {
    const editor = createFakeEditor();
    const disabled = render(<Harness editor={editor} enabled={false} />);
    const first = dragEvent('drop', { data: schemaData() });
    disabled.getByTestId('inner').dispatchEvent(first.event);
    expect(first.event.defaultPrevented).toBe(false);
    disabled.unmount();

    const noEditor = render(<Harness editor={null} />);
    const second = dragEvent('drop', { data: schemaData() });
    noEditor.getByTestId('inner').dispatchEvent(second.event);
    expect(second.event.defaultPrevented).toBe(false);
  });

  it('buildDropText switches on the expand flag', () => {
    expect(buildDropText(payload, false)).toBe('sales.orders');
    expect(buildDropText(payload, true)).toContain('SELECT');
  });
});
