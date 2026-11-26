import { act, renderHook, waitFor } from '@testing-library/react';
import {
  QueryExecutor,
  useAnalyticsPageRuntime,
} from '../../../../../src/extensions/analytics/renderer/bi/runtime/useAnalyticsPageRuntime';

jest.mock(
  '../../../../../src/extensions/analytics/renderer/utils/analyticsQueryEngine',
  () => ({}),
);

const PAGE = `
\`\`\`sql regions
select distinct region from orders
\`\`\`

<Dropdown name="region" data={regions} value="region" />

\`\`\`sql sales
select * from orders where region = '\${inputs.region.value}'
\`\`\`

\`\`\`sql total
select count(*) as n from {{sales}}
\`\`\`

\`\`\`sql unrelated
select 1 as one
\`\`\`
`;

function makeExecutor() {
  const calls: string[] = [];
  const execute: QueryExecutor = jest.fn(async ({ queryName, sql }) => {
    calls.push(`${queryName}: ${sql.replace(/\s+/g, ' ').trim()}`);
    const data =
      queryName === 'regions'
        ? [{ region: 'EMEA' }, { region: 'AMER' }]
        : [{ n: calls.length }];
    return {
      name: queryName,
      status: 'success' as const,
      data,
      fields: [],
      rowCount: data.length,
      duration: 1,
    };
  });
  return { execute, calls };
}

describe('useAnalyticsPageRuntime', () => {
  it('runs everything in order and defaults a dropdown to its first option', async () => {
    const { execute, calls } = makeExecutor();
    const { result } = renderHook(() =>
      useAnalyticsPageRuntime({ markdown: PAGE, execute, cacheScope: 'c1|p1' }),
    );
    await act(async () => {
      await result.current.runAll();
    });
    expect(calls[0]).toBe('regions: select distinct region from orders');
    expect(calls).toContain(
      "sales: select * from orders where region = 'EMEA'",
    );
    expect(calls.findIndex((c) => c.startsWith('sales'))).toBeLessThan(
      calls.findIndex((c) => c.startsWith('total')),
    );
    expect(calls).toContain(
      "total: select count(*) as n from (select * from orders where region = 'EMEA')",
    );
    expect(result.current.inputs.region).toEqual({
      value: 'EMEA',
      label: 'EMEA',
    });
    expect(result.current.statuses).toMatchObject({
      regions: 'success',
      sales: 'success',
      total: 'success',
      unrelated: 'success',
    });
  });

  it('re-runs only queries downstream of a changed input, after a debounce', async () => {
    const { execute, calls } = makeExecutor();
    const { result } = renderHook(() =>
      useAnalyticsPageRuntime({
        markdown: PAGE,
        execute,
        cacheScope: 'c1|p1',
        inputDebounceMs: 10,
      }),
    );
    await act(async () => {
      await result.current.runAll();
    });
    calls.length = 0;
    act(() => {
      result.current.setInput('region', { value: 'AMER', label: 'AMER' });
      result.current.setInput('region', { value: "O'Hare", label: 'x' });
    });
    await waitFor(() => expect(calls).toHaveLength(2));
    expect(calls[0]).toBe(
      "sales: select * from orders where region = 'O''Hare'",
    );
    expect(calls[1]).toMatch(/^total:/);
  });

  it('serves repeated filter values from the cache', async () => {
    const { execute, calls } = makeExecutor();
    const { result } = renderHook(() =>
      useAnalyticsPageRuntime({
        markdown: PAGE,
        execute,
        cacheScope: 'c1|p1',
        inputDebounceMs: 5,
      }),
    );
    await act(async () => {
      await result.current.runAll();
    });
    act(() => result.current.setInput('region', { value: 'AMER' }));
    await waitFor(() => expect(result.current.statuses.total).toBe('success'));
    await waitFor(() =>
      expect(calls.filter((c) => c.includes('AMER'))).toHaveLength(2),
    );
    const before = calls.length;
    act(() => result.current.setInput('region', { value: 'EMEA' }));
    await waitFor(() =>
      expect(result.current.inputs.region.value).toBe('EMEA'),
    );
    await new Promise((resolve) => {
      setTimeout(resolve, 30);
    });
    expect(calls.length).toBe(before);
  });

  it('reports dependency errors on the block', async () => {
    const { execute } = makeExecutor();
    const { result } = renderHook(() =>
      useAnalyticsPageRuntime({
        markdown: '```sql a\nselect * from {{missing}}\n```',
        execute,
        cacheScope: 'x',
      }),
    );
    await act(async () => {
      await result.current.runAll();
    });
    expect(result.current.statuses.a).toBe('error');
    expect(result.current.errors.a).toMatch(/Missing query reference/);
    expect(execute).not.toHaveBeenCalled();
  });

  it('starts clean when the page changes', async () => {
    const { execute } = makeExecutor();
    const { result, rerender } = renderHook(
      ({ scope }) =>
        useAnalyticsPageRuntime({ markdown: PAGE, execute, cacheScope: scope }),
      { initialProps: { scope: 'c1|p1' } },
    );
    await act(async () => {
      await result.current.runAll();
    });
    expect(Object.keys(result.current.results).length).toBeGreaterThan(0);
    rerender({ scope: 'c1|p2' });
    await waitFor(() => expect(result.current.results).toEqual({}));
  });

  it('auto-runs when asked (example pages)', async () => {
    const { execute } = makeExecutor();
    const { result } = renderHook(() =>
      useAnalyticsPageRuntime({
        markdown: PAGE,
        execute,
        cacheScope: 'ex',
        autoRun: true,
      }),
    );
    await waitFor(() =>
      expect(result.current.statuses.unrelated).toBe('success'),
    );
  });
  it('drops results from the previous page and lets the new page run', async () => {
    const pending: Array<{ sql: string; resolve: () => void }> = [];
    const execute: QueryExecutor = jest.fn(
      ({ queryName, sql }) =>
        new Promise((resolve) => {
          pending.push({
            sql,
            resolve: () =>
              resolve({
                name: queryName,
                status: 'success',
                data: [{ sql }],
                fields: [],
                rowCount: 1,
                duration: 1,
              }),
          });
        }),
    );
    const { result, rerender } = renderHook(
      ({ markdown, scope }) =>
        useAnalyticsPageRuntime({ markdown, execute, cacheScope: scope }),
      {
        initialProps: {
          markdown: "```sql q\nselect 'old'\n```\n\n```sql r\nselect 2\n```",
          scope: 'c1|p1',
        },
      },
    );
    let oldRun: Promise<void> = Promise.resolve();
    act(() => {
      oldRun = result.current.runAll();
    });
    await waitFor(() => expect(pending).toHaveLength(1));

    rerender({ markdown: "```sql q\nselect 'new'\n```", scope: 'c1|p2' });
    let newRun: Promise<void> = Promise.resolve();
    act(() => {
      newRun = result.current.runAll();
    });
    await waitFor(() => expect(pending).toHaveLength(2));
    expect(pending[1].sql).toBe("select 'new'");

    await act(async () => {
      pending[1].resolve();
      await newRun;
      pending[0].resolve();
      await oldRun;
    });
    expect(result.current.results.q).toEqual([{ sql: "select 'new'" }]);
    // The old page's chain stopped: its second query never ran.
    expect(pending).toHaveLength(2);
    expect(result.current.isRunning).toBe(false);
  });
});
