/**
 * Brace- and quote-aware attribute scanner for component tags.
 *
 * Handles values the old regex could not: nested braces
 * (`options={[{a: 1}]}`), `}` inside strings, `>` inside expressions,
 * multi-line tags and boolean flags (`<DataTable search />`).
 */
import type { RawProp } from '../types';

export interface TagScanResult {
  props: RawProp[];
  selfClosing: boolean;
  /** Index just after the closing `>` of the opening tag. */
  end: number;
}

/**
 * From `start` (just after a quote), return the index of the closing quote,
 * honoring backslash escapes. -1 if not found.
 */
export function findClosingQuote(
  src: string,
  start: number,
  quote: string,
): number {
  for (let i = start; i < src.length; i += 1) {
    if (src[i] === '\\') {
      i += 1;
    } else if (src[i] === quote) {
      return i;
    }
  }
  return -1;
}

/**
 * From `start` (just after an opening `{`), return the index of the matching
 * `}`, skipping strings and nested braces. -1 if not found or if `stopAtNewline`
 * and a newline comes first.
 */
export function findMatchingBrace(
  src: string,
  start: number,
  stopAtNewline = false,
): number {
  let depth = 1;
  for (let i = start; i < src.length; i += 1) {
    const ch = src[i];
    if (ch === '\n' && stopAtNewline) return -1;
    if (ch === '"' || ch === "'" || ch === '`') {
      const close = findClosingQuote(src, i + 1, ch);
      if (close === -1) return -1;
      i = close;
    } else if (ch === '{') {
      depth += 1;
    } else if (ch === '}') {
      depth -= 1;
      if (depth === 0) return i;
    }
  }
  return -1;
}

function unescapeString(value: string): string {
  return value.replace(/\\(["'\\/bfnrt])/g, (_, c: string) => {
    switch (c) {
      case 'n':
        return '\n';
      case 't':
        return '\t';
      case 'r':
        return '\r';
      case 'b':
        return '\b';
      case 'f':
        return '\f';
      default:
        return c;
    }
  });
}

/**
 * Scan attributes starting right after the tag name. Returns null when the
 * tag never closes (the caller then treats `<` as plain text).
 */
export function scanTagAttributes(
  src: string,
  start: number,
): TagScanResult | null {
  const props: RawProp[] = [];
  let i = start;

  for (;;) {
    while (i < src.length && /\s/.test(src[i])) i += 1;
    if (i >= src.length) return null;

    if (src.startsWith('/>', i)) {
      return { props, selfClosing: true, end: i + 2 };
    }
    if (src[i] === '>') {
      return { props, selfClosing: false, end: i + 1 };
    }

    const nameMatch = /^[A-Za-z_:][\w:.-]*/.exec(src.slice(i, i + 200));
    if (!nameMatch) return null;
    const name = nameMatch[0];
    i += name.length;

    while (i < src.length && (src[i] === ' ' || src[i] === '\t')) i += 1;
    if (src[i] !== '=') {
      props.push({ name, value: { kind: 'flag' } });
    } else {
      i += 1;
      while (i < src.length && /\s/.test(src[i])) i += 1;
      const ch = src[i];
      if (ch === '"' || ch === "'") {
        const close = findClosingQuote(src, i + 1, ch);
        if (close === -1) return null;
        props.push({
          name,
          value: {
            kind: 'string',
            value: unescapeString(src.slice(i + 1, close)),
          },
        });
        i = close + 1;
      } else if (ch === '{') {
        const close = findMatchingBrace(src, i + 1);
        if (close === -1) return null;
        props.push({
          name,
          value: { kind: 'expr', source: src.slice(i + 1, close).trim() },
        });
        i = close + 1;
      } else {
        const bare = /^[^\s/>]+/.exec(src.slice(i, i + 500));
        if (!bare) return null;
        props.push({ name, value: { kind: 'string', value: bare[0] } });
        i += bare[0].length;
      }
    }
  }
}
