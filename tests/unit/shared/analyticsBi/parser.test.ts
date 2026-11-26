import {
  collectComponents,
  collectSqlNodes,
  parsePage,
  slotPlaceholder,
} from '../../../../src/extensions/analytics/shared/analyticsBi/parser';
import type {
  ComponentNode,
  EachNode,
  IfNode,
  MarkdownNode,
} from '../../../../src/extensions/analytics/shared/analyticsBi/types';

describe('analytics page parser', () => {
  it('reads frontmatter, sql blocks, text and components', () => {
    const page = parsePage(`---
title: "Sales"
engine: v2
---

# Overview

\`\`\`sql orders
SELECT 1 AS n
\`\`\`

<BarChart data={orders} x="month" y="revenue" />
`);
    expect(page.frontmatter).toEqual({ title: 'Sales', engine: 'v2' });
    expect(page.nodes.map((n) => n.type)).toEqual([
      'markdown',
      'sql',
      'component',
    ]);
    const sql = collectSqlNodes(page.nodes)[0];
    expect(sql.name).toBe('orders');
    expect(sql.sql).toBe('SELECT 1 AS n');
    expect(sql.lineStart).toBe(8);
    const chart = page.nodes[2] as ComponentNode;
    expect(chart.tag).toBe('BarChart');
    expect(chart.props).toEqual([
      { name: 'data', value: { kind: 'expr', source: 'orders' } },
      { name: 'x', value: { kind: 'string', value: 'month' } },
      { name: 'y', value: { kind: 'string', value: 'revenue' } },
    ]);
    expect(page.warnings).toEqual([]);
  });

  it('handles nested braces, strings with braces and > inside props', () => {
    const page = parsePage(
      `<Dropdown name="x" options={[{value: 'a}', label: "b>c"}]} title='It\\'s' />`,
    );
    const node = page.nodes[0] as ComponentNode;
    expect(node.props[1]).toEqual({
      name: 'options',
      value: { kind: 'expr', source: `[{value: 'a}', label: "b>c"}]` },
    });
    expect(node.props[2]).toEqual({
      name: 'title',
      value: { kind: 'string', value: "It's" },
    });
  });

  it('parses boolean flags and multi-line tags', () => {
    const page = parsePage(`<DataTable
  data={orders}
  search
  rows={5}
/>`);
    const node = page.nodes[0] as ComponentNode;
    expect(node.props.map((p) => p.name)).toEqual(['data', 'search', 'rows']);
    expect(node.props[1].value).toEqual({ kind: 'flag' });
  });

  it('nests components with markdown children', () => {
    const page = parsePage(`<Tabs>
  <Tab label="One">
Hello **world**
<BigValue data={k} value="v" />
  </Tab>
  <Tab label="Two">Bye</Tab>
</Tabs>`);
    const tabs = page.nodes[0] as ComponentNode;
    expect(tabs.tag).toBe('Tabs');
    const tabNodes = tabs.children.filter(
      (c) => c.type === 'component',
    ) as ComponentNode[];
    expect(tabNodes.map((t) => t.tag)).toEqual(['Tab', 'Tab']);
    expect(tabNodes[0].children.map((c) => c.type)).toEqual([
      'markdown',
      'component',
    ]);
    expect((tabNodes[1].children[0] as MarkdownNode).source).toBe('Bye');
    expect(page.warnings).toEqual([]);
  });

  it('turns inline components and expressions into slots', () => {
    const page = parsePage(
      'We sold <Value data={t} column="n" /> orders in {inputs.region.value}.',
    );
    const md = page.nodes[0] as MarkdownNode;
    expect(md.type).toBe('markdown');
    expect(md.source).toBe(
      `We sold ${slotPlaceholder(0)} orders in ${slotPlaceholder(1)}.`,
    );
    expect(md.slots[0].kind).toBe('component');
    expect(md.slots[1]).toEqual({
      kind: 'expr',
      source: 'inputs.region.value',
      raw: '{inputs.region.value}',
    });
  });

  it('leaves code spans, fences, comments and escapes alone', () => {
    const page = parsePage(
      'Use `{orders[0]}` and \\{literal}\n\n```js\nconst a = {b: 1};\n<Foo />\n```\n<!-- <BarChart /> -->',
    );
    expect(page.nodes).toHaveLength(1);
    const md = page.nodes[0] as MarkdownNode;
    expect(md.slots).toEqual([]);
    expect(md.source).toContain('`{orders[0]}`');
    expect(md.source).toContain('\\{literal}');
    expect(md.source).toContain('<Foo />');
  });

  it('parses if / else if / else blocks', () => {
    const page = parsePage(`{#if orders.length > 10}
Many
{:else if orders.length > 0}
Some
{:else}
None
{/if}`);
    const node = page.nodes[0] as IfNode;
    expect(node.type).toBe('if');
    expect(node.branches.map((b) => b.condition)).toEqual([
      'orders.length > 10',
      'orders.length > 0',
      undefined,
    ]);
    expect((node.branches[2].children[0] as MarkdownNode).source).toBe('None');
  });

  it('parses each blocks with an index', () => {
    const page = parsePage(`{#each regions as r, i}
- {i}: {r.name}
{/each}`);
    const node = page.nodes[0] as EachNode;
    expect(node).toMatchObject({
      type: 'each',
      expr: 'regions',
      item: 'r',
      index: 'i',
    });
    expect((node.children[0] as MarkdownNode).slots).toHaveLength(2);
  });

  it('warns about unclosed and stray constructs but keeps going', () => {
    const page = parsePage(`<Grid cols={2}>
text
</Tabs>
{/if}
{#if x}
open`);
    const codes = page.warnings.map((w) => w.code).sort();
    expect(codes).toEqual([
      'stray-closing-tag',
      'stray-logic',
      'unclosed-component',
      'unclosed-logic',
    ]);
    expect(collectComponents(page.nodes).map((c) => c.tag)).toEqual(['Grid']);
  });

  it('keeps {{query}} text and treats unknown tags as components', () => {
    const page = parsePage('See {{orders}}\n\n<Mystery foo="bar" />');
    expect((page.nodes[0] as MarkdownNode).source).toBe('See {{orders}}');
    expect((page.nodes[1] as ComponentNode).tag).toBe('Mystery');
  });

  it('accepts sql blocks inside components', () => {
    const page = parsePage(`<Tab label="x">
\`\`\`sql inner
select 2
\`\`\`
</Tab>`);
    expect(collectSqlNodes(page.nodes).map((s) => s.name)).toEqual(['inner']);
  });

  it('does not treat lowercase html as components', () => {
    const page = parsePage('<div>hello</div>');
    expect(page.nodes).toHaveLength(1);
    expect(page.nodes[0].type).toBe('markdown');
  });
});
