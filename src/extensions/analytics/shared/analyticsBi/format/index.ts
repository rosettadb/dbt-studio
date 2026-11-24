/**
 * Value formatting for analytics components.
 *
 * Supports legacy Evidence built-in format names (usd, usd0, usdk, pct1,
 * num2, longdate, ...), the short codes the old Analytics renderer accepted
 * (usd, $, pct, %, k, M, num, id), simple Excel-style patterns
 * ('#,##0.00', '$#,##0', '0.0%') and column-name hints (`revenue_usd`).
 */

export type FormatKind =
  | 'number'
  | 'currency'
  | 'percent'
  | 'date'
  | 'id'
  | 'text';

interface FormatSpec {
  kind: FormatKind;
  currency?: string;
  decimals?: number;
  /** Fixed scale suffix: k, M, B. 'auto' picks one from the value. */
  scale?: 'k' | 'M' | 'B' | 'auto';
  dateStyle?:
    | 'iso'
    | 'long'
    | 'mdy'
    | 'dmy'
    | 'month'
    | 'year'
    | 'datetime'
    | 'time';
  prefix?: string;
  suffix?: string;
  grouping?: boolean;
}

const CURRENCY_CODES: Record<string, string> = {
  usd: 'USD',
  eur: 'EUR',
  gbp: 'GBP',
  jpy: 'JPY',
  cad: 'CAD',
  aud: 'AUD',
  chf: 'CHF',
  cny: 'CNY',
  inr: 'INR',
};

const SCALE_SUFFIX: Record<string, 'k' | 'M' | 'B'> = {
  k: 'k',
  m: 'M',
  b: 'B',
};

const DATE_NAMES: Record<string, FormatSpec['dateStyle']> = {
  date: 'iso',
  shortdate: 'mdy',
  longdate: 'long',
  fulldate: 'long',
  mdy: 'mdy',
  dmy: 'dmy',
  ymd: 'iso',
  month: 'month',
  mmm: 'month',
  year: 'year',
  yyyy: 'year',
  datetime: 'datetime',
  time: 'time',
};

/** Format names accepted by `fmt=`, listed for the agent reference and docs. */
export const BUILT_IN_FORMATS = [
  'usd',
  'usd0',
  'usd1',
  'usd2',
  'usdk',
  'usdm',
  'usdb',
  'usd0k',
  'eur',
  'eur0',
  'eurk',
  'gbp',
  'gbp0',
  'pct',
  'pct0',
  'pct1',
  'pct2',
  'pct3',
  'num',
  'num0',
  'num1',
  'num2',
  'num3',
  'num4',
  'numk',
  'numm',
  'numb',
  'num0k',
  'num1k',
  'num1m',
  'id',
  'date',
  'longdate',
  'mdy',
  'dmy',
  'month',
  'year',
  'datetime',
  'time',
];

function parseNamedFormat(raw: string): FormatSpec | null {
  const name = raw.trim().toLowerCase();
  if (!name) return null;

  // Short codes from the original Analytics renderer.
  if (name === '$') return { kind: 'currency', currency: 'USD', decimals: 2 };
  if (name === '€') return { kind: 'currency', currency: 'EUR', decimals: 2 };
  if (name === '£') return { kind: 'currency', currency: 'GBP', decimals: 2 };
  if (name === '%') return { kind: 'percent', decimals: 1 };
  if (raw.trim() === 'k') return { kind: 'number', scale: 'k', decimals: 1 };
  if (raw.trim() === 'M') return { kind: 'number', scale: 'M', decimals: 1 };
  if (name === 'id') return { kind: 'id' };
  if (name === 'text' || name === 'string') return { kind: 'text' };

  const dateStyle = DATE_NAMES[name];
  if (dateStyle) return { kind: 'date', dateStyle };

  // pct, pct0..pct3
  let m = name.match(/^(pct|percent)(\d)?$/);
  if (m) {
    return { kind: 'percent', decimals: m[2] !== undefined ? Number(m[2]) : 1 };
  }

  // num, num0..num4, numk, numm, numb, num0k, num1m ...
  m = name.match(/^num(\d)?([kmb])?$/);
  if (m) {
    return {
      kind: 'number',
      decimals: m[1] !== undefined ? Number(m[1]) : undefined,
      scale: m[2] ? SCALE_SUFFIX[m[2]] : undefined,
    };
  }

  // usd, usd0, usdk, usd0k, usd1m, eurk ...
  m = name.match(/^([a-z]{3})(\d)?([kmb])?$/);
  if (m && CURRENCY_CODES[m[1]]) {
    const scale = m[3] ? SCALE_SUFFIX[m[3]] : undefined;
    let decimals: number | undefined;
    if (m[2] !== undefined) decimals = Number(m[2]);
    else decimals = scale ? 1 : 2;
    return {
      kind: 'currency',
      currency: CURRENCY_CODES[m[1]],
      decimals,
      scale,
    };
  }

  // Bare scale words.
  if (name === 'thousands') return { kind: 'number', scale: 'k', decimals: 1 };
  if (name === 'millions') return { kind: 'number', scale: 'M', decimals: 1 };
  if (name === 'billions') return { kind: 'number', scale: 'B', decimals: 1 };

  return null;
}

/** Excel-like patterns: '#,##0', '0.00', '$#,##0.0', '0.0%', '#,##0.0"k"'. */
function parsePatternFormat(raw: string): FormatSpec | null {
  const pattern = raw.trim();
  if (!/[0#]/.test(pattern)) return null;

  const firstDigit = pattern.search(/[0#]/);
  let lastDigit = -1;
  for (let i = pattern.length - 1; i >= 0; i -= 1) {
    if (/[0#.,]/.test(pattern[i])) {
      lastDigit = i;
      break;
    }
  }
  const body = pattern.slice(firstDigit, lastDigit + 1);
  const prefix = pattern.slice(0, firstDigit).replace(/"/g, '');
  let suffix = pattern.slice(lastDigit + 1).replace(/"/g, '');

  const isPercent = suffix.includes('%');
  if (isPercent) suffix = suffix.replace('%', '');
  const dot = body.indexOf('.');
  const decimals =
    dot === -1 ? 0 : body.slice(dot + 1).replace(/[^0#]/g, '').length;
  let scale: FormatSpec['scale'];
  const scaleMatch = suffix.trim().match(/^([kKmMbB])$/);
  if (scaleMatch) {
    scale = SCALE_SUFFIX[scaleMatch[1].toLowerCase()];
    suffix = '';
  }

  return {
    kind: isPercent ? 'percent' : 'number',
    decimals,
    grouping: body.includes(','),
    prefix,
    suffix,
    scale,
  };
}

const SPEC_CACHE = new Map<string, FormatSpec | null>();

export function parseFormat(fmt: string | undefined | null): FormatSpec | null {
  if (!fmt) return null;
  if (SPEC_CACHE.has(fmt)) return SPEC_CACHE.get(fmt) ?? null;
  const spec = parseNamedFormat(fmt) ?? parsePatternFormat(fmt);
  SPEC_CACHE.set(fmt, spec);
  return spec;
}

/** Infer a format from a column name, as legacy Evidence does. */
export function formatFromColumnName(
  column: string | undefined,
): string | undefined {
  if (!column) return undefined;
  const lower = column.toLowerCase();
  const m = lower.match(/_(usd|eur|gbp|jpy|cad|aud|chf|cny|inr)$/);
  if (m) return m[1];
  if (/_(pct|percent|percentage|rate)$/.test(lower)) return 'pct';
  if (/(_date|_day)$/.test(lower) || lower === 'date' || lower === 'day')
    return 'date';
  if (lower === 'year' || lower.endsWith('_year')) return 'id';
  if (lower === 'id' || lower.endsWith('_id')) return 'id';
  return undefined;
}

function toNumber(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'bigint') return Number(value);
  if (typeof value === 'string' && value.trim() !== '') {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

const DATE_RE =
  /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2})(\.\d+)?)?)?\s*(Z|[+-]\d{2}(?::?\d{2})?)?$/;

/**
 * Parse dates the way warehouses return them: '2026-01-05',
 * '2026-01-05T00:00:00.000Z', '2026-01-05 13:45:00', '2026-01-05 00:00:00+00'.
 * Values without a zone are read as UTC so a calendar day never shifts.
 */
export function toDate(value: unknown): Date | null {
  if (value instanceof Date)
    return Number.isNaN(value.getTime()) ? null : value;
  if (typeof value === 'number') {
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  if (typeof value !== 'string') return null;
  const m = DATE_RE.exec(value.trim());
  if (!m) return null;
  const [, y, mo, d, h = '00', mi = '00', sec = '00', frac = '', zone] = m;
  let tz = 'Z';
  if (zone && zone !== 'Z') {
    const digits = zone.replace(':', '');
    tz = `${digits.slice(0, 3)}:${digits.slice(3) || '00'}`;
  }
  const date = new Date(`${y}-${mo}-${d}T${h}:${mi}:${sec}${frac}${tz}`);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** True when a Date falls exactly on midnight UTC (a calendar day). */
function isMidnightUtc(d: Date): boolean {
  return (
    d.getUTCHours() === 0 &&
    d.getUTCMinutes() === 0 &&
    d.getUTCSeconds() === 0 &&
    d.getUTCMilliseconds() === 0
  );
}

/** True when a value looks like a calendar date or timestamp. */
export function isDateLike(value: unknown): boolean {
  if (value instanceof Date) return true;
  if (typeof value !== 'string') return false;
  return DATE_RE.test(value.trim());
}

/** Default text for a date with no format: a day, or a day and time. */
export function formatDateDefault(value: unknown): string | null {
  const d = toDate(value);
  if (!d) return null;
  const iso = d.toISOString();
  return isMidnightUtc(d)
    ? iso.slice(0, 10)
    : `${iso.slice(0, 10)} ${iso.slice(11, 16)}`;
}

function applyScale(
  n: number,
  scale: FormatSpec['scale'],
): { n: number; suffix: string } {
  if (!scale) return { n, suffix: '' };
  let chosen = scale;
  if (scale === 'auto') {
    const abs = Math.abs(n);
    if (abs >= 1e9) chosen = 'B';
    else if (abs >= 1e6) chosen = 'M';
    else if (abs >= 1e3) chosen = 'k';
    else return { n, suffix: '' };
  }
  const divisor = { k: 1e3, M: 1e6, B: 1e9 }[chosen as 'k' | 'M' | 'B'];
  return { n: n / divisor, suffix: chosen as string };
}

function formatDate(d: Date, style: FormatSpec['dateStyle']): string {
  const utc = { timeZone: 'UTC' } as const;
  switch (style) {
    case 'long':
      return d.toLocaleDateString('en-US', {
        ...utc,
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      });
    case 'mdy':
      return d.toLocaleDateString('en-US', {
        ...utc,
        year: 'numeric',
        month: 'numeric',
        day: 'numeric',
      });
    case 'dmy':
      return d.toLocaleDateString('en-GB', {
        ...utc,
        year: 'numeric',
        month: 'numeric',
        day: 'numeric',
      });
    case 'month':
      return d.toLocaleDateString('en-US', {
        ...utc,
        year: 'numeric',
        month: 'short',
      });
    case 'year':
      return String(d.getUTCFullYear());
    case 'datetime':
      return d.toLocaleString('en-US', {
        ...utc,
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    case 'time':
      return d.toLocaleTimeString('en-US', {
        ...utc,
        hour: '2-digit',
        minute: '2-digit',
      });
    default:
      return d.toISOString().slice(0, 10);
  }
}

function defaultDecimals(n: number, scaled: boolean): number {
  if (Number.isInteger(n) && !scaled) return 0;
  const abs = Math.abs(n);
  if (abs >= 100) return scaled ? 1 : 0;
  if (abs >= 1) return scaled ? 1 : 2;
  if (abs === 0) return 0;
  return 3;
}

/**
 * Format a value. `fmt` wins; otherwise the column name hints; otherwise a
 * sensible default for the value's type. Never throws.
 */
export function formatValue(
  value: unknown,
  fmt?: string | null,
  column?: string,
): string {
  if (value === null || value === undefined) return '–';
  const spec = parseFormat(fmt ?? formatFromColumnName(column));

  if (spec?.kind === 'text') return String(value);

  if (spec?.kind === 'date') {
    const d = toDate(value);
    return d ? formatDate(d, spec.dateStyle) : String(value);
  }

  if (spec?.kind === 'id') {
    const n = toNumber(value);
    return n === null ? String(value) : String(n);
  }

  const n = toNumber(value);
  if (n === null) {
    if (isDateLike(value)) return formatDateDefault(value) ?? String(value);
    if (typeof value === 'boolean') return value ? 'true' : 'false';
    if (typeof value === 'object') {
      try {
        return JSON.stringify(value);
      } catch {
        return String(value);
      }
    }
    return String(value);
  }

  if (!spec) {
    const decimals = defaultDecimals(n, false);
    return n.toLocaleString('en-US', {
      minimumFractionDigits: 0,
      maximumFractionDigits: decimals,
    });
  }

  const base = spec.kind === 'percent' ? n * 100 : n;
  const { n: scaled, suffix: scaleSuffix } = applyScale(base, spec.scale);
  const decimals =
    spec.decimals ?? defaultDecimals(scaled, Boolean(scaleSuffix));
  const grouping = spec.grouping ?? true;

  let text: string;
  if (spec.kind === 'currency' && spec.currency) {
    text = scaled.toLocaleString('en-US', {
      style: 'currency',
      currency: spec.currency,
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
      useGrouping: grouping,
    });
  } else {
    text = scaled.toLocaleString('en-US', {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
      useGrouping: grouping,
    });
  }

  if (spec.kind === 'percent') text += '%';
  return `${spec.prefix ?? ''}${text}${scaleSuffix}${spec.suffix ?? ''}`;
}

/** A compact formatter for axis ticks: 1.2k, 3.4M, 45%. */
export function formatAxisValue(value: unknown, fmt?: string | null): string {
  const spec = parseFormat(fmt);
  const n = toNumber(value);
  if (n === null) return formatValue(value, fmt);
  if (spec?.kind === 'date' || spec?.kind === 'id' || spec?.kind === 'text') {
    return formatValue(value, fmt);
  }
  if (spec?.kind === 'percent') {
    return formatValue(value, fmt);
  }
  const abs = Math.abs(n);
  if (abs >= 1000) {
    let unit = 'k';
    let divisor = 1e3;
    if (abs >= 1e9) {
      unit = 'b';
      divisor = 1e9;
    } else if (abs >= 1e6) {
      unit = 'm';
      divisor = 1e6;
    }
    const decimals = Number.isInteger(Math.round((n / divisor) * 1e6) / 1e6)
      ? 0
      : 1;
    const prefix =
      spec?.kind === 'currency' ? spec.currency?.toLowerCase() : 'num';
    return formatValue(n, `${prefix}${decimals}${unit}`);
  }
  return formatValue(value, fmt);
}

export type DateGrain = 'year' | 'quarter' | 'month' | 'week' | 'day' | 'time';

/**
 * Guess the time grain of a column from its values: all Jan 1 → year,
 * all first-of-month → month (or quarter), evenly 7 days apart → week,
 * all midnight → day, otherwise time.
 */
export function detectDateGrain(values: unknown[]): DateGrain {
  const dates = values
    .map(toDate)
    .filter((d): d is Date => d !== null)
    .sort((a, b) => a.getTime() - b.getTime());
  if (dates.length === 0) return 'day';
  if (!dates.every(isMidnightUtc)) return 'time';
  const firstOfMonth = dates.every((d) => d.getUTCDate() === 1);
  if (firstOfMonth && dates.every((d) => d.getUTCMonth() === 0)) {
    return dates.length > 1 ? 'year' : 'month';
  }
  if (firstOfMonth) {
    return dates.every((d) => d.getUTCMonth() % 3 === 0) && dates.length > 2
      ? 'quarter'
      : 'month';
  }
  const unique = Array.from(new Set(dates.map((d) => d.getTime())));
  if (unique.length > 2) {
    const dayMs = 86400000;
    const weekly = unique
      .slice(1)
      .every((t, i) => (t - unique[i]) % (7 * dayMs) === 0);
    if (weekly) return 'week';
  }
  return 'day';
}

const MONTHS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];

/**
 * Format a date for a grain. `long` is for tooltips; short is for axis ticks.
 * Formatting is in UTC, matching how dates are parsed.
 */
export function formatDateForGrain(
  value: unknown,
  grain: DateGrain,
  long = false,
): string {
  const d = toDate(value);
  if (!d) return value === null || value === undefined ? '–' : String(value);
  const y = d.getUTCFullYear();
  const mon = MONTHS[d.getUTCMonth()];
  const day = d.getUTCDate();
  switch (grain) {
    case 'year':
      return String(y);
    case 'quarter':
      return `Q${Math.floor(d.getUTCMonth() / 3) + 1} ${y}`;
    case 'month':
      return `${mon} ${y}`;
    case 'week':
      return long ? `Week of ${mon} ${day}, ${y}` : `${mon} ${day}`;
    case 'day':
      return long ? `${mon} ${day}, ${y}` : `${mon} ${day}`;
    default: {
      const hh = String(d.getUTCHours()).padStart(2, '0');
      const mm = String(d.getUTCMinutes()).padStart(2, '0');
      return long
        ? `${mon} ${day}, ${y} ${hh}:${mm}`
        : `${mon} ${day} ${hh}:${mm}`;
    }
  }
}
