/* eslint-disable no-plusplus, no-continue */
export type ParsedStatement = {
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

export type SqlStatementModel = {
  getValue(): string;
  getPositionAt(offset: number): { lineNumber: number; column: number };
};

export const parseSqlEditorStatements = (
  model: SqlStatementModel,
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
