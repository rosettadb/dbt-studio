/* eslint-disable no-plusplus, no-continue */
import React, { useEffect, useRef } from 'react';
import MonacoEditor, { OnMount, OnChange } from '@monaco-editor/react';
import * as monaco from 'monaco-editor';
import { useTheme, Box, CircularProgress, Typography } from '@mui/material';
import { projectsServices } from '../../../services';
import { Container } from './styles';
import { Shimmer } from '../../shimmer';
import { CompletionItem } from '../../../../types/frontend';

type Props = {
  filePath?: string;
  content: string;
  setContent: (value: string) => void;
  completions?: Omit<CompletionItem, 'range'>[];
  editorRef?: React.MutableRefObject<monaco.editor.IStandaloneCodeEditor | null>;
  onRunSelected?: (query: string) => void;
  isLoading?: boolean;
};

type ParsedStatement = {
  startLine: number;
  startColumn: number;
  endLine: number;
  endColumn: number;
  text: string;
};

// Keywords that almost unambiguously start a new top-level SQL statement.
// Deliberately excluded: SET (clashes with UPDATE ... SET), FETCH (clashes
// with ORDER BY ... FETCH NEXT), END (CASE...END), EXECUTE (CALL ... EXECUTE).
const STATEMENT_KEYWORDS = new Set<string>([
  'SELECT',
  'WITH',
  'INSERT',
  'UPDATE',
  'DELETE',
  'MERGE',
  'CREATE',
  'ALTER',
  'DROP',
  'TRUNCATE',
  'GRANT',
  'REVOKE',
  'EXPLAIN',
  'ANALYZE',
  'VACUUM',
  'BEGIN',
  'START',
  'COMMIT',
  'ROLLBACK',
  'SAVEPOINT',
  'RELEASE',
  'RESET',
  'SHOW',
  'CALL',
  'DO',
  'COPY',
  'DECLARE',
  'PREPARE',
  'DEALLOCATE',
  'REFRESH',
  'REINDEX',
  'CLUSTER',
  'LOCK',
  'LISTEN',
  'NOTIFY',
  'UNLISTEN',
]);

// If the previous token is one of these, the next line is a continuation of
// the same statement — don't split, even if it starts with SELECT/INSERT/etc.
const CONTINUATION_TOKENS = new Set<string>([
  'UNION',
  'INTERSECT',
  'EXCEPT',
  'ALL',
  'DISTINCT',
  'AND',
  'OR',
  'NOT',
  'IN',
  'IS',
  'BETWEEN',
  'LIKE',
  'ILIKE',
  'EXISTS',
  'ANY',
  'SOME',
  'AS',
  'ON',
  'USING',
  'INTO',
  'FROM',
  'VALUES',
  'RETURNING',
  'SET',
  'WHEN',
  'THEN',
  'ELSE',
  'CASE',
  'JOIN',
  'INNER',
  'LEFT',
  'RIGHT',
  'FULL',
  'OUTER',
  'CROSS',
  'NATURAL',
  'WHERE',
  'GROUP',
  'BY',
  'HAVING',
  'ORDER',
  'LIMIT',
  'OFFSET',
  'COLLATE',
  'NULLS',
  'LAST',
  'FIRST',
  'ASC',
  'DESC',
  'OVER',
  'PARTITION',
  'RANGE',
  'PRECEDING',
  'FOLLOWING',
  'CURRENT',
  'UNBOUNDED',
  'FILTER',
  'WITHIN',
  'ROW',
  'ROWS',
  'ONLY',
  'NEXT',
  'FETCH',
  'FOR',
  'SHARE',
  'OF',
  'NOWAIT',
  'ESCAPE',
  'SIMILAR',
  'AT',
  'TIME',
  'ZONE',
]);

const CONTINUATION_PUNCT = new Set<string>([
  ',',
  '(',
  '+',
  '-',
  '*',
  '/',
  '%',
  '=',
  '<',
  '>',
  '<=',
  '>=',
  '<>',
  '!=',
  '||',
  '&&',
  '.',
  '::',
  ':=',
]);

const TWO_CHAR_OPERATORS = new Set<string>([
  '<=',
  '>=',
  '<>',
  '!=',
  '||',
  '&&',
  '::',
  ':=',
]);

export const SqlEditorComponent: React.FC<Props> = ({
  filePath,
  content,
  setContent,
  completions = [],
  editorRef,
  onRunSelected,
  isLoading,
}) => {
  const theme = useTheme();
  const isDarkMode = theme.palette.mode === 'dark';
  const monacoTheme = isDarkMode ? 'vs-dark' : 'light';

  const saveDebounce = useRef<ReturnType<typeof setTimeout> | null>(null);
  const decorationIdsRef = useRef<string[]>([]);
  const monacoInstanceRef = useRef<typeof monaco | null>(null);
  const completionProviderRef = useRef<monaco.IDisposable | null>(null);
  const editorInstanceRef = useRef<monaco.editor.IStandaloneCodeEditor | null>(
    null,
  );
  const statementsRef = useRef<ParsedStatement[]>([]);

  const handleChange: OnChange = (value) => {
    if (value === undefined) return;

    setContent(value);

    if (filePath) {
      if (saveDebounce.current) clearTimeout(saveDebounce.current);
      saveDebounce.current = setTimeout(() => {
        projectsServices.saveFileContent({ path: filePath, content: value });
      }, 500);
    }
  };

  // Tokenize content respecting strings, identifiers, and comments, then split
  // statements on three signals in priority order:
  //  1. `;` at paren depth 0 (hard delimiter — universal SQL)
  //  2. blank line at paren depth 0 (visual separator)
  //  3. a top-level statement keyword (SELECT, INSERT, UPDATE, …) that starts
  //     a new line at paren depth 0, *unless* the previous statement ends in a
  //     token that says "more is coming" (UNION, AND, comma, operator, …).
  //
  // INSERT/MERGE/CREATE bodies often contain SELECT/VALUES on a new line as
  // part of the same statement, so we suppress (3) inside those; use `;` or a
  // blank line to split them. WITH treats `)` as a continuation so
  // `WITH x AS (...) \n SELECT * FROM x` stays one statement.
  const parseStatements = (
    model: monaco.editor.ITextModel,
  ): ParsedStatement[] => {
    const value = model.getValue();
    const segments: { start: number; end: number }[] = [];

    let stmtStart = -1;
    let lastNonWsOffset = -1;
    let lastSemanticToken = '';
    let segmentFirstKeyword = '';
    let parenDepth = 0;
    let inSingleQuote = false;
    let inDoubleQuote = false;
    let inBacktick = false;
    let inLineComment = false;
    let inBlockComment = false;
    let newlinesSeen = 0;

    const flush = (end: number) => {
      if (stmtStart === -1) return;
      if (end > stmtStart) segments.push({ start: stmtStart, end });
      stmtStart = -1;
      lastNonWsOffset = -1;
      lastSemanticToken = '';
      segmentFirstKeyword = '';
    };

    const startSegment = (offset: number, firstKeyword = '') => {
      stmtStart = offset;
      segmentFirstKeyword = firstKeyword;
    };

    const isLineStart = (pos: number): boolean => {
      for (let k = pos - 1; k >= 0; k--) {
        const c = value[k];
        if (c === '\n') return true;
        if (c !== ' ' && c !== '\t' && c !== '\r') return false;
      }
      return true;
    };

    const isContinuation = (token: string): boolean => {
      if (!token) return false;
      if (CONTINUATION_PUNCT.has(token)) return true;
      if (CONTINUATION_TOKENS.has(token)) return true;
      // The body of a WITH clause follows the `)` that closes the last CTE,
      // so `)` should not split when the segment started with WITH.
      if (segmentFirstKeyword === 'WITH' && token === ')') return true;
      return false;
    };

    let i = 0;
    while (i < value.length) {
      const ch = value[i];
      const nextCh = i + 1 < value.length ? value[i + 1] : '';

      if (inLineComment) {
        if (ch === '\n') {
          inLineComment = false;
          newlinesSeen += 1;
        }
        i += 1;
        continue;
      }
      if (inBlockComment) {
        if (ch === '*' && nextCh === '/') {
          inBlockComment = false;
          i += 2;
          continue;
        }
        if (ch === '\n') newlinesSeen += 1;
        i += 1;
        continue;
      }
      if (inSingleQuote) {
        if (ch === '\\' && nextCh === "'") {
          i += 2;
          continue;
        }
        if (ch === "'" && nextCh === "'") {
          i += 2;
          continue;
        }
        if (ch === "'") {
          inSingleQuote = false;
          lastNonWsOffset = i;
          lastSemanticToken = "'";
        }
        i += 1;
        continue;
      }
      if (inDoubleQuote) {
        if (ch === '\\' && nextCh === '"') {
          i += 2;
          continue;
        }
        if (ch === '"' && nextCh === '"') {
          i += 2;
          continue;
        }
        if (ch === '"') {
          inDoubleQuote = false;
          lastNonWsOffset = i;
          lastSemanticToken = '"';
        }
        i += 1;
        continue;
      }
      if (inBacktick) {
        if (ch === '`') {
          inBacktick = false;
          lastNonWsOffset = i;
          lastSemanticToken = '`';
        }
        i += 1;
        continue;
      }

      if (ch === '-' && nextCh === '-') {
        inLineComment = true;
        i += 2;
        continue;
      }
      if (ch === '/' && nextCh === '*') {
        inBlockComment = true;
        i += 2;
        continue;
      }

      if (ch === '\n') {
        newlinesSeen += 1;
        i += 1;
        continue;
      }
      if (ch === ' ' || ch === '\t' || ch === '\r') {
        i += 1;
        continue;
      }

      // First non-whitespace after a blank line at depth 0 — split here.
      if (newlinesSeen >= 2 && stmtStart !== -1 && parenDepth === 0) {
        flush(lastNonWsOffset + 1);
      }
      newlinesSeen = 0;

      if (ch === "'" || ch === '"' || ch === '`') {
        if (stmtStart === -1) startSegment(i);
        if (ch === "'") inSingleQuote = true;
        else if (ch === '"') inDoubleQuote = true;
        else inBacktick = true;
        lastNonWsOffset = i;
        lastSemanticToken = ch;
        i += 1;
        continue;
      }

      if (ch === '(') {
        if (stmtStart === -1) startSegment(i);
        parenDepth += 1;
        lastNonWsOffset = i;
        lastSemanticToken = '(';
        i += 1;
        continue;
      }
      if (ch === ')') {
        parenDepth = Math.max(0, parenDepth - 1);
        lastNonWsOffset = i;
        lastSemanticToken = ')';
        i += 1;
        continue;
      }

      if (ch === ';' && parenDepth === 0) {
        if (stmtStart !== -1) flush(i);
        i += 1;
        continue;
      }

      // Word / identifier / keyword
      if (/[A-Za-z_]/.test(ch)) {
        const wordStart = i;
        while (i < value.length && /[A-Za-z_0-9]/.test(value[i])) i += 1;
        const word = value.slice(wordStart, i).toUpperCase();

        if (
          parenDepth === 0 &&
          stmtStart !== -1 &&
          STATEMENT_KEYWORDS.has(word) &&
          isLineStart(wordStart)
        ) {
          // INSERT/MERGE/CREATE bodies often contain SELECT/VALUES on a new
          // line — don't split those mid-statement; require `;` or a blank
          // line. Other statement types use the continuation-token check.
          const isCompoundParent =
            segmentFirstKeyword === 'INSERT' ||
            segmentFirstKeyword === 'MERGE' ||
            segmentFirstKeyword === 'CREATE';

          if (!isCompoundParent && !isContinuation(lastSemanticToken)) {
            flush(lastNonWsOffset + 1);
          }
        }

        if (stmtStart === -1) {
          startSegment(wordStart, STATEMENT_KEYWORDS.has(word) ? word : '');
        }
        lastNonWsOffset = i - 1;
        lastSemanticToken = word;
        continue;
      }

      // Number / other punctuation — track position and a (maybe multi-char)
      // operator so the continuation check reads the right last token.
      if (stmtStart === -1) startSegment(i);
      lastNonWsOffset = i;

      if (i + 1 < value.length) {
        const two = ch + nextCh;
        if (TWO_CHAR_OPERATORS.has(two)) {
          lastSemanticToken = two;
          i += 2;
          continue;
        }
      }
      lastSemanticToken = ch;
      i += 1;
    }

    if (stmtStart !== -1) flush(value.length);

    const statements: ParsedStatement[] = [];
    // eslint-disable-next-line no-restricted-syntax
    for (const seg of segments) {
      let s = seg.start;
      let e = seg.end;
      while (s < e && /\s/.test(value[s])) s += 1;
      while (e > s && /\s/.test(value[e - 1])) e -= 1;
      if (e <= s) continue;
      const text = value.slice(s, e);
      const startPos = model.getPositionAt(s);
      const endPos = model.getPositionAt(e);
      statements.push({
        startLine: startPos.lineNumber,
        startColumn: startPos.column,
        endLine: endPos.lineNumber,
        endColumn: endPos.column,
        text,
      });
    }
    return statements;
  };

  const refreshRunIcons = (editor: monaco.editor.IStandaloneCodeEditor) => {
    const model = editor.getModel();
    const monacoInstance = monacoInstanceRef.current;
    if (!model || !monacoInstance) return;

    const statements = parseStatements(model);
    statementsRef.current = statements;

    const seenLines = new Set<number>();
    const newDecorations: monaco.editor.IModelDeltaDecoration[] = [];

    // eslint-disable-next-line no-restricted-syntax
    for (const stmt of statements) {
      if (seenLines.has(stmt.startLine)) continue;
      seenLines.add(stmt.startLine);

      newDecorations.push({
        range: new monacoInstance.Range(stmt.startLine, 1, stmt.startLine, 1),
        options: {
          isWholeLine: true,
          glyphMarginClassName: 'run-query-glyph',
          glyphMarginHoverMessage: { value: '▶ Run this statement' },
        },
      });
    }

    decorationIdsRef.current = editor.deltaDecorations(
      decorationIdsRef.current,
      newDecorations,
    );
  };

  const findStatementForLine = (
    lineNumber: number,
  ): ParsedStatement | undefined => {
    const statements = statementsRef.current;
    // Prefer an exact start-line match (the icon the user clicked on).
    const exact = statements.find((s) => s.startLine === lineNumber);
    if (exact) return exact;
    // Otherwise fall back to the statement that spans this line.
    return statements.find(
      (s) => s.startLine <= lineNumber && s.endLine >= lineNumber,
    );
  };

  // Register completion provider (can be called multiple times safely)
  const registerCompletionProvider = () => {
    const monacoInstance = monacoInstanceRef.current;
    if (!monacoInstance) return;

    // Dispose existing provider
    if (completionProviderRef.current) {
      completionProviderRef.current.dispose();
    }

    // Register new completion provider
    completionProviderRef.current =
      monacoInstance.languages.registerCompletionItemProvider('sql', {
        provideCompletionItems: (model, position) => {
          const word = model.getWordUntilPosition(position);
          const range = {
            startLineNumber: position.lineNumber,
            endLineNumber: position.lineNumber,
            startColumn: word.startColumn,
            endColumn: word.endColumn,
          };

          const suggestions = completions.map((item) => ({
            ...item,
            range,
          }));
          return { suggestions };
        },
      });
  };

  // Update completion provider when completions change
  useEffect(() => {
    registerCompletionProvider();
  }, [completions]);

  const handleEditorMount: OnMount = (editor, monacoInstance) => {
    monacoInstanceRef.current = monacoInstance;
    editorInstanceRef.current = editor;
    if (editorRef) editorRef.current = editor;

    // Register initial completion provider after monaco is ready
    registerCompletionProvider();

    refreshRunIcons(editor);

    editor.onDidChangeModelContent(() => {
      setTimeout(() => refreshRunIcons(editor), 150);
    });

    editor.onMouseDown((e) => {
      if (
        e.target.type ===
          monacoInstance.editor.MouseTargetType.GUTTER_GLYPH_MARGIN &&
        onRunSelected
      ) {
        const lineNumber = e.target.position?.lineNumber;
        if (!lineNumber) return;

        const stmt = findStatementForLine(lineNumber);
        if (stmt?.text) onRunSelected(stmt.text);
      }
    });
  };

  useEffect(() => {
    return () => {
      if (saveDebounce.current) clearTimeout(saveDebounce.current);
      if (completionProviderRef.current) {
        completionProviderRef.current.dispose();
      }
    };
  }, []);

  return (
    <Container>
      <MonacoEditor
        height="100%"
        width="100%"
        theme={monacoTheme}
        language="sql"
        value={content}
        onChange={handleChange}
        onMount={handleEditorMount}
        loading={<Shimmer text="Loading editor..." />}
        options={{
          fontSize: 13,
          glyphMargin: true,
          minimap: { enabled: false },
          lineNumbers: 'on',
          scrollBeyondLastLine: false,
          automaticLayout: true,
          readOnly: isLoading,
          // WordHighlighter throws "Canceled" during model swap / dispose.
          occurrencesHighlight: 'off',
          fixedOverflowWidgets: true,
        }}
      />
      {isLoading && (
        <Box
          sx={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: isDarkMode
              ? 'rgba(30, 30, 30, 0.7)'
              : 'rgba(255, 255, 255, 0.7)',
            zIndex: 10,
            backdropFilter: 'blur(2px)',
          }}
        >
          <CircularProgress size={40} thickness={4} />
          <Typography
            variant="body2"
            sx={{
              mt: 2,
              color: theme.palette.text.primary,
              fontWeight: 500,
            }}
          >
            Switching connection...
          </Typography>
        </Box>
      )}
    </Container>
  );
};
