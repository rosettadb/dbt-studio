/* eslint-disable no-template-curly-in-string -- these tests write page SQL that contains ${inputs...} */
import {
  formatAxisValue,
  formatFromColumnName,
  formatValue,
} from '../../../../src/extensions/analytics/shared/analyticsBi/format';
import { validatePage } from '../../../../src/extensions/analytics/shared/analyticsBi/validate';
import { buildComponentReference } from '../../../../src/extensions/analytics/shared/analyticsBi/reference';
import { COMPONENT_SPECS } from '../../../../src/extensions/analytics/shared/analyticsBi/specs';
import { usesLegacyEngine } from '../../../../src/extensions/analytics/shared/analyticsBi';

describe('formatValue', () => {
  it.each([
    [1234.5, 'usd', '$1,234.50'],
    [1234.5, 'usd0', '$1,235'],
    [1234567, 'usdk', '$1,234.6k'],
    [1234567, 'usd1m', '$1.2M'],
    [0.1234, 'pct', '12.3%'],
    [0.1234, 'pct0', '12%'],
    [0.1234, '%', '12.3%'],
    [1234.5678, 'num2', '1,234.57'],
    [1234567, 'numk', '1,234.6k'],
    [1234567, 'M', '1.2M'],
    [2024, 'id', '2024'],
    [9.5, 'eur', '€9.50'],
    [1234.5, '#,##0.0', '1,234.5'],
    [0.25, '0.0%', '25.0%'],
    [1234, '$#,##0', '$1,234'],
  ])('formats %p with %p as %p', (value, fmt, expected) => {
    expect(formatValue(value, fmt)).toBe(expected);
  });

  it('formats dates without shifting the day', () => {
    expect(formatValue('2024-03-05', 'date')).toBe('2024-03-05');
    expect(formatValue('2024-03-05', 'longdate')).toBe('March 5, 2024');
    expect(formatValue('2024-03-05', 'mdy')).toBe('3/5/2024');
    expect(formatValue('2024-03-05', 'month')).toBe('Mar 2024');
  });

  it('uses column hints and sensible defaults', () => {
    expect(formatFromColumnName('revenue_usd')).toBe('usd');
    expect(formatFromColumnName('churn_rate')).toBe('pct');
    expect(formatValue(0.5, undefined, 'churn_pct')).toBe('50.0%');
    expect(formatValue(1234567)).toBe('1,234,567');
    expect(formatValue(3.14159)).toBe('3.14');
    expect(formatValue(null)).toBe('–');
    expect(formatValue('text', 'usd')).toBe('text');
  });

  it('compacts axis values', () => {
    expect(formatAxisValue(25000)).toBe('25k');
    expect(formatAxisValue(1500)).toBe('1.5k');
    expect(formatAxisValue(2500000, 'usd')).toBe('$2.5M');
    expect(formatAxisValue(0.4, 'pct0')).toBe('40%');
  });
});

describe('validatePage', () => {
  it('flags unknown components, attributes, missing queries and unnamed inputs', () => {
    const warnings = validatePage(`
\`\`\`sql orders
select 1
\`\`\`
<BarChart data={orders} x="a" y="b" colour="red" />
<LineChart data={nope} x="a" y="b" />
<Sparkle />
<Dropdown data={orders} value="a" />
<BarChart data={orders} x="a" y="b" date_grain="month" />
`);
    const messages = warnings.map((w) => w.message);
    expect(messages).toEqual(
      expect.arrayContaining([
        '<BarChart> has no attribute "colour"',
        '<LineChart> uses data={nope}, but no SQL block named "nope" exists',
        'Unknown component <Sparkle>',
        expect.stringContaining('<Dropdown> needs a name'),
      ]),
    );
    // Retired attributes are accepted without a warning for the agent.
    expect(messages.some((m) => m.includes('date_grain'))).toBe(false);
  });

  it('accepts every alias and old attribute the previous renderer accepted', () => {
    const warnings = validatePage(`
\`\`\`sql q
select 1
\`\`\`
<HorizontalBarChart data={q} x="a" y="b" swap_xy={true} x_axis_title="X" y_axis_title="Y" fmt="usd" stacked={true} />
<ScatterChart data={q} x="a" y="b" pointSize={4} />
<Select name="s" data={q} value="a" label="a" default="x" />
<Value data={q} value="a" label="L" fmt="num" />
<BigValue data={q} value="a" label="L" />
<Delta data={q} value="a" comparison="b" />
<DataTable data={q} columns={['a']} limit={5} pageSize={10} search={true} />
<Alert severity="info" title="T">x</Alert>
<Accordion title="T" defaultExpanded={true}>x</Accordion>
<Grid columns={2} spacing={2}>x</Grid>
<Tabs><Tab title="A">x</Tab></Tabs>
<ButtonGroup name="b" options="a,b" default="a" />
<NumberInput name="n" label="N" default={1} min={0} max={9} step={1} />
<TextInput name="t" label="T" placeholder="p" />
<Checkbox name="c" label="C" default={false} />
<DateRange name="d" start="2024-01-01" end="2024-02-01" title="D" />
<PieChart data={q} x="a" y="b" innerRadius={40} donut={true} />
`);
    expect(warnings).toEqual([]);
  });

  it('flags bad expressions in props and logic', () => {
    const warnings = validatePage('{#if a >}\nx\n{/if}\n<Value data={q[} />');
    expect(warnings.filter((w) => w.code === 'bad-expression')).toHaveLength(2);
  });
});

describe('agent reference', () => {
  it('mentions every component and the input syntax', () => {
    const ref = buildComponentReference();
    COMPONENT_SPECS.forEach((spec) => expect(ref).toContain(`<${spec.name}>`));
    expect(ref).toContain('${inputs.<name>.value}');
    expect(ref).toContain('{#each');
  });
});

describe('usesLegacyEngine', () => {
  it('reads engine: legacy from frontmatter only', () => {
    expect(usesLegacyEngine('---\ntitle: a\nengine: legacy\n---\nx')).toBe(
      true,
    );
    expect(usesLegacyEngine('---\nengine: "legacy"\n---\n')).toBe(true);
    expect(usesLegacyEngine('---\ntitle: a\n---\nengine: legacy')).toBe(false);
    expect(usesLegacyEngine('no frontmatter')).toBe(false);
  });
});

describe('dates', () => {
  const {
    toDate,
    detectDateGrain,
    formatDateForGrain,
    formatValue: fv,
  } = jest.requireActual(
    '../../../../src/extensions/analytics/shared/analyticsBi/format',
  );

  it('parses the shapes warehouses return, as UTC', () => {
    expect(toDate('2026-01-05')?.toISOString()).toBe(
      '2026-01-05T00:00:00.000Z',
    );
    expect(toDate('2026-01-05 13:45:00')?.toISOString()).toBe(
      '2026-01-05T13:45:00.000Z',
    );
    expect(toDate('2026-01-05T00:00:00.000Z')?.toISOString()).toBe(
      '2026-01-05T00:00:00.000Z',
    );
    expect(toDate('2026-01-05 02:00:00+02')?.toISOString()).toBe(
      '2026-01-05T00:00:00.000Z',
    );
    expect(toDate('2026-01-05 02:00:00+0200')?.toISOString()).toBe(
      '2026-01-05T00:00:00.000Z',
    );
    expect(toDate('January 5')).toBeNull();
  });

  it('shows timestamps at midnight as plain days by default', () => {
    expect(fv('2026-03-01T00:00:00.000Z')).toBe('2026-03-01');
    expect(fv('2026-03-01 14:30:00')).toBe('2026-03-01 14:30');
    expect(fv('2026-03-01T00:00:00.000Z', 'month')).toBe('Mar 2026');
  });

  it('detects the time grain of a column', () => {
    expect(
      detectDateGrain(['2026-01-01', '2026-02-01', '2026-03-01T00:00:00Z']),
    ).toBe('month');
    expect(detectDateGrain(['2024-01-01', '2025-01-01', '2026-01-01'])).toBe(
      'year',
    );
    expect(detectDateGrain(['2026-01-01', '2026-04-01', '2026-07-01'])).toBe(
      'quarter',
    );
    expect(detectDateGrain(['2026-01-05', '2026-01-12', '2026-01-26'])).toBe(
      'week',
    );
    expect(detectDateGrain(['2026-01-05', '2026-01-06', '2026-01-08'])).toBe(
      'day',
    );
    expect(
      detectDateGrain(['2026-01-05 10:00:00', '2026-01-05 11:00:00']),
    ).toBe('time');
  });

  it('formats a date for its grain, short for ticks and long for tooltips', () => {
    expect(formatDateForGrain('2026-02-01', 'month')).toBe('Feb 2026');
    expect(formatDateForGrain('2026-01-05', 'week')).toBe('Jan 5');
    expect(formatDateForGrain('2026-01-05', 'week', true)).toBe(
      'Week of Jan 5, 2026',
    );
    expect(formatDateForGrain('2026-04-01', 'quarter')).toBe('Q2 2026');
    expect(formatDateForGrain('2026-01-05T13:05:00Z', 'time')).toBe(
      'Jan 5 13:05',
    );
  });
});
