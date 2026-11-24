import {
  buildChartModel,
  buildPieModel,
  buildScatterModel,
  inferColumns,
} from '../../../../../src/extensions/analytics/renderer/bi/charts/chartModel';
import {
  filterRows,
  parseSort,
  sortRows,
  totalFor,
} from '../../../../../src/extensions/analytics/renderer/bi/table/tableModel';
import { ResultCache } from '../../../../../src/extensions/analytics/renderer/bi/runtime/resultCache';

const rows = [
  { month: '2026-02-01', category: 'A', revenue: 10, cost: 4 },
  { month: '2026-01-01', category: 'A', revenue: 5, cost: 2 },
  { month: '2026-01-01', category: 'B', revenue: 7, cost: 1 },
  { month: '2026-02-01', category: 'B', revenue: '3', cost: 1 },
];

describe('chart model', () => {
  it('pivots a series column into one key per series and sorts dates', () => {
    const model = buildChartModel(rows, {
      x: 'month',
      y: ['revenue'],
      series: 'category',
    });
    expect(model.xKind).toBe('date');
    expect(model.seriesKeys).toEqual(['A', 'B']);
    expect(model.data).toEqual([
      { month: '2026-01-01', A: 5, B: 7 },
      { month: '2026-02-01', A: 10, B: 3 },
    ]);
  });

  it('draws one series per y column and sums duplicates', () => {
    const model = buildChartModel(rows, { x: 'month', y: ['revenue', 'cost'] });
    expect(model.seriesKeys).toEqual(['revenue', 'cost']);
    expect(model.data[0]).toEqual({
      month: '2026-01-01',
      revenue: 12,
      cost: 3,
    });
  });

  it('sorts categories by total when asked and limits rows', () => {
    const data = [
      { k: 'small', v: 1 },
      { k: 'big', v: 9 },
      { k: 'mid', v: 5 },
    ];
    expect(
      buildChartModel(data, { x: 'k', y: ['v'], sort: true }).data.map(
        (d) => d.k,
      ),
    ).toEqual(['big', 'mid', 'small']);
    expect(
      buildChartModel(data, {
        x: 'k',
        y: ['v'],
        sort: 'asc',
        limit: 2,
      }).data.map((d) => d.k),
    ).toEqual(['small', 'mid']);
    expect(
      buildChartModel(data, { x: 'k', y: ['v'], sort: false }).data.map(
        (d) => d.k,
      ),
    ).toEqual(['small', 'big', 'mid']);
  });

  it('normalises stacked100 to shares', () => {
    const model = buildChartModel(rows, {
      x: 'month',
      y: ['revenue'],
      series: 'category',
      type: 'stacked100',
    });
    expect(model.data[0].A).toBeCloseTo(5 / 12);
    expect(model.data[0].B).toBeCloseTo(7 / 12);
  });

  it('infers x and y like Evidence', () => {
    expect(inferColumns(rows)).toEqual({ x: 'month', y: ['revenue', 'cost'] });
    expect(inferColumns(rows, 'category', [], 'month')).toEqual({
      x: 'category',
      y: ['revenue'],
    });
  });

  it('builds pie slices and scatter groups', () => {
    expect(buildPieModel(rows, 'category', 'revenue')).toEqual([
      { name: 'A', value: 15 },
      { name: 'B', value: 10 },
    ]);
    const scatter = buildScatterModel(rows, 'revenue', 'cost', 'category');
    expect(scatter.groups.map((g) => g.key)).toEqual(['A', 'B']);
    expect(scatter.groups[1].points[1]).toMatchObject({ revenue: 3, cost: 1 });
  });

  it('reports empty data', () => {
    expect(buildChartModel([], { y: [] }).empty).toBe(true);
  });
});

describe('table model', () => {
  it('searches, sorts and totals', () => {
    expect(filterRows(rows, 'b', ['category'])).toHaveLength(2);
    const sorted = sortRows(rows, parseSort('revenue desc'));
    expect(sorted.map((r) => r.revenue)).toEqual([10, 7, 5, '3']);
    expect(parseSort('x')).toEqual({ column: 'x', direction: 'asc' });
    expect(totalFor(rows, { id: 'revenue', title: 'r' })).toEqual({
      value: 25,
      isText: false,
    });
    expect(
      totalFor(rows, { id: 'revenue', title: 'r', totalAgg: 'mean' }).value,
    ).toBe(6.25);
    expect(
      totalFor(rows, { id: 'revenue', title: 'r', totalAgg: 'median' }).value,
    ).toBe(6);
    expect(
      totalFor(rows, { id: 'category', title: 'c', totalAgg: 'countDistinct' })
        .value,
    ).toBe(2);
    expect(
      totalFor(rows, { id: 'category', title: 'c', totalAgg: 'All' }),
    ).toEqual({ value: 'All', isText: true });
    expect(totalFor(rows, { id: 'category', title: 'c' })).toEqual({
      value: '',
      isText: true,
    });
  });
});

describe('ResultCache', () => {
  it('dedupes in-flight work and caches successes', async () => {
    const cache = new ResultCache<number>(2);
    let calls = 0;
    const task = () =>
      new Promise<number>((resolve) => {
        calls += 1;
        setTimeout(() => resolve(42), 5);
      });
    const opts = { useCache: true, shouldCache: () => true };
    const [a, b] = await Promise.all([
      cache.run('k', task, opts),
      cache.run('k', task, opts),
    ]);
    expect([a, b, calls]).toEqual([42, 42, 1]);
    await cache.run('k', task, opts);
    expect(calls).toBe(1);
    await cache.run('k', task, { ...opts, useCache: false });
    expect(calls).toBe(2);
  });

  it('evicts the least recently used entry', () => {
    const cache = new ResultCache<number>(2);
    cache.set('a', 1);
    cache.set('b', 2);
    cache.get('a');
    cache.set('c', 3);
    expect(cache.get('b')).toBeUndefined();
    expect(cache.get('a')).toBe(1);
  });
});
