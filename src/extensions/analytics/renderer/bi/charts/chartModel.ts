/**
 * Turns query rows plus chart attributes into the flat data Recharts needs:
 * one object per x value with one key per series. Pure and unit-tested.
 */
import { DateGrain, detectDateGrain, isDateLike, toDate } from '../engine';

export type Row = Record<string, unknown>;

export const DEFAULT_PALETTE = [
  '#236aa4',
  '#45a1bf',
  '#a5cdee',
  '#8dacbf',
  '#85c7c6',
  '#d2c6ac',
  '#f4b548',
  '#8f3d56',
  '#71b9f4',
  '#46a485',
];

export interface ChartModelOptions {
  x?: string;
  y: string[];
  series?: string;
  /** true / 'desc' sorts by total value descending, 'asc' ascending. */
  sort?: boolean | 'asc' | 'desc';
  limit?: number;
  type?: 'grouped' | 'stacked' | 'stacked100';
}

export interface ChartModel {
  x: string;
  seriesKeys: string[];
  data: Row[];
  xKind: 'date' | 'number' | 'category';
  /** Time grain of a date x axis (month, week, day, ...). */
  xGrain?: DateGrain;
  /** Columns used for values (before series pivoting). */
  valueColumns: string[];
  empty: boolean;
}

export function toNumber(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'bigint') return Number(value);
  if (typeof value === 'string' && value.trim() !== '') {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

export function columnsOf(rows: Row[]): string[] {
  return rows.length ? Object.keys(rows[0]) : [];
}

export function isNumericColumn(rows: Row[], column: string): boolean {
  let seen = 0;
  for (let i = 0; i < rows.length && seen < 20; i += 1) {
    const v = rows[i][column];
    if (v !== null && v !== undefined) {
      if (toNumber(v) === null) return false;
      seen += 1;
    }
  }
  return seen > 0;
}

export function columnKind(rows: Row[], column: string): ChartModel['xKind'] {
  const sample = rows.find(
    (r) => r[column] !== null && r[column] !== undefined,
  )?.[column];
  if (sample instanceof Date || isDateLike(sample)) return 'date';
  if (typeof sample === 'number' || typeof sample === 'bigint') return 'number';
  return 'category';
}

/** Default x and y when the page leaves them out, as Evidence does. */
export function inferColumns(
  rows: Row[],
  x?: string,
  y?: string[],
  series?: string,
): { x: string; y: string[] } {
  const cols = columnsOf(rows);
  const xCol = x ?? cols[0] ?? 'x';
  if (y && y.length > 0) return { x: xCol, y };
  const numeric = cols.filter(
    (c) => c !== xCol && c !== series && isNumericColumn(rows, c),
  );
  return { x: xCol, y: series ? numeric.slice(0, 1) : numeric };
}

export function buildChartModel(
  rows: Row[],
  options: ChartModelOptions,
): ChartModel {
  const { x, y } = inferColumns(rows, options.x, options.y, options.series);
  const xKind = columnKind(rows, x);
  const byX = new Map<string, Row>();
  const seriesKeys: string[] = [];
  const addSeries = (key: string) => {
    if (!seriesKeys.includes(key)) seriesKeys.push(key);
  };

  rows.forEach((row) => {
    const xValue = row[x];
    const xKey = xValue === null || xValue === undefined ? '∅' : String(xValue);
    let point = byX.get(xKey);
    if (!point) {
      point = { [x]: xValue === null || xValue === undefined ? '∅' : xValue };
      byX.set(xKey, point);
    }
    if (options.series) {
      const raw = row[options.series];
      const key = raw === null || raw === undefined ? '∅' : String(raw);
      addSeries(key);
      const n = toNumber(row[y[0]]);
      point[key] = ((point[key] as number) ?? 0) + (n ?? 0);
    } else {
      y.forEach((col) => {
        addSeries(col);
        const n = toNumber(row[col]);
        point![col] = n === null ? null : ((point![col] as number) ?? 0) + n;
      });
    }
  });

  let data = Array.from(byX.values());

  // Dates and numbers read left to right; categories can sort by value.
  if (xKind === 'date' || xKind === 'number') {
    data.sort((a, b) => {
      const av = a[x];
      const bv = b[x];
      if (xKind === 'number') return (toNumber(av) ?? 0) - (toNumber(bv) ?? 0);
      return (toDate(av)?.getTime() ?? 0) - (toDate(bv)?.getTime() ?? 0);
    });
  } else if (options.sort) {
    const total = (p: Row) =>
      seriesKeys.reduce((sum, k) => sum + (toNumber(p[k]) ?? 0), 0);
    const dir = options.sort === 'asc' ? 1 : -1;
    data.sort((a, b) => dir * (total(a) - total(b)));
  }

  if (options.limit && options.limit > 0) data = data.slice(0, options.limit);

  if (options.type === 'stacked100') {
    data = data.map((p) => {
      const total = seriesKeys.reduce(
        (sum, k) => sum + Math.abs(toNumber(p[k]) ?? 0),
        0,
      );
      const out: Row = { ...p };
      seriesKeys.forEach((k) => {
        const n = toNumber(p[k]);
        out[k] = total && n !== null ? n / total : 0;
      });
      return out;
    });
  }

  return {
    x,
    seriesKeys,
    data,
    xKind,
    xGrain:
      xKind === 'date' ? detectDateGrain(data.map((p) => p[x])) : undefined,
    valueColumns: y,
    empty: rows.length === 0 || seriesKeys.length === 0,
  };
}

/** Rows for a pie: one slice per distinct name, values summed. */
export function buildPieModel(
  rows: Row[],
  name?: string,
  value?: string,
  limit?: number,
): Array<{ name: string; value: number }> {
  const { x, y } = inferColumns(rows, name, value ? [value] : []);
  const totals = new Map<string, number>();
  rows.forEach((row) => {
    const key = row[x] === null || row[x] === undefined ? '∅' : String(row[x]);
    totals.set(key, (totals.get(key) ?? 0) + (toNumber(row[y[0]]) ?? 0));
  });
  let slices = Array.from(totals, ([n, v]) => ({ name: n, value: v }));
  if (limit && limit > 0) slices = slices.slice(0, limit);
  return slices;
}

/** Scatter points per series. */
export function buildScatterModel(
  rows: Row[],
  x: string | undefined,
  y: string | undefined,
  series?: string,
): { x: string; y: string; groups: Array<{ key: string; points: Row[] }> } {
  const cols = columnsOf(rows);
  const numeric = cols.filter((c) => c !== series && isNumericColumn(rows, c));
  const xCol = x ?? numeric[0] ?? cols[0] ?? 'x';
  const yCol = y ?? numeric.find((c) => c !== xCol) ?? cols[1] ?? 'y';
  const groups = new Map<string, Row[]>();
  rows.forEach((row) => {
    const key = series ? String(row[series] ?? '∅') : yCol;
    const xv = toNumber(row[xCol]);
    const yv = toNumber(row[yCol]);
    if (xv === null || yv === null) return;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push({ ...row, [xCol]: xv, [yCol]: yv });
  });
  return {
    x: xCol,
    y: yCol,
    groups: Array.from(groups, ([key, points]) => ({ key, points })),
  };
}
