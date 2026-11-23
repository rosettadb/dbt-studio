/**
 * Tokenizer for the analytics expression language: a small, safe subset of
 * JavaScript expressions used in `{inline}` values, `{#if}` / `{#each}`
 * blocks, `${...}` SQL interpolation and `attr={...}` props.
 */

export type TokenType = 'number' | 'string' | 'identifier' | 'punct' | 'eof';

export interface Token {
  type: TokenType;
  value: string;
  pos: number;
}

export class ExpressionSyntaxError extends Error {
  readonly pos: number;

  constructor(message: string, pos: number) {
    super(message);
    this.name = 'ExpressionSyntaxError';
    this.pos = pos;
  }
}

// Longest first so that `===` wins over `==` and `=`.
const PUNCTUATORS = [
  '===',
  '!==',
  '?.',
  '??',
  '==',
  '!=',
  '<=',
  '>=',
  '&&',
  '||',
  '(',
  ')',
  '[',
  ']',
  '{',
  '}',
  '.',
  ',',
  ':',
  '?',
  '+',
  '-',
  '*',
  '/',
  '%',
  '!',
  '<',
  '>',
];

const isDigit = (ch: string) => ch >= '0' && ch <= '9';
const isIdentStart = (ch: string) => /[A-Za-z_$]/.test(ch);
const isIdentPart = (ch: string) => /[A-Za-z0-9_$]/.test(ch);

const ESCAPES: Record<string, string> = {
  n: '\n',
  t: '\t',
  r: '\r',
  b: '\b',
  f: '\f',
  v: '\v',
  '0': '\0',
};

export const MAX_EXPRESSION_LENGTH = 4000;

export function tokenize(source: string): Token[] {
  if (source.length > MAX_EXPRESSION_LENGTH) {
    throw new ExpressionSyntaxError('Expression is too long', 0);
  }
  const tokens: Token[] = [];
  let i = 0;

  while (i < source.length) {
    const ch = source[i];

    if (/\s/.test(ch)) {
      i += 1;
    } else if (isDigit(ch) || (ch === '.' && isDigit(source[i + 1] ?? ''))) {
      const start = i;
      while (i < source.length && isDigit(source[i])) i += 1;
      if (source[i] === '.' && isDigit(source[i + 1] ?? '')) {
        i += 1;
        while (i < source.length && isDigit(source[i])) i += 1;
      }
      if (source[i] === 'e' || source[i] === 'E') {
        const save = i;
        i += 1;
        if (source[i] === '+' || source[i] === '-') i += 1;
        if (!isDigit(source[i] ?? '')) {
          i = save;
        } else {
          while (i < source.length && isDigit(source[i])) i += 1;
        }
      }
      tokens.push({
        type: 'number',
        value: source.slice(start, i),
        pos: start,
      });
    } else if (ch === '"' || ch === "'" || ch === '`') {
      const quote = ch;
      const start = i;
      i += 1;
      let value = '';
      let closed = false;
      while (i < source.length) {
        const c = source[i];
        if (c === '\\') {
          const next = source[i + 1];
          if (next === undefined) break;
          value += ESCAPES[next] ?? next;
          i += 2;
        } else if (c === quote) {
          closed = true;
          i += 1;
          break;
        } else {
          if (quote === '`' && c === '$' && source[i + 1] === '{') {
            throw new ExpressionSyntaxError(
              'Template literals with ${} are not supported; use + to join strings',
              i,
            );
          }
          value += c;
          i += 1;
        }
      }
      if (!closed) {
        throw new ExpressionSyntaxError('Unterminated string', start);
      }
      tokens.push({ type: 'string', value, pos: start });
    } else if (isIdentStart(ch)) {
      const start = i;
      while (i < source.length && isIdentPart(source[i])) i += 1;
      tokens.push({
        type: 'identifier',
        value: source.slice(start, i),
        pos: start,
      });
    } else {
      const at = i;
      const punct = PUNCTUATORS.find((p) => source.startsWith(p, at));
      if (!punct) {
        throw new ExpressionSyntaxError(`Unexpected character "${ch}"`, i);
      }
      // `?.` followed by a digit is a ternary followed by a number (a?.5:1)
      if (punct === '?.' && isDigit(source[i + 2] ?? '')) {
        tokens.push({ type: 'punct', value: '?', pos: i });
        i += 1;
      } else {
        tokens.push({ type: 'punct', value: punct, pos: i });
        i += punct.length;
      }
    }
  }

  tokens.push({ type: 'eof', value: '', pos: source.length });
  return tokens;
}
