import React from 'react';
import { render } from '@testing-library/react';
import { ThemeProvider, createTheme } from '@mui/material/styles';
import { BiPagePreview } from '../../../../../src/extensions/analytics/renderer/bi/BiPagePreview';

jest.mock(
  '../../../../../src/extensions/analytics/renderer/bi/markdown/MarkdownText',
  () => jest.requireActual('./markdownTextMock'),
);

// jsdom has no layout: give charts a fixed size so Recharts draws them.
jest.mock('recharts', () => {
  const actual = jest.requireActual('recharts');
  const ReactActual = jest.requireActual('react');
  return {
    ...actual,
    ResponsiveContainer: ({ children }: { children: React.ReactElement }) =>
      ReactActual.cloneElement(children, { width: 600, height: 300 }),
  };
});

const DATA = '```sql q\nselect 1\n```\n';
const rows = [
  { month: '2026-01-01', channel: 'Web', revenue: 1000 },
  { month: '2026-01-01', channel: 'Store', revenue: 500 },
  { month: '2026-02-01', channel: 'Web', revenue: 1500 },
  { month: '2026-02-01', channel: 'Store', revenue: 700 },
];

const draw = (tag: string) =>
  render(
    <ThemeProvider theme={createTheme()}>
      <BiPagePreview
        markdownContent={`${DATA}${tag}`}
        queryCache={{ q: rows }}
        queryStatuses={{ q: 'success' }}
        parseDelayMs={0}
      />
    </ThemeProvider>,
  ).container;

describe('charts', () => {
  it('draws a stacked bar per series with legend, titles and formats', () => {
    const c = draw(
      '<BarChart data={q} x="month" y="revenue" series="channel" xFmt="month" yFmt="usd0k" title="Revenue" subtitle="by channel" xAxisTitle="Month" yAxisTitle="USD" labels />',
    );
    expect(c.textContent).toContain('Revenue');
    expect(c.textContent).toContain('by channel');
    expect(c.querySelectorAll('.recharts-bar').length).toBe(2);
    expect(c.querySelectorAll('.recharts-bar-rectangle').length).toBe(4);
    expect(c.textContent).toContain('Web');
    expect(c.textContent).toContain('Jan 2026');
    expect(c.textContent).toContain('Month');
    expect(c.textContent).toContain('USD');
    expect(c.textContent).toMatch(/\$1k|\$2k/);
  });

  it('draws horizontal bars with swapXY and old HorizontalBarChart', () => {
    const a = draw('<BarChart data={q} x="channel" y="revenue" swapXY />');
    expect(
      a.querySelector('.recharts-yAxis .recharts-cartesian-axis-tick')
        ?.textContent,
    ).toMatch(/Web|Store/);
    const b = draw('<HorizontalBarChart data={q} x="channel" y="revenue" />');
    expect(
      b.querySelector('.recharts-yAxis .recharts-cartesian-axis-tick')
        ?.textContent,
    ).toMatch(/Web|Store/);
  });

  it('draws one line per y column and an area per series', () => {
    const line = draw(
      '<LineChart data={q} x="month" y={["revenue"]} series="channel" markers />',
    );
    expect(line.querySelectorAll('.recharts-line').length).toBe(2);
    expect(line.querySelectorAll('.recharts-line-dot').length).toBe(4);
    const area = draw(
      '<AreaChart data={q} x="month" y="revenue" series="channel" type="stacked100" />',
    );
    expect(area.querySelectorAll('.recharts-area').length).toBe(2);
    expect(area.textContent).toContain('100%');
  });

  it('draws scatter points and pie slices', () => {
    const scatter = draw(
      '<ScatterPlot data={q} x="revenue" y="revenue" series="channel" />',
    );
    expect(scatter.querySelectorAll('.recharts-scatter-symbol').length).toBe(4);
    const pie = draw('<DonutChart data={q} x="channel" y="revenue" />');
    expect(pie.querySelectorAll('.recharts-pie-sector').length).toBe(2);
  });

  it('applies yMin / yMax and a custom palette', () => {
    const c = draw(
      '<BarChart data={q} x="channel" y="revenue" yMax={5000} colorPalette={["#ff0000"]} />',
    );
    expect(c.textContent).toContain('5k');
    expect(
      c.querySelector('.recharts-bar-rectangle path')?.getAttribute('fill'),
    ).toBe('#ff0000');
  });

  it('labels date axes by their grain without an xFmt', () => {
    const weekly = [
      { week: '2026-01-05T00:00:00.000Z', n: 3 },
      { week: '2026-01-12T00:00:00.000Z', n: 5 },
      { week: '2026-01-19T00:00:00.000Z', n: 4 },
    ];
    const c = render(
      <ThemeProvider theme={createTheme()}>
        <BiPagePreview
          markdownContent={`${DATA}<LineChart data={q} x="week" y="n" />`}
          queryCache={{ q: weekly }}
          queryStatuses={{ q: 'success' }}
          parseDelayMs={0}
        />
      </ThemeProvider>,
    ).container;
    expect(c.textContent).toContain('Jan 5');
    expect(c.textContent).not.toContain('T00:00');
  });
});
