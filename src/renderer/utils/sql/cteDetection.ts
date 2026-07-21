import type * as monaco from 'monaco-editor';

/* eslint-disable no-continue, no-restricted-syntax, no-cond-assign */

export interface CteInfo {
  name: string;
  range: monaco.IRange;
  queryRange: monaco.IRange;
  index: number;
  withClauseStart: number;
  withClauseStartOffset?: number;
}

export interface CteQueryBuildResult {
  query: string;
  targetCte: CteInfo;
}

const IDENTIFIER_PATTERN =
  '(?:[a-zA-Z_][a-zA-Z0-9_]*|"[^"]+"|`[^`]+`|\\[[^\\]]+\\])';
const CTE_NAME_PATTERN = `(${IDENTIFIER_PATTERN}(?:\\.${IDENTIFIER_PATTERN})*(?:\\s*\\([^)]*\\))?)`;

const isWordChar = (value: string | undefined): boolean =>
  Boolean(value && /[a-zA-Z0-9_]/.test(value));

const handleComment = (text: string, pos: number): number => {
  const char = text[pos];
  const nextChar = pos < text.length - 1 ? text[pos + 1] : '';

  if (char === '-' && nextChar === '-') {
    let endPos = pos + 2;
    while (endPos < text.length && !['\n', '\r'].includes(text[endPos])) {
      endPos += 1;
    }
    return endPos;
  }

  if (char === '/' && nextChar === '*') {
    let endPos = pos + 2;
    while (endPos < text.length - 1) {
      if (text[endPos] === '*' && text[endPos + 1] === '/') {
        return endPos + 2;
      }
      endPos += 1;
    }
    return text.length;
  }

  if (char === '{' && nextChar === '#') {
    let endPos = pos + 2;
    while (endPos < text.length - 1) {
      if (text[endPos] === '#' && text[endPos + 1] === '}') {
        return endPos + 2;
      }
      endPos += 1;
    }
    return text.length;
  }

  return pos;
};

const findMatchingClosingParen = (text: string, openPos: number): number => {
  let depth = 0;
  let inString = false;
  let stringChar = '';
  let pos = openPos;

  while (pos < text.length) {
    const commentEnd = handleComment(text, pos);
    if (!inString && commentEnd !== pos) {
      pos = commentEnd;
      continue;
    }

    const char = text[pos];
    const nextChar = pos < text.length - 1 ? text[pos + 1] : '';

    if (!inString && (char === "'" || char === '"')) {
      inString = true;
      stringChar = char;
    } else if (inString && char === stringChar) {
      if (nextChar === stringChar) {
        pos += 1;
      } else {
        inString = false;
        stringChar = '';
      }
    } else if (!inString && char === '(') {
      depth += 1;
    } else if (!inString && char === ')') {
      depth -= 1;
      if (depth === 0) {
        return pos;
      }
    }

    pos += 1;
  }

  return -1;
};

const findWithKeywords = (text: string): number[] => {
  const positions: number[] = [];
  let pos = 0;
  let inString = false;
  let stringChar = '';

  while (pos < text.length) {
    const commentEnd = handleComment(text, pos);
    if (!inString && commentEnd !== pos) {
      pos = commentEnd;
      continue;
    }

    const char = text[pos];
    const nextChar = pos < text.length - 1 ? text[pos + 1] : '';

    if (!inString && (char === "'" || char === '"')) {
      inString = true;
      stringChar = char;
    } else if (inString && char === stringChar) {
      if (nextChar === stringChar) {
        pos += 1;
      } else {
        inString = false;
        stringChar = '';
      }
    }

    if (!inString && /^with\b/i.test(text.slice(pos))) {
      const charBefore = pos > 0 ? text[pos - 1] : ' ';
      if (!isWordChar(charBefore)) {
        positions.push(pos);
      }
      pos += 4;
      continue;
    }

    pos += 1;
  }

  return positions;
};

const findWithClauseEnd = (text: string, withStartPos: number): number => {
  let pos = withStartPos;
  let depth = 0;
  let inString = false;
  let stringChar = '';

  while (pos < text.length) {
    const commentEnd = handleComment(text, pos);
    if (!inString && commentEnd !== pos) {
      pos = commentEnd;
      continue;
    }

    const char = text[pos];
    const nextChar = pos < text.length - 1 ? text[pos + 1] : '';

    if (!inString && (char === "'" || char === '"')) {
      inString = true;
      stringChar = char;
    } else if (inString && char === stringChar) {
      if (nextChar === stringChar) {
        pos += 1;
      } else {
        inString = false;
        stringChar = '';
      }
    } else if (!inString && char === '(') {
      depth += 1;
    } else if (!inString && char === ')') {
      depth = Math.max(0, depth - 1);
    }

    if (!inString && depth === 0 && /^select\b/i.test(text.slice(pos))) {
      return pos;
    }

    pos += 1;
  }

  return -1;
};

const skipWhitespaceAndComments = (text: string, startPos: number): number => {
  let pos = startPos;
  while (pos < text.length) {
    while (pos < text.length && /\s/.test(text[pos])) {
      pos += 1;
    }
    const commentEnd = handleComment(text, pos);
    if (commentEnd !== pos) {
      pos = commentEnd;
      continue;
    }
    break;
  }
  return pos;
};

const stripColumnList = (name: string): string =>
  name.replace(/\s*\([^)]*\)\s*$/, '').trim();

const quoteSqlIdentifier = (identifier: string): string => {
  if (/^[["'`]/.test(identifier) || identifier.includes('.')) {
    return identifier;
  }
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(identifier)) {
    return `"${identifier}"`;
  }
  return identifier;
};

export const detectCtes = (
  model: monaco.editor.ITextModel,
  monacoNs: typeof monaco,
): CteInfo[] => {
  const text = model.getValue();
  const ctes: CteInfo[] = [];
  const cteRegex = new RegExp(`${CTE_NAME_PATTERN}\\s+as\\s*\\(`, 'gi');

  for (const withPos of findWithKeywords(text)) {
    const withStartPos = skipWhitespaceAndComments(text, withPos + 4);
    const withEndPos = findWithClauseEnd(text, withStartPos);
    if (withEndPos === -1) {
      continue;
    }

    const withContent = text.slice(withStartPos, withEndPos);
    cteRegex.lastIndex = 0;

    let match: RegExpExecArray | null;
    while ((match = cteRegex.exec(withContent)) !== null) {
      const localCteStart = match.index;
      const localOpenParen = cteRegex.lastIndex - 1;
      const localCteEnd = findMatchingClosingParen(withContent, localOpenParen);
      if (localCteEnd === -1) {
        continue;
      }

      const cteStart = withStartPos + localCteStart;
      const queryStart = withStartPos + localOpenParen + 1;
      const queryEnd = withStartPos + localCteEnd;
      const name = stripColumnList(match[1]);

      const start = model.getPositionAt(cteStart);
      const end = model.getPositionAt(cteStart + name.length);
      const queryRangeStart = model.getPositionAt(queryStart);
      const queryRangeEnd = model.getPositionAt(queryEnd);

      ctes.push({
        name,
        range: new monacoNs.Range(
          start.lineNumber,
          start.column,
          end.lineNumber,
          end.column,
        ),
        queryRange: new monacoNs.Range(
          queryRangeStart.lineNumber,
          queryRangeStart.column,
          queryRangeEnd.lineNumber,
          queryRangeEnd.column,
        ),
        index: ctes.length,
        withClauseStart: withPos,
      });

      cteRegex.lastIndex = localCteEnd + 1;
    }
  }

  return ctes;
};

export const buildCteQuery = (
  model: monaco.editor.ITextModel,
  ctes: CteInfo[],
  cteIndex: number,
): CteQueryBuildResult | undefined => {
  const text = model.getValue();
  const targetCte = ctes[cteIndex];
  if (!targetCte) {
    return undefined;
  }

  const dependencyCtes = ctes.filter(
    (cte) =>
      cte.withClauseStart === targetCte.withClauseStart &&
      cte.index <= targetCte.index,
  );

  const cteDefinitions = dependencyCtes.map((cte) => {
    const query = model.getValueInRange(cte.queryRange);
    return `${cte.name} AS (\n${query}\n)`;
  });

  if (cteDefinitions.length === 0) {
    return undefined;
  }

  const preamble = text.slice(0, targetCte.withClauseStart).trim();
  const query = [
    preamble,
    `WITH ${cteDefinitions.join(',\n')}`,
    `SELECT * FROM ${quoteSqlIdentifier(targetCte.name)}`,
  ]
    .filter(Boolean)
    .join('\n\n');

  return { query, targetCte };
};

export const buildCteQueryFromSqlText = (
  sql: string,
  cteName: string,
): string | undefined => {
  const cteRegex = new RegExp(`${CTE_NAME_PATTERN}\\s+as\\s*\\(`, 'gi');

  for (const withPos of findWithKeywords(sql)) {
    const withStartPos = skipWhitespaceAndComments(sql, withPos + 4);
    const withEndPos = findWithClauseEnd(sql, withStartPos);
    if (withEndPos === -1) {
      continue;
    }

    const withContent = sql.slice(withStartPos, withEndPos);
    const ctes: Array<{
      name: string;
      query: string;
      withClauseStart: number;
    }> = [];
    cteRegex.lastIndex = 0;

    let targetIndex = -1;
    let match: RegExpExecArray | null;
    while ((match = cteRegex.exec(withContent)) !== null) {
      const localOpenParen = cteRegex.lastIndex - 1;
      const localCteEnd = findMatchingClosingParen(withContent, localOpenParen);
      if (localCteEnd === -1) {
        continue;
      }

      const name = stripColumnList(match[1]);
      const queryStart = withStartPos + localOpenParen + 1;
      const queryEnd = withStartPos + localCteEnd;
      ctes.push({
        name,
        query: sql.slice(queryStart, queryEnd),
        withClauseStart: withPos,
      });

      if (name === cteName) {
        targetIndex = ctes.length - 1;
        break;
      }

      cteRegex.lastIndex = localCteEnd + 1;
    }

    if (targetIndex === -1) {
      continue;
    }

    const dependencyCtes = ctes
      .filter(
        (cte, index) => cte.withClauseStart === withPos && index <= targetIndex,
      )
      .map((cte) => `${cte.name} AS (\n${cte.query}\n)`);

    return [
      sql.slice(0, withPos).trim(),
      `WITH ${dependencyCtes.join(',\n')}`,
      `SELECT * FROM ${quoteSqlIdentifier(cteName)}`,
    ]
      .filter(Boolean)
      .join('\n\n');
  }

  return undefined;
};
