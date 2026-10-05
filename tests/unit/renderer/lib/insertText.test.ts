import {
  getPositionAtClientPoint,
  insertTextAtCursor,
} from '../../../../src/renderer/lib/monaco/insertText';

type Pos = { lineNumber: number; column: number };

/** A tiny single-buffer model that understands offsets and positions. */
const createFakeModel = (initial: string) => {
  let value = initial;
  const lines = () => value.split('\n');
  return {
    getValue: () => value,
    getOffsetAt: ({ lineNumber, column }: Pos) => {
      const ls = lines();
      let offset = 0;
      for (let i = 0; i < lineNumber - 1; i += 1) offset += ls[i].length + 1;
      return offset + column - 1;
    },
    getPositionAt: (offset: number): Pos => {
      const ls = lines();
      let remaining = offset;
      for (let i = 0; i < ls.length; i += 1) {
        if (remaining <= ls[i].length) {
          return { lineNumber: i + 1, column: remaining + 1 };
        }
        remaining -= ls[i].length + 1;
      }
      const last = ls.length;
      return { lineNumber: last, column: ls[last - 1].length + 1 };
    },
    applyEdit: (
      range: {
        startLineNumber: number;
        startColumn: number;
        endLineNumber: number;
        endColumn: number;
      },
      text: string,
    ) => {
      const self = createFakeModel(value);
      const start = self.getOffsetAt({
        lineNumber: range.startLineNumber,
        column: range.startColumn,
      });
      const end = self.getOffsetAt({
        lineNumber: range.endLineNumber,
        column: range.endColumn,
      });
      value = value.slice(0, start) + text + value.slice(end);
    },
  };
};

const createFakeEditor = (
  initial: string,
  selection?: {
    startLineNumber: number;
    startColumn: number;
    endLineNumber: number;
    endColumn: number;
  },
) => {
  const model = createFakeModel(initial);
  const editor = {
    model,
    position: null as Pos | null,
    revealed: null as Pos | null,
    focused: false,
    edits: [] as any[],
    getModel: () => model,
    getSelection: () => selection ?? null,
    getPosition: () => ({ lineNumber: 1, column: 1 }),
    executeEdits: (source: string, edits: any[]) => {
      editor.edits.push({ source, edits });
      edits.forEach((e) => model.applyEdit(e.range, e.text));
      return true;
    },
    setPosition: (pos: Pos) => {
      editor.position = pos;
    },
    revealPositionInCenterIfOutsideViewport: (pos: Pos) => {
      editor.revealed = pos;
    },
    focus: () => {
      editor.focused = true;
    },
  };
  return editor;
};

describe('insertTextAtCursor', () => {
  it('inserts at the collapsed selection and moves the cursor after the text', () => {
    const editor = createFakeEditor('SELECT  FROM x', {
      startLineNumber: 1,
      startColumn: 8,
      endLineNumber: 1,
      endColumn: 8,
    });

    expect(insertTextAtCursor(editor as any, 'id')).toBe(true);
    expect(editor.model.getValue()).toBe('SELECT id FROM x');
    expect(editor.position).toEqual({ lineNumber: 1, column: 10 });
    expect(editor.revealed).toEqual({ lineNumber: 1, column: 10 });
    expect(editor.focused).toBe(true);
    expect(editor.edits[0].source).toBe('schema-tree');
    expect(editor.edits[0].edits[0].forceMoveMarkers).toBe(true);
  });

  it('replaces a non-empty selection', () => {
    const editor = createFakeEditor('SELECT old FROM x', {
      startLineNumber: 1,
      startColumn: 8,
      endLineNumber: 1,
      endColumn: 11,
    });

    insertTextAtCursor(editor as any, 'new_col');
    expect(editor.model.getValue()).toBe('SELECT new_col FROM x');
  });

  it('inserts at an explicit position, ignoring the selection', () => {
    const editor = createFakeEditor('a\nb', {
      startLineNumber: 1,
      startColumn: 1,
      endLineNumber: 1,
      endColumn: 2,
    });

    insertTextAtCursor(editor as any, 'X', {
      position: { lineNumber: 2, column: 2 },
      focus: false,
      source: 'test',
    });
    expect(editor.model.getValue()).toBe('a\nbX');
    expect(editor.position).toEqual({ lineNumber: 2, column: 3 });
    expect(editor.focused).toBe(false);
    expect(editor.edits[0].source).toBe('test');
  });

  it('handles multi-line insertions', () => {
    const editor = createFakeEditor('', {
      startLineNumber: 1,
      startColumn: 1,
      endLineNumber: 1,
      endColumn: 1,
    });
    insertTextAtCursor(editor as any, 'SELECT *\nFROM t;');
    expect(editor.model.getValue()).toBe('SELECT *\nFROM t;');
    expect(editor.position).toEqual({ lineNumber: 2, column: 8 });
  });

  it('falls back to the cursor position when there is no selection', () => {
    const editor = createFakeEditor('ab');
    insertTextAtCursor(editor as any, 'X');
    expect(editor.model.getValue()).toBe('Xab');
  });

  it('returns false without an editor or model', () => {
    expect(insertTextAtCursor(null, 'x')).toBe(false);
    expect(insertTextAtCursor({ getModel: () => null } as any, 'x')).toBe(
      false,
    );
  });
});

describe('getPositionAtClientPoint', () => {
  it('returns the position under the point, or null', () => {
    const editor = {
      getTargetAtClientPoint: (x: number) =>
        x > 0 ? { position: { lineNumber: 3, column: 4 } } : null,
    };
    expect(getPositionAtClientPoint(editor as any, 10, 10)).toEqual({
      lineNumber: 3,
      column: 4,
    });
    expect(getPositionAtClientPoint(editor as any, 0, 0)).toBeNull();
    expect(getPositionAtClientPoint(null, 1, 1)).toBeNull();
  });
});
