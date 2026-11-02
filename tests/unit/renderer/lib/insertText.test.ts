import {
  getPositionAtClientPoint,
  insertTextAtCursor,
} from '../../../../src/renderer/lib/monaco/insertText';

type Pos = { lineNumber: number; column: number };

/**
 * A tiny single-buffer model that understands offsets and positions.
 * `eolLength` 2 makes offsets count line breaks like a CRLF Monaco model.
 */
const createFakeModel = (initial: string, eolLength = 1) => {
  let value = initial;
  const lines = () => value.split('\n');
  return {
    getValue: () => value,
    getLineContent: (lineNumber: number) => lines()[lineNumber - 1],
    getLineCount: () => lines().length,
    getOffsetAt: ({ lineNumber, column }: Pos) => {
      const ls = lines();
      let offset = 0;
      for (let i = 0; i < lineNumber - 1; i += 1) {
        offset += ls[i].length + eolLength;
      }
      return offset + column - 1;
    },
    getPositionAt: (offset: number): Pos => {
      const ls = lines();
      let remaining = offset;
      for (let i = 0; i < ls.length; i += 1) {
        if (remaining <= ls[i].length) {
          return { lineNumber: i + 1, column: remaining + 1 };
        }
        remaining -= ls[i].length + eolLength;
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
  eolLength = 1,
) => {
  const model = createFakeModel(initial, eolLength);
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

describe('insertTextAtCursor with asStatement', () => {
  const statement = 'SELECT *\nFROM t;';
  const insertStatementAt = (
    initial: string,
    lineNumber: number,
    column: number,
  ) => {
    const editor = createFakeEditor(initial);
    insertTextAtCursor(editor as any, statement, {
      position: { lineNumber, column },
      asStatement: true,
    });
    return editor;
  };

  it('adds no blank lines in an empty editor', () => {
    const editor = insertStatementAt('', 1, 1);
    expect(editor.model.getValue()).toBe(statement);
  });

  it('adds a blank line after text on the same line', () => {
    const editor = insertStatementAt('select 1;', 1, 10);
    expect(editor.model.getValue()).toBe(`select 1;\n\n${statement}`);
  });

  it('adds one line break when the cursor is on an empty line under text', () => {
    const editor = insertStatementAt('select 1;\n', 2, 1);
    expect(editor.model.getValue()).toBe(`select 1;\n\n${statement}`);
  });

  it('adds nothing when a blank line is already above', () => {
    const editor = insertStatementAt('select 1;\n\n', 3, 1);
    expect(editor.model.getValue()).toBe(`select 1;\n\n${statement}`);
  });

  it('separates text on both sides when inserted mid-line', () => {
    const editor = insertStatementAt('select 1; select 2;', 1, 11);
    expect(editor.model.getValue()).toBe(
      `select 1; \n\n${statement}\n\nselect 2;`,
    );
  });

  it('adds a blank line before text on the next line', () => {
    const editor = insertStatementAt('\nselect 2;', 1, 1);
    expect(editor.model.getValue()).toBe(`${statement}\n\nselect 2;`);
  });

  it('puts the cursor at the end of the statement, not after the padding', () => {
    const editor = insertStatementAt('select 1; select 2;', 1, 11);
    expect(editor.position).toEqual({ lineNumber: 4, column: 8 });
  });

  it('puts the cursor at the end of the statement with CRLF line endings', () => {
    // Windows models count each line break as two characters in offsets, so
    // the cursor must be placed by lines, not by the inserted text's length.
    const editor = createFakeEditor('select 1;', undefined, 2);
    insertTextAtCursor(editor as any, statement, {
      position: { lineNumber: 1, column: 10 },
      asStatement: true,
    });
    expect(editor.position).toEqual({ lineNumber: 4, column: 8 });
  });

  describe('with the cursor inside an existing statement', () => {
    const insertStatementAtCursor = (
      initial: string,
      lineNumber: number,
      column: number,
    ) => {
      const editor = createFakeEditor(initial, {
        startLineNumber: lineNumber,
        startColumn: column,
        endLineNumber: lineNumber,
        endColumn: column,
      });
      insertTextAtCursor(editor as any, statement, { asStatement: true });
      return editor;
    };

    it('inserts after the statement instead of splitting it', () => {
      const editor = insertStatementAtCursor('select col from t;', 1, 10);
      expect(editor.model.getValue()).toBe(
        `select col from t;\n\n${statement}`,
      );
      expect(editor.position).toEqual({ lineNumber: 4, column: 8 });
    });

    it('keeps a multi-line INSERT whole and the next statement apart', () => {
      const editor = insertStatementAtCursor(
        'insert into c (a, b)\nvalues (1, 2);\n\nselect 2;',
        2,
        12,
      );
      expect(editor.model.getValue()).toBe(
        `insert into c (a, b)\nvalues (1, 2);\n\n${statement}\n\nselect 2;`,
      );
    });

    it('treats the cursor right before the semicolon as inside', () => {
      const editor = insertStatementAtCursor('select 1;', 1, 9);
      expect(editor.model.getValue()).toBe(`select 1;\n\n${statement}`);
    });

    it('finds a semicolon on the line after the statement', () => {
      const editor = insertStatementAtCursor('select 1\n;', 1, 5);
      expect(editor.model.getValue()).toBe(`select 1\n;\n\n${statement}`);
    });

    it('inserts after a statement with no semicolon', () => {
      const editor = insertStatementAtCursor('select col from t', 1, 10);
      expect(editor.model.getValue()).toBe(`select col from t\n\n${statement}`);
    });

    it('finds the end of the statement with CRLF line endings', () => {
      const editor = insertStatementAtCursor(
        'insert into c (a)\r\nvalues (1);',
        2,
        9,
      );
      expect(editor.model.getValue()).toBe(
        `insert into c (a)\r\nvalues (1);\n\n${statement}`,
      );
    });

    it('stays at the cursor at the start of a statement', () => {
      const editor = insertStatementAtCursor('select 1;', 1, 1);
      expect(editor.model.getValue()).toBe(`${statement}\n\nselect 1;`);
    });

    it('stays at the cursor right after the semicolon', () => {
      const editor = insertStatementAtCursor('select 1;', 1, 10);
      expect(editor.model.getValue()).toBe(`select 1;\n\n${statement}`);
    });

    it('stays at the cursor on an empty line between statements', () => {
      const editor = insertStatementAtCursor('select 1;\n\nselect 2;', 2, 1);
      expect(editor.model.getValue()).toBe(
        `select 1;\n\n${statement}\n\nselect 2;`,
      );
    });

    it('keeps an explicit position such as a drop', () => {
      const editor = insertStatementAt('select col from t;', 1, 10);
      expect(editor.model.getValue()).toBe(
        `select co\n\n${statement}\n\nl from t;`,
      );
    });

    it('replaces a selection rather than moving', () => {
      const editor = createFakeEditor('select col from t;', {
        startLineNumber: 1,
        startColumn: 8,
        endLineNumber: 1,
        endColumn: 11,
      });
      insertTextAtCursor(editor as any, statement, { asStatement: true });
      expect(editor.model.getValue()).toBe(
        `select \n\n${statement}\n\n from t;`,
      );
    });
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
