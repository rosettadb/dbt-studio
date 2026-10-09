/* eslint-disable no-plusplus, no-continue */
import { isOraclePlSql } from '../../../../shared/oracle';
import {
  parseSqlEditorStatements,
  ParsedStatement,
  SqlStatementModel,
} from './statements';

// SQL*Plus slash delimiters are meaningful only outside strings and comments.
function findBlockEnd(
  value: string,
  start: number,
): { end: number; next: number } {
  let quote = '';
  let lineComment = false;
  let blockComment = false;
  let lastCode = start;
  for (let i = start; i < value.length; i++) {
    const ch = value[i];
    const next = value[i + 1];
    if (lineComment) {
      if (ch === '\n') lineComment = false;
      continue;
    }
    if (blockComment) {
      if (ch === '*' && next === '/') {
        blockComment = false;
        i++;
      }
      continue;
    }
    if (quote) {
      lastCode = i;
      // Oracle has no backslash escapes; only a doubled quote is an escape.
      if (quote !== '`' && ch === quote && next === quote) {
        lastCode = ++i;
      } else if (ch === quote) quote = '';
      continue;
    }
    if (ch === '-' && next === '-') {
      lineComment = true;
      i++;
      continue;
    }
    if (ch === '/' && next === '*') {
      blockComment = true;
      i++;
      continue;
    }
    if (
      ch === '/' &&
      /^\/[^\S\n]*(?:\n|$)/.test(value.slice(i)) &&
      /^[ \t\r]*$/.test(value.slice(value.lastIndexOf('\n', i - 1) + 1, i))
    ) {
      return { end: lastCode + 1, next: i + 1 };
    }
    if (/\s/.test(ch)) continue;
    if (ch === "'" || ch === '"' || ch === '`') quote = ch;
    lastCode = i;
  }
  return { end: value.length, next: value.length };
}

export function parseOracleEditorStatements(
  model: SqlStatementModel,
): ParsedStatement[] {
  const value = model.getValue();
  const lineStarts = [0];
  for (let i = 0; i < value.length; i++)
    if (value[i] === '\n') lineStarts.push(i + 1);
  const statements: ParsedStatement[] = [];
  let cursor = 0;
  while (cursor < value.length) {
    const offset = cursor;
    const ordinary = parseSqlEditorStatements(
      {
        getValue: () => value.slice(offset),
        getPositionAt: (position) => model.getPositionAt(offset + position),
      },
      { backslashEscapes: false },
    );
    const blockIndex = ordinary.findIndex((statement) => {
      const start =
        lineStarts[statement.startLine - 1] + statement.startColumn - 1;
      return isOraclePlSql(value.slice(start));
    });
    if (blockIndex === -1) {
      statements.push(...ordinary);
      break;
    }
    statements.push(...ordinary.slice(0, blockIndex));
    const block = ordinary[blockIndex];
    const start = lineStarts[block.startLine - 1] + block.startColumn - 1;
    const boundary = findBlockEnd(value, start);
    const text = value.slice(start, boundary.end).trimEnd();
    const end = model.getPositionAt(start + text.length);
    statements.push({
      ...block,
      text,
      endLine: end.lineNumber,
      endColumn: end.column,
    });
    cursor = boundary.next;
  }
  return statements;
}
