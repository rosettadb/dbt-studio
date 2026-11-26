/* eslint-disable no-use-before-define */

export type ParsedPropValue =
  | string
  | number
  | boolean
  | ParsedPropValue[]
  | { [key: string]: ParsedPropValue }
  | null;

export type ParsedProps = Record<string, ParsedPropValue>;

function determineQuote(
  braceVal: string | undefined,
  doubleVal: string | undefined,
  singleVal: string | undefined,
): 'brace' | 'double' | 'single' | 'none' {
  if (braceVal !== undefined) return 'brace';
  if (doubleVal !== undefined) return 'double';
  if (singleVal !== undefined) return 'single';
  return 'none';
}

function tokenizeProps(raw: string): Array<{
  key: string;
  rawValue: string;
  quote: 'brace' | 'double' | 'single' | 'none';
}> {
  const tokens: Array<{
    key: string;
    rawValue: string;
    quote: 'brace' | 'double' | 'single' | 'none';
  }> = [];
  const re =
    /(\w+)\s*=\s*(?:\{([^}]*)\}|"((?:[^"\\]|\\.)*)"|'((?:[^'\\]|\\.)*)'|([\w-]+))/g;
  let execResult: RegExpExecArray | null;
  for (
    execResult = re.exec(raw);
    execResult !== null;
    execResult = re.exec(raw)
  ) {
    const [, key, braceVal, doubleVal, singleVal, bareVal] = execResult;
    tokens.push({
      key,
      rawValue: (braceVal ?? doubleVal ?? singleVal ?? bareVal ?? '').trim(),
      quote: determineQuote(braceVal, doubleVal, singleVal),
    });
  }
  return tokens;
}

function parseBraceValue(raw: string): ParsedPropValue {
  const trimmed = raw.trim();

  if (trimmed === 'true') return true;
  if (trimmed === 'false') return false;
  if (trimmed === 'null' || trimmed === 'undefined') return null;

  const num = Number(trimmed);
  if (!Number.isNaN(num) && trimmed !== '') return num;

  if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
    return parseArrayLiteral(trimmed);
  }

  if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
    return parseObjectLiteral(trimmed);
  }

  return trimmed;
}

function parseLiteralValue(
  raw: string,
  quote: 'brace' | 'double' | 'single' | 'none',
): ParsedPropValue {
  if (quote === 'double' || quote === 'single') {
    return raw.replace(/\\(["'\\/bfnrt])/g, '$1');
  }

  if (quote === 'none') {
    if (raw === 'true') return true;
    if (raw === 'false') return false;
    if (raw === 'null' || raw === 'undefined') return null;
    const num = Number(raw);
    if (!Number.isNaN(num) && raw !== '') return num;
    return raw;
  }

  if (quote === 'brace') {
    return parseBraceValue(raw);
  }

  return raw;
}

function parseArrayLiteral(raw: string): ParsedPropValue[] {
  const inner = raw.slice(1, -1).trim();
  if (!inner) return [];

  const items: ParsedPropValue[] = [];
  const re = /(?:'([^']*)'|"([^"]*)"|([^,]+))/g;
  let execResult: RegExpExecArray | null;
  for (
    execResult = re.exec(inner);
    execResult !== null;
    execResult = re.exec(inner)
  ) {
    const val = execResult[1] ?? execResult[2] ?? execResult[3]?.trim();
    if (val !== undefined && val !== '') {
      if (execResult[1] !== undefined) {
        items.push(parseLiteralValue(val, 'single'));
      } else if (execResult[2] !== undefined) {
        items.push(parseLiteralValue(val, 'double'));
      } else {
        items.push(parseLiteralValue(val, 'none'));
      }
    }
  }
  return items;
}

function parseObjectLiteral(raw: string): Record<string, ParsedPropValue> {
  const inner = raw.slice(1, -1).trim();
  if (!inner) return {};

  const result: Record<string, ParsedPropValue> = {};
  const re = /(\w+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s,}]+))/g;
  let execResult: RegExpExecArray | null;
  for (
    execResult = re.exec(inner);
    execResult !== null;
    execResult = re.exec(inner)
  ) {
    const [, key, doubleVal, singleVal, bareVal] = execResult;
    let quoteType: 'double' | 'single' | 'none' = 'none';
    if (doubleVal !== undefined) quoteType = 'double';
    else if (singleVal !== undefined) quoteType = 'single';
    result[key] = parseLiteralValue(
      doubleVal ?? singleVal ?? bareVal ?? '',
      quoteType,
    );
  }
  return result;
}

export function parseComponentProps(raw: string): ParsedProps {
  const tokens = tokenizeProps(raw);
  const result: ParsedProps = {};
  tokens.forEach((token) => {
    result[token.key] = parseLiteralValue(token.rawValue, token.quote);
  });
  return result;
}

export function getStringProp(
  props: ParsedProps,
  key: string,
  fallback = '',
): string {
  const val = props[key];
  if (typeof val === 'string') return val;
  if (typeof val === 'number') return String(val);
  if (typeof val === 'boolean') return String(val);
  return fallback;
}

export function getBooleanProp(
  props: ParsedProps,
  key: string,
  fallback = false,
): boolean {
  const val = props[key];
  if (val === 'true' || val === true) return true;
  if (val === 'false' || val === false) return false;
  return fallback;
}

export function getNumberProp(
  props: ParsedProps,
  key: string,
  fallback?: number,
): number | undefined {
  const val = props[key];
  if (typeof val === 'number') return val;
  if (typeof val === 'string') {
    const num = Number(val);
    if (!Number.isNaN(num)) return num;
  }
  return fallback;
}

export function getArrayProp(
  props: ParsedProps,
  key: string,
): ParsedPropValue[] | undefined {
  const val = props[key];
  if (Array.isArray(val)) return val;
  if (typeof val === 'string') {
    return val
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
  }
  return undefined;
}
