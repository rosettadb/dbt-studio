/**
 * Resolve a component's attributes: canonical names, evaluated expressions,
 * interpolated strings and the rows of its `data` query.
 */
import {
  aliasDefaults,
  canonicalPropName,
  ComponentNode,
  tryEvaluate,
} from '../../../../shared/analyticsBi';
import { BiPageContextValue, buildScope } from './context';

export interface ResolvedComponent {
  /** Attribute values keyed by canonical attribute name. */
  props: Record<string, unknown>;
  /** Attributes that failed to evaluate. */
  propErrors: string[];
  /** SQL block named by data={...}, if any. */
  dataQuery?: string;
  /** Rows passed through data={...}. */
  data?: unknown;
  /** Query names this component reads that have no results yet. */
  waitingOn: string[];
}

const IDENT_RE = /^[A-Za-z_$][\w$]*$/;

/** Interpolate `{expr}` inside a quoted attribute, Svelte-style. */
export function interpolateString(
  value: string,
  scope: Record<string, unknown>,
): { text: string; error?: string } {
  if (!value.includes('{') || value.includes('{{')) return { text: value };
  let out = '';
  let error: string | undefined;
  let i = 0;
  while (i < value.length) {
    const open = value.indexOf('{', i);
    if (open === -1) {
      out += value.slice(i);
      break;
    }
    const close = value.indexOf('}', open + 1);
    if (close === -1) {
      out += value.slice(i);
      break;
    }
    out += value.slice(i, open);
    const source = value.slice(open + 1, close);
    const result = tryEvaluate(source, scope);
    if (result.ok) {
      out +=
        result.value === undefined || result.value === null
          ? ''
          : String(result.value);
    } else if (result.unknownIdentifier) {
      out += value.slice(open, close + 1);
    } else {
      out += value.slice(open, close + 1);
      error = result.error.message;
    }
    i = close + 1;
  }
  return { text: out, error };
}

export function resolveComponent(
  node: ComponentNode,
  page: BiPageContextValue,
  locals: Record<string, unknown>,
): ResolvedComponent {
  const scope = buildScope(page, locals);
  const props: Record<string, unknown> = {};
  const propErrors: string[] = [];
  const waitingOn: string[] = [];
  let dataQuery: string | undefined;
  let data: unknown;

  node.props.forEach((raw) => {
    const name = canonicalPropName(node.tag, raw.name) ?? raw.name;
    const { value } = raw;

    if (name === 'data') {
      let source = '';
      if (value.kind === 'expr') source = value.source.trim();
      else if (value.kind === 'string') source = value.value.trim();
      if (
        IDENT_RE.test(source) &&
        page.queryNames.has(source) &&
        !(source in locals)
      ) {
        dataQuery = source;
        data = page.results[source];
        props.data = data;
        return;
      }
    }

    if (value.kind === 'flag') {
      props[name] = true;
      return;
    }
    if (value.kind === 'string') {
      const { text, error } = interpolateString(value.value, scope);
      props[name] = text;
      if (error) propErrors.push(`${raw.name}: ${error}`);
      return;
    }

    const result = tryEvaluate(value.source, scope);
    if (result.ok) {
      props[name] = result.value;
      return;
    }
    if (result.unknownIdentifier && IDENT_RE.test(value.source.trim())) {
      // Old Analytics syntax wrote bare words in braces: x={month}.
      props[name] = value.source.trim();
      return;
    }
    // Reads a query that hasn't run yet: wait instead of erroring.
    const waiting = Array.from(page.queryNames).filter(
      (q) => value.source.includes(q) && page.results[q] === undefined,
    );
    if (waiting.length > 0) {
      waitingOn.push(...waiting);
      return;
    }
    propErrors.push(`${raw.name}={${value.source}}: ${result.error.message}`);
  });

  if (
    data === undefined &&
    Object.prototype.hasOwnProperty.call(props, 'data')
  ) {
    data = props.data;
  }

  Object.entries(aliasDefaults(node.tag)).forEach(([key, value]) => {
    if (props[key] === undefined) props[key] = value;
  });

  return { props, propErrors, dataQuery, data, waitingOn };
}

// ── Typed readers ───────────────────────────────────────────────────────────

export function propString(
  props: Record<string, unknown>,
  key: string,
): string | undefined {
  const v = props[key];
  if (v === undefined || v === null || v === '') return undefined;
  if (typeof v === 'string') return v;
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  return undefined;
}

export function propNumber(
  props: Record<string, unknown>,
  key: string,
): number | undefined {
  const v = props[key];
  if (v === undefined || v === null || v === '') return undefined;
  const n = typeof v === 'number' ? v : Number(String(v).replace(/px$/, ''));
  return Number.isFinite(n) ? n : undefined;
}

export function propBool(
  props: Record<string, unknown>,
  key: string,
  fallback = false,
): boolean {
  const v = props[key];
  if (v === undefined || v === null) return fallback;
  if (typeof v === 'boolean') return v;
  if (typeof v === 'string') return v === '' || v.toLowerCase() === 'true';
  return Boolean(v);
}

/** A column list: y="a", y="a,b" (old syntax) or y={['a','b']}. */
export function propColumns(
  props: Record<string, unknown>,
  key: string,
): string[] {
  const v = props[key];
  if (Array.isArray(v)) return v.map((x) => String(x));
  if (typeof v === 'string' && v.trim()) {
    return v
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
  }
  return [];
}

export function propArray(
  props: Record<string, unknown>,
  key: string,
): unknown[] | undefined {
  const v = props[key];
  if (Array.isArray(v)) return v;
  if (typeof v === 'string' && v.trim())
    return v.split(',').map((s) => s.trim());
  return undefined;
}

export function asRows(data: unknown): Record<string, unknown>[] | undefined {
  if (!Array.isArray(data)) return undefined;
  return data.filter((r) => r && typeof r === 'object') as Record<
    string,
    unknown
  >[];
}
