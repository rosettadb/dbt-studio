import React from 'react';
import { render, screen } from '@testing-library/react';
import { ThemeProvider, createTheme } from '@mui/material/styles';
import {
  duplicateMarkdown,
  EXAMPLE_PAGES,
  executeExampleQuery,
  getExamplePage,
  isExamplePageId,
} from '../../../../../src/extensions/analytics/renderer/bi/examples';
import {
  buildPageGraph,
  defaultInputState,
  parsePage,
  validatePage,
} from '../../../../../src/shared/analyticsBi';
import { BiPagePreview } from '../../../../../src/extensions/analytics/renderer/bi/BiPagePreview';
import { AnalyticsExamplesSection } from '../../../../../src/extensions/analytics/renderer/bi/examples/AnalyticsExamplesSection';
import { buildThumbnail } from '../../../../../src/extensions/analytics/renderer/bi/gallery/thumbnailModel';

jest.mock(
  '../../../../../src/extensions/analytics/renderer/bi/markdown/MarkdownText',
  () => jest.requireActual('./markdownTextMock'),
);

const ResizeObserverStub = jest.fn(() => ({
  observe: jest.fn(),
  unobserve: jest.fn(),
  disconnect: jest.fn(),
}));
(global as any).ResizeObserver =
  (global as any).ResizeObserver ?? ResizeObserverStub;

async function runExample(markdown: string, example = EXAMPLE_PAGES[0]) {
  const graph = buildPageGraph(parsePage(markdown).nodes);
  const inputs = defaultInputState(graph.inputs);
  const results: Record<string, any[]> = {};
  // eslint-disable-next-line no-restricted-syntax
  for (const name of graph.order) {
    // eslint-disable-next-line no-await-in-loop
    const result = await executeExampleQuery(example, {
      queryName: name,
      inputs,
    });
    results[name] = result.data;
  }
  return { graph, inputs, results };
}

describe('example dashboards', () => {
  it('are identified by an example: id', () => {
    expect(EXAMPLE_PAGES).toHaveLength(3);
    EXAMPLE_PAGES.forEach((p) => {
      expect(isExamplePageId(p.id)).toBe(true);
      expect(getExamplePage(p.id)).toBe(p);
    });
    expect(isExamplePageId('3f9c-uuid')).toBe(false);
  });

  it.each(EXAMPLE_PAGES.map((p) => [p.title, p] as const))(
    '%s: is a valid page with every query answered by sample data',
    async (_, example) => {
      expect(validatePage(example.markdown)).toEqual([]);
      const { graph, results } = await runExample(example.markdown, example);
      expect(graph.errors).toEqual([]);
      graph.order.forEach((name) => {
        expect({ name, rows: results[name].length > 0 }).toEqual({
          name,
          rows: true,
        });
      });
    },
  );

  it.each(EXAMPLE_PAGES.map((p) => [p.title, p] as const))(
    '%s: renders without component errors',
    async (_, example) => {
      const { results, inputs } = await runExample(example.markdown, example);
      const statuses = Object.fromEntries(
        Object.keys(results).map((k) => [k, 'success' as const]),
      );
      const { container } = render(
        <ThemeProvider theme={createTheme()}>
          <BiPagePreview
            markdownContent={example.markdown}
            queryCache={results}
            queryStatuses={statuses}
            inputs={inputs}
            onInputChange={() => undefined}
            showWarnings
            parseDelayMs={0}
          />
        </ThemeProvider>,
      );
      expect(container.textContent).not.toMatch(
        /⚠|Unknown component|no SQL block|Run the page/,
      );
    },
  );

  it('filters change the sample results like the SQL says', async () => {
    const sales = getExamplePage('example:sales-overview')!;
    const all = await executeExampleQuery(sales, {
      queryName: 'by_region',
      inputs: { channel: { value: '%' } },
    });
    const web = await executeExampleQuery(sales, {
      queryName: 'by_region',
      inputs: { channel: { value: 'Web' } },
    });
    const total = (rows: any[]) => rows.reduce((a, r) => a + r.revenue, 0);
    expect(total(web.data)).toBeLessThan(total(all.data));
    expect(all.data.map((r: any) => r.region)).toHaveLength(4);
  });

  it('copies drop the read-only notice and keep the content', () => {
    const copy = duplicateMarkdown(EXAMPLE_PAGES[1], 'My "support" page');
    expect(copy).toContain('title: "My \\"support\\" page"');
    expect(copy).not.toContain('Example dashboard (read-only)');
    expect(copy).toContain('```sql summary');
    expect(validatePage(copy)).toEqual([]);
  });

  it('lists the examples and opens one on click', () => {
    const onOpenPage = jest.fn();
    render(
      <AnalyticsExamplesSection activePageId={null} onOpenPage={onOpenPage} />,
    );
    screen.getByText('Support Operations').click();
    expect(onOpenPage).toHaveBeenCalledWith('example:support-operations');
  });
});

describe('pages gallery', () => {
  it('draws a wireframe from the page components', () => {
    const blocks = buildThumbnail(EXAMPLE_PAGES[0].markdown, 20);
    const kinds = blocks.map((b) => b.kind);
    expect(kinds[0]).toBe('title');
    expect(kinds).toEqual(expect.arrayContaining(['filters', 'kpis', 'chart']));
    expect(blocks.find((b) => b.kind === 'kpis')).toMatchObject({ count: 3 });
  });
});
