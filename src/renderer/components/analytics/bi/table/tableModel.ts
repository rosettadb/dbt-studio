/** Pure table logic for DataTable: columns, search, sort, paging, totals. */
import { formatValue } from '../engine';
import type { Row } from '../registry.types';
import { toNumber } from '../charts/chartModel';

export interface ColumnConfig {
  id: string;
  title: string;
  fmt?: string;
  align?: 'left' | 'center' | 'right';
  totalAgg?: string;
  totalFmt?: string;
  contentType?: 'delta' | 'colorscale';
  downIsGood?: boolean;
  redNegatives?: boolean;
  wrap?: boolean;
  colorMax?: number;
}

export interface SortState {
  column: string;
  direction: 'asc' | 'desc';
}

export function parseSort(sort: string | undefined): SortState | null {
  if (!sort) return null;
  const [column, dir] = sort.trim().split(/\s+/);
  if (!column) return null;
  return { column, direction: dir?.toLowerCase() === 'desc' ? 'desc' : 'asc' };
}

export function compareValues(a: unknown, b: unknown): number {
  if (a === b) return 0;
  if (a === null || a === undefined) return 1;
  if (b === null || b === undefined) return -1;
  const na = toNumber(a);
  const nb = toNumber(b);
  if (na !== null && nb !== null) return na - nb;
  return String(a).localeCompare(String(b), undefined, { numeric: true });
}

export function filterRows(
  rows: Row[],
  query: string,
  columns: string[],
): Row[] {
  const q = query.trim().toLowerCase();
  if (!q) return rows;
  return rows.filter((row) =>
    columns.some((c) =>
      String(row[c] ?? '')
        .toLowerCase()
        .includes(q),
    ),
  );
}

export function sortRows(rows: Row[], sort: SortState | null): Row[] {
  if (!sort) return rows;
  const dir = sort.direction === 'desc' ? -1 : 1;
  return [...rows].sort(
    (a, b) => dir * compareValues(a[sort.column], b[sort.column]),
  );
}

const AGGREGATES = new Set([
  'sum',
  'mean',
  'avg',
  'median',
  'min',
  'max',
  'count',
  'countDistinct',
]);

/** Value for a column's total cell. Unknown totalAgg text is shown as-is. */
export function totalFor(
  rows: Row[],
  column: ColumnConfig,
): { value: unknown; isText: boolean } {
  const agg = column.totalAgg;
  if (!agg) {
    const nums = rows
      .map((r) => toNumber(r[column.id]))
      .filter((n): n is number => n !== null);
    // Default: sum numeric columns, blank otherwise (legacy Evidence).
    if (
      nums.length &&
      nums.length ===
        rows.filter((r) => r[column.id] !== null && r[column.id] !== undefined)
          .length
    ) {
      return { value: nums.reduce((a, b) => a + b, 0), isText: false };
    }
    return { value: '', isText: true };
  }
  if (!AGGREGATES.has(agg)) return { value: agg, isText: true };
  const values = rows.map((r) => r[column.id]);
  const nums = values.map(toNumber).filter((n): n is number => n !== null);
  switch (agg) {
    case 'sum':
      return { value: nums.reduce((a, b) => a + b, 0), isText: false };
    case 'mean':
    case 'avg':
      return {
        value: nums.length
          ? nums.reduce((a, b) => a + b, 0) / nums.length
          : null,
        isText: false,
      };
    case 'median': {
      if (!nums.length) return { value: null, isText: false };
      const sorted = [...nums].sort((a, b) => a - b);
      const mid = Math.floor(sorted.length / 2);
      return {
        value:
          sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2,
        isText: false,
      };
    }
    case 'min':
      return {
        value: nums.length ? nums.reduce((a, b) => (b < a ? b : a)) : null,
        isText: false,
      };
    case 'max':
      return {
        value: nums.length ? nums.reduce((a, b) => (b > a ? b : a)) : null,
        isText: false,
      };
    case 'count':
      return {
        value: values.filter((v) => v !== null && v !== undefined).length,
        isText: false,
      };
    case 'countDistinct':
      return {
        value: new Set(values.map((v) => String(v))).size,
        isText: false,
      };
    default:
      return { value: '', isText: true };
  }
}

export function formatCell(
  value: unknown,
  column: ColumnConfig,
  tableFmt?: string,
): string {
  const fmt = column.fmt ?? (toNumber(value) !== null ? tableFmt : undefined);
  return formatValue(value, fmt, column.id);
}

export function defaultAlign(rows: Row[], column: string): 'left' | 'right' {
  const sample = rows.find(
    (r) => r[column] !== null && r[column] !== undefined,
  )?.[column];
  return typeof sample === 'number' || typeof sample === 'bigint'
    ? 'right'
    : 'left';
}

/** Background for a color-scale cell: min..max of the column → light..strong. */
export function colorScale(
  value: unknown,
  max: number,
  min = 0,
): string | undefined {
  const n = toNumber(value);
  if (n === null || max === min) return undefined;
  const t = Math.max(0, Math.min(1, (n - min) / (max - min)));
  return `rgba(35, 106, 164, ${(0.08 + t * 0.6).toFixed(3)})`;
}
