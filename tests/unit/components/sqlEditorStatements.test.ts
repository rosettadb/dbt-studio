import { parseOracleEditorStatements } from '../../../src/renderer/components/sqlEditor/editorComponent/oracleStatements';
import { parseSqlEditorStatements } from '../../../src/renderer/components/sqlEditor/editorComponent/statements';

function parse(sql: string, type = 'oracle') {
  const parser =
    type === 'oracle' ? parseOracleEditorStatements : parseSqlEditorStatements;
  return parser({
    getValue: () => sql,
    getPositionAt: (offset: number) => {
      const lines = sql.slice(0, offset).split('\n');
      return {
        lineNumber: lines.length,
        column: lines[lines.length - 1].length + 1,
      };
    },
  });
}

describe('SQL editor statement selection', () => {
  it('runs an Oracle anonymous block with its internal and terminal semicolons', () => {
    const block =
      "BEGIN\n  INSERT INTO T VALUES ('semi; /');\n\n  UPDATE T SET X = 2;\nEND;";
    expect(
      parse(`${block}\n/\nSELECT 1 FROM DUAL;`).map((s) => s.text),
    ).toEqual([block, 'SELECT 1 FROM DUAL']);
  });
  it('keeps DECLARE and nested blocks together without a slash at EOF', () => {
    const block = 'DECLARE x NUMBER;\nBEGIN\n BEGIN NULL; END;\nEND;';
    expect(parse(block)).toEqual([
      expect.objectContaining({ text: block, startLine: 1, endLine: 4 }),
    ]);
  });
  it('keeps stored PL/SQL bodies and comments together', () => {
    const block =
      'CREATE OR REPLACE PACKAGE BODY p AS\n PROCEDURE f IS BEGIN NULL; END;\nEND p;';
    expect(
      parse(`-- header\n${block}\n / \nBEGIN NULL; END;\n/`).map((s) => s.text),
    ).toEqual([block, 'BEGIN NULL; END;']);
  });
  it('does not treat a slash inside a string or comment as a delimiter', () => {
    const block = "BEGIN\n x := 'line\n/\ntext';\n/*\n/\n*/\nNULL; END;";
    expect(parse(block).map((s) => s.text)).toEqual([block]);
  });
  it('preserves existing non-Oracle semicolon and blank-line splitting', () => {
    expect(
      parse('BEGIN;\nSELECT 1;\nCOMMIT;\n\nSELECT 2', 'postgres').map(
        (s) => s.text,
      ),
    ).toEqual(['BEGIN', 'SELECT 1', 'COMMIT', 'SELECT 2']);
  });
  it('preserves WITH and INSERT SELECT continuation for ordinary SQL', () => {
    expect(
      parse(
        'WITH x AS (SELECT 1 n)\nSELECT n FROM x;\nINSERT INTO t\nSELECT 1 FROM DUAL;',
      ).map((s) => s.text),
    ).toEqual([
      'WITH x AS (SELECT 1 n)\nSELECT n FROM x',
      'INSERT INTO t\nSELECT 1 FROM DUAL',
    ]);
  });
  it.each(['\n', '\r\n'])(
    'retains exact block positions across ordinary SQL and slash lines with %j',
    (newline) => {
      const sql = [
        'SELECT 1;',
        'BEGIN',
        ' NULL;',
        'END;',
        ' / ',
        'SELECT 2;',
        'DECLARE x NUMBER;',
        'BEGIN NULL; END;',
        '/',
        'SELECT 3;',
      ].join(newline);
      expect(parse(sql)).toEqual([
        expect.objectContaining({ text: 'SELECT 1', startLine: 1, endLine: 1 }),
        expect.objectContaining({
          text: ['BEGIN', ' NULL;', 'END;'].join(newline),
          startLine: 2,
          endLine: 4,
          endColumn: 5,
        }),
        expect.objectContaining({ text: 'SELECT 2', startLine: 6, endLine: 6 }),
        expect.objectContaining({
          text: ['DECLARE x NUMBER;', 'BEGIN NULL; END;'].join(newline),
          startLine: 7,
          endLine: 8,
        }),
        expect.objectContaining({
          text: 'SELECT 3',
          startLine: 10,
          endLine: 10,
        }),
      ]);
    },
  );
  it('keeps ordinary transaction parsing independent of Oracle block parsing', () => {
    const sql = 'BEGIN;\nSELECT 1;\nCOMMIT;';
    expect(
      parseSqlEditorStatements({
        getValue: () => sql,
        getPositionAt: (offset) => ({
          lineNumber: sql.slice(0, offset).split('\n').length,
          column: offset - sql.lastIndexOf('\n', offset - 1),
        }),
      }).map((statement) => statement.text),
    ).toEqual(['BEGIN', 'SELECT 1', 'COMMIT']);
  });
});
