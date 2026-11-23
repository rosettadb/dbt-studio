/**
 * Compatibility corpus: pages written for the previous Analytics renderer
 * must keep working on the Plan 97 engine — same queries, same SQL, no new
 * errors.
 */
import React from 'react';
import { render, screen } from '@testing-library/react';
import { ThemeProvider, createTheme } from '@mui/material/styles';
import { BiPagePreview } from '../../../../../src/renderer/components/analytics/bi/BiPagePreview';
import {
  buildPageGraph,
  parsePage,
  resolveQuerySql,
  validatePage,
} from '../../../../../src/shared/analyticsBi';
import { resolveQueryDependencies } from '../../../../../src/renderer/utils/analyticsQueryEngine';

jest.mock(
  '../../../../../src/renderer/components/analytics/bi/markdown/MarkdownText',
  () => jest.requireActual('./markdownTextMock'),
);
jest.mock('../../../../../src/renderer/services/connectors.service', () => ({
  executeQueryForConnection: jest.fn(),
}));
jest.mock('../../../../../src/renderer/services/duckLake.service', () => ({
  DuckLakeService: { executeQuery: jest.fn() },
}));

const ResizeObserverStub = jest.fn(() => ({
  observe: jest.fn(),
  unobserve: jest.fn(),
  disconnect: jest.fn(),
}));
(global as any).ResizeObserver =
  (global as any).ResizeObserver ?? ResizeObserverStub;

/** The old editor's starter template and slash-command snippets, filled in. */
const LEGACY_PAGES: Record<string, string> = {
  starter: `---
title: My Analytics Page
---

Write your SQL queries below, then use component tags to visualize them.

\`\`\`sql orders
SELECT
  date_trunc('month', order_date) AS month,
  COUNT(*) AS order_count,
  SUM(total_amount) AS revenue
FROM orders
GROUP BY 1
ORDER BY 1
\`\`\`

<BarChart data={orders} x="month" y="revenue" title="Monthly Revenue" />

<DataTable data={orders} title="Orders by Month" />
`,
  everyComponent: `---
title: Everything
sidebar_position: 1
sidebar_badge: "New"
---

\`\`\`sql q
select 'a' as category, 10 as metric, 8 as previous_metric, '2026-01-01' as month
\`\`\`

\`\`\`sql q2
select * from {{q}} where metric > 1
\`\`\`

<Value data={q} value="metric" fmt="num" />
<BigValue data={q} value="metric" label="Metric" fmt="usd" />
<Delta data={q} value="metric" comparison="previous_metric" />
<DataTable data={q} title="Rows" rows={100} />
<BarChart data={q} x="category" y="metric" title="Title" />
<LineChart data={q2} x="month" y="metric" title="Title" />
<AreaChart data={q} x="month" y="metric" stacked={true} />
<HorizontalBarChart data={q} x="category" y="metric" />
<PieChart data={q} x="category" y="metric" />
<DonutChart data={q} x="category" y="metric" />
<ScatterChart data={q} x="metric" y="previous_metric" />
<Alert severity="info" title="Note">Markdown content</Alert>
<Accordion title="Details">Markdown or components</Accordion>
<Tabs><Tab title="First">Content</Tab></Tabs>
<Grid columns={2} spacing={2}>Content</Grid>
<Stack direction="column" spacing={2}>Content</Stack>
<Box p={2} width="100%">Content</Box>
<ButtonGroup options="A,B,C" default="A" />
<Select data={q} value="category" label="category" title="Pick one" />
<DateRange start="2026-01-01" end="2026-01-31" />
<Checkbox label="Include archived" default={false} />
<NumberInput label="Limit" default={100} min={1} max={1000} />
<TextInput label="Search" placeholder="Customer name" />
`,
};

const ROWS = {
  orders: [{ month: '2026-01-01', order_count: 3, revenue: 120 }],
  q: [{ category: 'a', metric: 10, previous_metric: 8, month: '2026-01-01' }],
  q2: [{ category: 'a', metric: 10, previous_metric: 8, month: '2026-01-01' }],
};

describe('legacy page compatibility', () => {
  it.each(Object.entries(LEGACY_PAGES))(
    '%s: has no validation warnings',
    (_, page) => {
      // Unnamed inputs are the one thing the old syntax couldn't express.
      expect(
        validatePage(page).filter((w) => w.code !== 'unnamed-input'),
      ).toEqual([]);
    },
  );

  it.each(Object.entries(LEGACY_PAGES))(
    '%s: runs the same queries with the same SQL as before',
    (_, page) => {
      const legacy = resolveQueryDependencies(page);
      const graph = buildPageGraph(parsePage(page).nodes);
      expect(graph.errors).toEqual([]);
      expect(graph.order).toEqual(legacy.resolved.map((b) => b.name));
      legacy.resolved.forEach((block) => {
        expect(resolveQuerySql(graph, block.name, {})).toBe(block.sql);
      });
    },
  );

  it.each(Object.entries(LEGACY_PAGES))(
    '%s: renders without component errors',
    (_, page) => {
      const statuses = Object.fromEntries(
        Object.keys(ROWS).map((k) => [k, 'success' as const]),
      );
      const { container } = render(
        <ThemeProvider theme={createTheme()}>
          <BiPagePreview
            markdownContent={page}
            queryCache={ROWS}
            queryStatuses={statuses}
            parseDelayMs={0}
          />
        </ThemeProvider>,
      );
      const text = container.textContent ?? '';
      expect(text).not.toMatch(
        /Unknown component|needs data|no SQL block|is not supported/,
      );
      expect(screen.queryAllByText(/Run the page/)).toHaveLength(0);
    },
  );

  it('engine: legacy is detected so the old renderer is used', () => {
    const { usesLegacyEngine } = jest.requireActual(
      '../../../../../src/shared/analyticsBi',
    );
    expect(
      usesLegacyEngine(`---\nengine: legacy\n---\n${LEGACY_PAGES.starter}`),
    ).toBe(true);
  });
});
