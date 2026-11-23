import React from 'react';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { ThemeProvider, createTheme } from '@mui/material/styles';
import { BiPagePreview } from '../../../../../src/renderer/components/analytics/bi/BiPagePreview';

jest.mock(
  '../../../../../src/renderer/components/analytics/bi/markdown/MarkdownText',
  () => jest.requireActual('./markdownTextMock'),
);

const ResizeObserverStub = jest.fn(() => ({
  observe: jest.fn(),
  unobserve: jest.fn(),
  disconnect: jest.fn(),
}));
(global as any).ResizeObserver =
  (global as any).ResizeObserver ?? ResizeObserverStub;

const renderPage = (
  markdown: string,
  props: Partial<React.ComponentProps<typeof BiPagePreview>> = {},
) =>
  render(
    <ThemeProvider theme={createTheme()}>
      <BiPagePreview
        markdownContent={markdown}
        queryCache={{}}
        queryStatuses={{}}
        parseDelayMs={0}
        // eslint-disable-next-line react/jsx-props-no-spreading
        {...props}
      />
    </ThemeProvider>,
  );

const KPI = '```sql kpis\nselect 1\n```\n';

describe('BiPagePreview', () => {
  it('renders the frontmatter title, text and inline values', () => {
    renderPage(
      `---\ntitle: Sales\n---\n${KPI}\nWe sold {kpis[0].orders} orders and <Value data={kpis} column="revenue" fmt="usd0" /> in {inputs.region.value}.\n\n<Dropdown name="region" defaultValue="EMEA" />`,
      {
        queryCache: { kpis: [{ orders: 1234, revenue: 5000.4 }] },
        queryStatuses: { kpis: 'success' },
      },
    );
    expect(screen.getByText('Sales')).toBeTruthy();
    const text = screen.getAllByTestId('md')[0].textContent;
    expect(text).toBe('We sold 1,234 orders and $5,000 in EMEA.');
  });

  it('shows placeholders until data arrives', () => {
    renderPage(`${KPI}<BigValue data={kpis} value="n" />`, {
      queryStatuses: { kpis: 'running' },
    });
    expect(screen.getByText(/Running kpis/)).toBeTruthy();
  });

  it('asks to run idle queries and runs them on click', () => {
    const onRunQuery = jest.fn();
    renderPage(`${KPI}<BigValue data={kpis} value="n" />`, { onRunQuery });
    fireEvent.click(screen.getByText(/Run the page/));
    expect(onRunQuery).toHaveBeenCalledWith('kpis', 'select 1');
  });

  it('shows query errors on the component', () => {
    renderPage(`${KPI}<BigValue data={kpis} value="n" />`, {
      queryStatuses: { kpis: 'error' },
      queryErrors: { kpis: 'no such table: orders' },
    });
    expect(screen.getByText('kpis: no such table: orders')).toBeTruthy();
  });

  it('renders BigValue with a comparison', () => {
    renderPage(
      `${KPI}<BigValue data={kpis} value="revenue" fmt="usd0k" comparison="growth" comparisonFmt="pct1" comparisonTitle="vs last month" />`,
      {
        queryCache: { kpis: [{ revenue: 125000, growth: -0.052 }] },
        queryStatuses: { kpis: 'success' },
      },
    );
    expect(screen.getByTestId('bi-bigvalue-value').textContent).toBe('$125k');
    expect(screen.getByText(/▼ 5.2%/)).toBeTruthy();
    expect(screen.getByText('vs last month')).toBeTruthy();
    expect(screen.getByText('Revenue')).toBeTruthy();
  });

  it('evaluates if / else branches and each loops', () => {
    renderPage(
      `${KPI}{#if kpis.length > 2}\nMany\n{:else if kpis.length > 0}\nSome\n{:else}\nNone\n{/if}\n\n{#each kpis as k, i}\nRow {i}: {k.name}\n{/each}`,
      {
        queryCache: { kpis: [{ name: 'a' }, { name: 'b' }] },
        queryStatuses: { kpis: 'success' },
      },
    );
    const texts = screen.getAllByTestId('md').map((n) => n.textContent);
    expect(texts).toEqual(['Some', 'Row 0: a', 'Row 1: b']);
  });

  it('renders a DataTable with Columns, totals and search', () => {
    renderPage(
      `${KPI}<DataTable data={kpis} search totalRow>\n  <Column id="name" title="Customer" />\n  <Column id="amount" fmt="usd0" />\n</DataTable>`,
      {
        queryCache: {
          kpis: [
            { name: 'Acme', amount: 10.4 },
            { name: 'Globex', amount: 20 },
          ],
        },
        queryStatuses: { kpis: 'success' },
      },
    );
    const table = screen.getByTestId('bi-datatable');
    expect(within(table).getByText('Customer')).toBeTruthy();
    expect(within(table).getByText('$10')).toBeTruthy();
    expect(within(table).getByText('$30')).toBeTruthy();
    fireEvent.change(within(table).getByLabelText('Search table'), {
      target: { value: 'glo' },
    });
    expect(within(table).queryByText('Acme')).toBeNull();
    expect(within(table).getByText('Globex')).toBeTruthy();
  });

  it('sends input changes and shows read-only inputs without a handler', () => {
    const onInputChange = jest.fn();
    const page = `<ButtonGroup name="channel" defaultValue="web">\n  <ButtonGroupItem value="web" valueLabel="Web" />\n  <ButtonGroupItem value="store" valueLabel="Store" />\n</ButtonGroup>`;
    const { unmount } = renderPage(page, {
      inputs: { channel: { value: 'web' } },
      onInputChange,
    });
    fireEvent.click(screen.getByText('Store'));
    expect(onInputChange).toHaveBeenCalledWith('channel', {
      value: 'store',
      label: 'Store',
    });
    unmount();

    renderPage(page);
    const store = screen.getByText('Store').closest('button')!;
    expect(store.disabled).toBe(true);
  });

  it('renders tabs and switches between them', () => {
    renderPage(
      '<Tabs>\n  <Tab label="One">\nFirst body\n  </Tab>\n  <Tab label="Two">\nSecond body\n  </Tab>\n</Tabs>',
    );
    expect(screen.getByText('First body')).toBeTruthy();
    fireEvent.click(screen.getByRole('tab', { name: 'Two' }));
    expect(screen.getByText('Second body')).toBeTruthy();
  });

  it('flags unknown components and attributes in the editor only', () => {
    const page = `${KPI}<Sparkle />\n<BigValue data={kpis} value="n" colour="red" />`;
    const opts = {
      queryCache: { kpis: [{ n: 1 }] },
      queryStatuses: { kpis: 'success' as const },
    };
    const { unmount } = renderPage(page, { ...opts, showWarnings: true });
    expect(screen.getByText('Unknown component: <Sparkle />')).toBeTruthy();
    expect(screen.getByTestId('bi-prop-warnings').textContent).toContain(
      'colour',
    );
    unmount();
    renderPage(page, opts);
    expect(screen.queryByTestId('bi-prop-warnings')).toBeNull();
  });

  it('keeps braces that are not expressions as text', () => {
    renderPage('Use {curly} braces and {"json": 1}.');
    expect(screen.getByTestId('md').textContent).toBe(
      'Use {curly} braces and {"json": 1}.',
    );
  });

  it('shows structural warnings in the editor', () => {
    renderPage('<Grid cols={2}>\nunclosed', { showWarnings: true });
    expect(screen.getByTestId('bi-structure-warnings').textContent).toContain(
      'never closed',
    );
  });

  it('hides SQL blocks unless the page asks for them', () => {
    const page = `${KPI}Text`;
    const { unmount } = renderPage(page);
    expect(screen.queryByText('kpis')).toBeNull();
    unmount();
    renderPage(`---\nshow_queries: true\n---\n${page}`);
    expect(screen.getByText('kpis')).toBeTruthy();
  });

  it('puts consecutive KPI tiles in one row and filters in one bar', () => {
    renderPage(
      `${KPI}<BigValue data={kpis} value="a" />\n<BigValue data={kpis} value="b" />\n\n<Dropdown name="x" defaultValue="1" />\n<TextInput name="y" />`,
      {
        queryCache: { kpis: [{ a: 1, b: 2 }] },
        queryStatuses: { kpis: 'success' },
      },
    );
    expect(
      within(screen.getByTestId('bi-kpi-row')).getAllByTestId('bi-bigvalue'),
    ).toHaveLength(2);
    const bar = screen.getByTestId('bi-filter-bar');
    expect(within(bar).getByTestId('bi-dropdown')).toBeTruthy();
    expect(within(bar).getByTestId('bi-textinput')).toBeTruthy();
  });
});
