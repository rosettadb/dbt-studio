/* eslint-disable no-template-curly-in-string -- these tests write page SQL that contains ${inputs...} */
import { parsePage } from '../../../../src/shared/analyticsBi/parser';
import {
  buildPageGraph,
  queriesAffectedByInputs,
  resolveQuerySql,
} from '../../../../src/shared/analyticsBi/graph';
import {
  defaultInputState,
  interpolateSql,
  resolveDatePreset,
  toSqlText,
} from '../../../../src/shared/analyticsBi/inputs';

const PAGE = `
\`\`\`sql regions
select distinct region from orders
\`\`\`

<Dropdown name="region" data={regions} value="region" />
<ButtonGroup name="channel" defaultValue="web">
  <ButtonGroupItem value="web" valueLabel="Web" />
  <ButtonGroupItem value="store" />
</ButtonGroup>
<DateRange name="period" start="2024-01-01" end="2024-03-31" />
<Dropdown name="cats" multiple defaultValue={['a', "b'c"]} />

\`\`\`sql sales
select * from orders
where region = '\${inputs.region.value}'
  and channel = '\${inputs.channel.value}'
\`\`\`

\`\`\`sql by_day
select day, sum(total) from {{sales}}
where day between '\${inputs.period.start}' and '\${inputs.period.end}'
group by 1
\`\`\`

\`\`\`sql totals
select count(*) from {{sales}}
\`\`\`

\`\`\`sql static
select 1 -- \${inputs.region.value} in a comment is ignored
\`\`\`
`;

describe('inputs and the page graph', () => {
  const { nodes } = parsePage(PAGE);
  const graph = buildPageGraph(nodes);

  it('finds inputs and their defaults', () => {
    expect(graph.inputs.map((i) => i.name)).toEqual([
      'region',
      'channel',
      'period',
      'cats',
    ]);
    expect(graph.inputs[0].optionsQuery).toBe('regions');
    const state = defaultInputState(graph.inputs);
    expect(state.region).toBeUndefined(); // waits for the options query
    expect(state.channel).toEqual({ value: 'web', label: 'web' });
    expect(state.period).toMatchObject({
      start: '2024-01-01',
      end: '2024-03-31',
    });
    expect(state.cats.value).toEqual(['a', "b'c"]);
  });

  it('orders queries so options run before the queries that use them', () => {
    expect(graph.errors).toEqual([]);
    expect(graph.order.indexOf('regions')).toBeLessThan(
      graph.order.indexOf('sales'),
    );
    expect(graph.order.indexOf('sales')).toBeLessThan(
      graph.order.indexOf('by_day'),
    );
    expect(graph.queries.get('static')!.inputs).toEqual([]);
  });

  it('re-runs only queries downstream of a changed input', () => {
    expect(queriesAffectedByInputs(graph, ['period'])).toEqual(['by_day']);
    expect(queriesAffectedByInputs(graph, ['region'])).toEqual(
      expect.arrayContaining(['sales', 'by_day', 'totals']),
    );
    expect(queriesAffectedByInputs(graph, ['region'])).not.toContain('static');
    expect(queriesAffectedByInputs(graph, ['cats'])).toEqual([]);
  });

  it('interpolates inputs and refs into final SQL', () => {
    const inputs = {
      region: { value: "O'Brien" },
      channel: { value: 'web' },
      period: { value: {}, start: '2024-01-01', end: '2024-01-31' },
    };
    const sql = resolveQuerySql(graph, 'by_day', inputs);
    expect(sql).toContain("where region = 'O''Brien'");
    expect(sql).toContain("between '2024-01-01' and '2024-01-31'");
    expect(sql).toMatch(/from \(select \* from orders/);
  });

  it('explains missing inputs', () => {
    expect(() => resolveQuerySql(graph, 'sales', {})).toThrow(
      /has no value yet/,
    );
    expect(() =>
      interpolateSql("select '${inputs.nope.value}'", {}, new Set(['a'])),
    ).toThrow(/no input named "nope"/);
  });

  it('formats values for SQL', () => {
    expect(toSqlText(['a', "b'c", 3])).toBe("('a', 'b''c', 3)");
    expect(toSqlText([])).toBe('(NULL)');
    expect(toSqlText(null)).toBe('NULL');
    expect(toSqlText(true)).toBe('true');
    expect(toSqlText(12.5)).toBe('12.5');
  });

  it('reports duplicate, missing and circular queries', () => {
    const bad = buildPageGraph(
      parsePage(`
\`\`\`sql a
select * from {{b}}
\`\`\`
\`\`\`sql b
select * from {{a}}
\`\`\`
\`\`\`sql c
select * from {{zzz}}
\`\`\`
\`\`\`sql c
select 1
\`\`\`
`).nodes,
    );
    expect(bad.errors.map((e) => e.type).sort()).toEqual([
      'circular',
      'duplicate',
      'missing',
    ]);
  });

  it('resolves date presets', () => {
    const today = new Date(Date.UTC(2026, 10, 20));
    expect(resolveDatePreset('Last 7 Days', today)).toEqual({
      start: '2026-11-14',
      end: '2026-11-20',
    });
    expect(resolveDatePreset('Year to Date', today)).toEqual({
      start: '2026-01-01',
      end: '2026-11-20',
    });
    expect(resolveDatePreset('nonsense', today)).toBeUndefined();
  });
});

describe('findInterpolations', () => {
  it('treats comment markers inside quotes as text', () => {
    const inputs = { region: { value: 'EMEA' } };
    expect(
      interpolateSql(
        "select 'a--b', '${inputs.region.value}' -- ${inputs.region.value}",
        inputs,
      ),
    ).toBe("select 'a--b', 'EMEA' -- ${inputs.region.value}");
    expect(
      interpolateSql(
        "select \"x/*y\", 'it''s' as t, '${inputs.region.value}'",
        inputs,
      ),
    ).toBe("select \"x/*y\", 'it''s' as t, 'EMEA'");
  });
});
