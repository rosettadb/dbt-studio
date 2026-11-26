/**
 * Inputs: definitions found on a page, their default state, and `${...}`
 * interpolation into SQL (legacy Evidence syntax: `${inputs.region.value}`).
 */
import type {
  ComponentNode,
  InputState,
  InputValue,
  PageNode,
  RawProp,
} from '../types';
import { collectComponents } from '../parser';
import { findMatchingBrace } from '../parser/props';
import { collectInputNames, parseExpression } from '../expressions/parser';
import { evaluateExpression } from '../expressions/evaluate';
import { canonicalComponentName } from '../specs';

export type InputKind =
  | 'dropdown'
  | 'buttonGroup'
  | 'textInput'
  | 'numberInput'
  | 'checkbox'
  | 'slider'
  | 'dateRange';

export interface InputDefinition {
  name: string;
  kind: InputKind;
  component: ComponentNode;
  /** SQL block whose rows supply the options (Dropdown data={query}). */
  optionsQuery?: string;
  multiple: boolean;
  defaultState: InputValue | undefined;
}

const INPUT_KINDS: Record<string, InputKind> = {
  Dropdown: 'dropdown',
  ButtonGroup: 'buttonGroup',
  TextInput: 'textInput',
  NumberInput: 'numberInput',
  Checkbox: 'checkbox',
  Slider: 'slider',
  DateRange: 'dateRange',
};

export function isInputComponent(tag: string): boolean {
  return Boolean(INPUT_KINDS[canonicalComponentName(tag) ?? '']);
}

function propString(props: RawProp[], ...names: string[]): string | undefined {
  const prop = props.find((p) => names.includes(p.name));
  if (!prop) return undefined;
  if (prop.value.kind === 'string') return prop.value.value;
  if (prop.value.kind === 'expr') return prop.value.source;
  return 'true';
}

/** Evaluate a prop that may be a literal (`{3}`, `{['a','b']}`) or a string. */
function propLiteral(props: RawProp[], ...names: string[]): unknown {
  const prop = props.find((p) => names.includes(p.name));
  if (!prop) return undefined;
  if (prop.value.kind === 'flag') return true;
  if (prop.value.kind === 'string') return prop.value.value;
  try {
    return evaluateExpression(prop.value.source, {});
  } catch {
    return undefined;
  }
}

function propBool(props: RawProp[], ...names: string[]): boolean {
  const v = propLiteral(props, ...names);
  return v === true || v === 'true';
}

function toIsoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Resolve a DateRange preset such as "Last 30 Days" relative to `today`. */
export function resolveDatePreset(
  preset: string,
  today = new Date(),
): { start: string; end: string } | undefined {
  const p = preset.trim().toLowerCase();
  const end = new Date(
    Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()),
  );
  const start = new Date(end);
  const lastN =
    /^last\s+(\d+)\s+(day|days|week|weeks|month|months|year|years)$/.exec(p);
  if (lastN) {
    const n = Number(lastN[1]);
    const unit = lastN[2];
    if (unit.startsWith('day')) start.setUTCDate(start.getUTCDate() - (n - 1));
    if (unit.startsWith('week'))
      start.setUTCDate(start.getUTCDate() - n * 7 + 1);
    if (unit.startsWith('month')) start.setUTCMonth(start.getUTCMonth() - n);
    if (unit.startsWith('year'))
      start.setUTCFullYear(start.getUTCFullYear() - n);
    return { start: toIsoDate(start), end: toIsoDate(end) };
  }
  switch (p) {
    case 'today':
      return { start: toIsoDate(end), end: toIsoDate(end) };
    case 'month to date':
      start.setUTCDate(1);
      return { start: toIsoDate(start), end: toIsoDate(end) };
    case 'year to date':
      start.setUTCMonth(0, 1);
      return { start: toIsoDate(start), end: toIsoDate(end) };
    case 'all time':
      return { start: '1900-01-01', end: '2999-12-31' };
    default:
      return undefined;
  }
}

export const DATE_RANGE_PRESETS = [
  'Last 7 Days',
  'Last 30 Days',
  'Last 90 Days',
  'Last 12 Months',
  'Month to Date',
  'Year to Date',
  'All Time',
];

export interface StaticOption {
  value: unknown;
  label: unknown;
}

/** Options written in the page: option children or an options={[...]} list. */
export function staticOptions(component: ComponentNode): StaticOption[] {
  const out: StaticOption[] = [];
  component.children.forEach((child) => {
    if (child.type !== 'component') return;
    const tag = canonicalComponentName(child.tag);
    if (tag === 'DropdownOption' || tag === 'ButtonGroupItem') {
      const value = propLiteral(child.props, 'value', 'valueLabel');
      const label = propLiteral(child.props, 'valueLabel', 'label') ?? value;
      out.push({ value, label });
    }
  });
  const list = propLiteral(component.props, 'options');
  if (Array.isArray(list)) {
    list.forEach((item) => {
      if (item && typeof item === 'object') {
        const o = item as Record<string, unknown>;
        out.push({ value: o.value, label: o.label ?? o.value });
      } else {
        out.push({ value: item, label: item });
      }
    });
  } else if (typeof list === 'string' && list.trim()) {
    // Old Analytics syntax: options="a,b,c"
    list
      .split(',')
      .forEach((s) => out.push({ value: s.trim(), label: s.trim() }));
  }
  return out;
}

function defaultFor(
  kind: InputKind,
  component: ComponentNode,
): InputValue | undefined {
  const { props } = component;
  const def = propLiteral(props, 'defaultValue', 'default');
  switch (kind) {
    case 'dropdown':
    case 'buttonGroup': {
      const multiple = propBool(props, 'multiple');
      if (def !== undefined) {
        const value = multiple && !Array.isArray(def) ? [def] : def;
        return {
          value,
          label: Array.isArray(value) ? value.join(', ') : value,
        };
      }
      // First literal option child, or the first of an options={[...]} list.
      const options = staticOptions(component);
      if (options.length > 0 && !propBool(props, 'noDefault')) {
        const first = options[0];
        return multiple
          ? { value: [first.value], label: String(first.label) }
          : { value: first.value, label: first.label };
      }
      return undefined;
    }
    case 'textInput':
      return { value: def === undefined ? '' : String(def) };
    case 'numberInput':
    case 'slider': {
      const n = Number(def ?? propLiteral(props, 'min') ?? 0);
      return { value: Number.isFinite(n) ? n : 0 };
    }
    case 'checkbox':
      return { value: def === true || def === 'true' };
    case 'dateRange': {
      const start = propString(props, 'start');
      const end = propString(props, 'end');
      const preset =
        typeof def === 'string' ? resolveDatePreset(def) : undefined;
      const range = preset ?? {
        start: start ?? '1900-01-01',
        end: end ?? toIsoDate(new Date()),
      };
      return { value: range, start: range.start, end: range.end };
    }
    default:
      return undefined;
  }
}

/** Find every named input on the page. */
export function collectInputDefinitions(
  nodes: PageNode[],
  sqlNames: Set<string>,
): InputDefinition[] {
  const defs: InputDefinition[] = [];
  const seen = new Set<string>();
  collectComponents(nodes).forEach((component) => {
    const canonical = canonicalComponentName(component.tag) ?? '';
    const kind = INPUT_KINDS[canonical];
    if (!kind) return;
    const name = propString(component.props, 'name');
    if (!name || seen.has(name)) return;
    seen.add(name);
    const dataProp = component.props.find((p) => p.name === 'data');
    let optionsQuery: string | undefined;
    if (
      dataProp?.value.kind === 'expr' &&
      sqlNames.has(dataProp.value.source.trim())
    ) {
      optionsQuery = dataProp.value.source.trim();
    } else if (
      dataProp?.value.kind === 'string' &&
      sqlNames.has(dataProp.value.value.trim())
    ) {
      optionsQuery = dataProp.value.value.trim();
    }
    defs.push({
      name,
      kind,
      component,
      optionsQuery,
      multiple: propBool(component.props, 'multiple'),
      defaultState: defaultFor(kind, component),
    });
  });
  return defs;
}

/** Initial input state from the page's defaults. */
export function defaultInputState(defs: InputDefinition[]): InputState {
  const state: InputState = {};
  defs.forEach((def) => {
    if (def.defaultState) state[def.name] = def.defaultState;
  });
  return state;
}

/** Escape a value for use inside a single-quoted SQL string. */
export function escapeSqlString(value: string): string {
  // eslint-disable-next-line no-control-regex
  return value.replace(/\u0000/g, '').replace(/'/g, "''");
}

/**
 * Convert an evaluated `${...}` value into SQL text:
 * strings are escaped (the author writes the quotes, as in Evidence),
 * numbers and booleans are written as-is, arrays become a quoted list in
 * parentheses for `IN ${inputs.x.value}`, null/undefined become NULL.
 */
export function toSqlText(value: unknown): string {
  if (value === null || value === undefined) return 'NULL';
  if (typeof value === 'number')
    return Number.isFinite(value) ? String(value) : 'NULL';
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (Array.isArray(value)) {
    if (value.length === 0) return '(NULL)';
    return `(${value
      .map((v) =>
        typeof v === 'number' && Number.isFinite(v)
          ? String(v)
          : `'${escapeSqlString(String(v))}'`,
      )
      .join(', ')})`;
  }
  if (typeof value === 'object') return escapeSqlString(JSON.stringify(value));
  return escapeSqlString(String(value));
}

export interface SqlInterpolationSpan {
  start: number;
  end: number;
  source: string;
}

/**
 * Locate `${...}` spans in SQL, skipping `--` and block comments. Comment
 * markers inside quoted text ('a--b', "x/*y") are not comments; `${...}`
 * inside quotes is still found, since the author writes the quotes
 * (`'${inputs.region.value}'`).
 */
export function findInterpolations(sql: string): SqlInterpolationSpan[] {
  const spans: SqlInterpolationSpan[] = [];
  let quote: string | null = null;
  let i = 0;
  while (i < sql.length) {
    const ch = sql[i];
    if (sql.startsWith('${', i)) {
      const close = findMatchingBrace(sql, i + 2);
      if (close === -1) break;
      spans.push({
        start: i,
        end: close + 1,
        source: sql.slice(i + 2, close).trim(),
      });
      i = close + 1;
    } else if (quote) {
      // A doubled quote ('it''s') closes and reopens: same end state.
      if (ch === quote) quote = null;
      i += 1;
    } else if (ch === "'" || ch === '"' || ch === '`') {
      quote = ch;
      i += 1;
    } else if (sql.startsWith('--', i)) {
      const nl = sql.indexOf('\n', i);
      i = nl === -1 ? sql.length : nl + 1;
    } else if (sql.startsWith('/*', i)) {
      const close = sql.indexOf('*/', i + 2);
      i = close === -1 ? sql.length : close + 2;
    } else {
      i += 1;
    }
  }
  return spans;
}

/** Input names a SQL block reads through `${...}`. */
export function sqlInputNames(sql: string): Set<string> {
  const names = new Set<string>();
  findInterpolations(sql).forEach((span) => {
    try {
      collectInputNames(parseExpression(span.source), names);
    } catch {
      // Syntax errors surface when the query runs.
    }
  });
  return names;
}

export class InterpolationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InterpolationError';
  }
}

/** Replace every `${...}` in SQL with its value from the input state. */
export function interpolateSql(
  sql: string,
  inputs: InputState,
  knownInputs?: Set<string>,
): string {
  const spans = findInterpolations(sql);
  if (spans.length === 0) return sql;
  const inputsScope: Record<string, InputValue> = {};
  Object.entries(inputs).forEach(([name, value]) => {
    inputsScope[name] = { ...value };
  });
  let out = '';
  let last = 0;
  spans.forEach((span) => {
    let value: unknown;
    try {
      const names = collectInputNames(parseExpression(span.source));
      names.forEach((name) => {
        if (name === '*') return;
        if (!(name in inputsScope)) {
          if (knownInputs && !knownInputs.has(name)) {
            throw new InterpolationError(
              `\${${span.source}}: there is no input named "${name}" on this page`,
            );
          }
          throw new InterpolationError(
            `\${${span.source}}: input "${name}" has no value yet`,
          );
        }
      });
      value = evaluateExpression(span.source, { inputs: inputsScope });
    } catch (error) {
      if (error instanceof InterpolationError) throw error;
      throw new InterpolationError(
        `\${${span.source}}: ${(error as Error).message}`,
      );
    }
    out += sql.slice(last, span.start) + toSqlText(value);
    last = span.end;
  });
  return out + sql.slice(last);
}

/**
 * Default for an input whose options come from a query and that has no
 * defaultValue: the first option, as Evidence does (unless noDefault).
 */
export function defaultFromOptions(
  def: InputDefinition,
  rows: Array<Record<string, unknown>>,
): InputValue | undefined {
  if (!rows.length) return undefined;
  if (def.component.props.some((p) => p.name === 'noDefault')) return undefined;
  const valueProp = def.component.props.find((p) => p.name === 'value');
  const labelProp = def.component.props.find((p) => p.name === 'label');
  const column =
    valueProp?.value.kind === 'string'
      ? valueProp.value.value
      : Object.keys(rows[0])[0];
  const labelColumn =
    labelProp?.value.kind === 'string' ? labelProp.value.value : column;
  const value = rows[0][column];
  const label = rows[0][labelColumn] ?? value;
  return def.multiple
    ? { value: [value], label: String(label) }
    : { value, label };
}
