/**
 * Example dashboard: Sales Overview.
 * Shows: Dropdown from a query, ButtonGroup, DateRange, BigValue with
 * comparisons, inline Value / Delta, {#if}, {#each}, stacked BarChart,
 * horizontal BarChart, LineChart, Grid and a DataTable with Columns.
 */
import type { InputState } from '../engine';
import {
  groupBy,
  like,
  monthOf,
  OrderRow,
  Row,
  sampleOrders,
  sum,
} from './sampleData';
import type { ExamplePage } from './types';

const markdown = `---
title: Sales Overview
---

<Alert status="info" title="Example dashboard (read-only)">
This page runs on built-in sample data so you can see every part working. The markdown on the left is the whole dashboard: SQL blocks, filters and components. Click **Duplicate to my pages** to get an editable copy, then point the SQL at your own tables.
</Alert>

## Filters

Every query below reads these filters through \`\${inputs.<name>.value}\`. Changing one re-runs only the queries that use it.

\`\`\`sql regions
select distinct region
from orders
order by region
\`\`\`

<Dropdown name="region" data={regions} value="region" title="Region" defaultValue="%">
  <DropdownOption value="%" valueLabel="All regions" />
</Dropdown>

<ButtonGroup name="channel" title="Channel" defaultValue="%">
  <ButtonGroupItem value="%" valueLabel="All" />
  <ButtonGroupItem value="Web" />
  <ButtonGroupItem value="Store" />
  <ButtonGroupItem value="Partner" />
</ButtonGroup>

## Last month

\`\`\`sql kpis
with monthly as (
  select
    date_trunc('month', order_date) as month,
    sum(revenue) as revenue,
    count(*) as orders,
    sum(revenue - cost) / sum(revenue) as margin
  from orders
  where region like '\${inputs.region.value}'
    and channel like '\${inputs.channel.value}'
  group by 1
)
select
  revenue,
  orders,
  margin,
  revenue / lag(revenue) over (order by month) - 1 as revenue_growth,
  orders * 1.0 / lag(orders) over (order by month) - 1 as orders_growth
from monthly
order by month desc
limit 1
\`\`\`

<BigValue data={kpis} value="revenue" title="Revenue" fmt="usd0k" comparison="revenue_growth" comparisonFmt="pct1" comparisonTitle="vs prior month" />
<BigValue data={kpis} value="orders" title="Orders" fmt="num0" comparison="orders_growth" comparisonFmt="pct1" comparisonTitle="vs prior month" />
<BigValue data={kpis} value="margin" title="Gross margin" fmt="pct1" />

{#if kpis[0].revenue_growth < 0}
<Alert status="warning">
Revenue fell <Delta data={kpis} column="revenue_growth" fmt="pct1" /> against the prior month.
</Alert>
{:else}
Revenue grew <Delta data={kpis} column="revenue_growth" fmt="pct1" /> against the prior month, on <Value data={kpis} column="orders" fmt="num0" /> orders.
{/if}

## Trends

\`\`\`sql monthly_by_category
select
  date_trunc('month', order_date) as month,
  category,
  sum(revenue) as revenue
from orders
where region like '\${inputs.region.value}'
  and channel like '\${inputs.channel.value}'
group by 1, 2
order by 1
\`\`\`

<BarChart data={monthly_by_category} x="month" y="revenue" series="category" yFmt="usd0k" title="Revenue by month and category" />

<DateRange name="period" title="Daily view" start="2026-08-01" end="2026-10-31" />

\`\`\`sql daily
select order_date, sum(revenue) as revenue, count(*) as orders
from orders
where order_date between '\${inputs.period.start}' and '\${inputs.period.end}'
  and region like '\${inputs.region.value}'
  and channel like '\${inputs.channel.value}'
group by 1
order by 1
\`\`\`

\`\`\`sql by_region
select region, sum(revenue) as revenue
from orders
where channel like '\${inputs.channel.value}'
group by 1
order by 2 desc
\`\`\`

<Grid cols={2}>
  <LineChart data={daily} x="order_date" y="revenue" yFmt="usd0k" title="Daily revenue" subtitle="Uses the Daily view dates" />
  <BarChart data={by_region} x="region" y="revenue" swapXY yFmt="usd0k" labels title="Revenue by region" subtitle="All regions, selected channel" />
</Grid>

## Customers

\`\`\`sql top_customers
select
  customer,
  count(*) as orders,
  sum(revenue) as revenue,
  sum(revenue - cost) / sum(revenue) as margin
from orders
where region like '\${inputs.region.value}'
  and channel like '\${inputs.channel.value}'
group by 1
order by revenue desc
limit 10
\`\`\`

<DataTable data={top_customers} title="Top 10 customers" search rows={5} totalRow>
  <Column id="customer" title="Customer" totalAgg="Total" />
  <Column id="orders" fmt="num0" />
  <Column id="revenue" fmt="usd0" contentType="colorscale" />
  <Column id="margin" fmt="pct1" totalAgg="mean" />
</DataTable>

\`\`\`sql region_leaders
select region, customer, revenue
from (
  select
    region,
    customer,
    sum(revenue) as revenue,
    row_number() over (partition by region order by sum(revenue) desc) as rank
  from orders
  where channel like '\${inputs.channel.value}'
  group by 1, 2
) ranked
where rank = 1
order by revenue desc
\`\`\`

Biggest customer in each region, written with \`{#each}\`:

{#each region_leaders as leader}
- **{leader.region}**: {leader.customer}, {fmt(leader.revenue, 'usd0k')}
{/each}
`;

function filtered(
  inputs: InputState,
  opts: { region?: boolean; channel?: boolean } = {},
) {
  const region = String(inputs.region?.value ?? '%');
  const channel = String(inputs.channel?.value ?? '%');
  return sampleOrders().filter(
    (o) =>
      (opts.region === false || like(o.region, region)) &&
      (opts.channel === false || like(o.channel, channel)),
  );
}

const margin = (rows: OrderRow[]) => {
  const revenue = sum(rows, (r) => r.revenue);
  return revenue ? (revenue - sum(rows, (r) => r.cost)) / revenue : null;
};

function resolve(queryName: string, inputs: InputState): Row[] {
  switch (queryName) {
    case 'regions':
      return Array.from(new Set(sampleOrders().map((o) => o.region)))
        .sort()
        .map((region) => ({ region }));
    case 'kpis': {
      const months = groupBy(
        filtered(inputs),
        (o) => monthOf(o.order_date),
        (g, month) => ({
          month,
          revenue: sum(g, (r) => r.revenue),
          orders: g.length,
          margin: margin(g),
        }),
      ).sort((a, b) => String(a.month).localeCompare(String(b.month)));
      if (months.length === 0) return [];
      const last = months[months.length - 1];
      const prev = months[months.length - 2];
      const growth = (a: unknown, b: unknown) =>
        b ? Number(a) / Number(b) - 1 : null;
      return [
        {
          revenue: last.revenue,
          orders: last.orders,
          margin: last.margin,
          revenue_growth: prev ? growth(last.revenue, prev.revenue) : null,
          orders_growth: prev ? growth(last.orders, prev.orders) : null,
        },
      ];
    }
    case 'monthly_by_category':
      return groupBy(
        filtered(inputs),
        (o) => `${monthOf(o.order_date)}|${o.category}`,
        (g) => ({
          month: monthOf(g[0].order_date),
          category: g[0].category,
          revenue: sum(g, (r) => r.revenue),
        }),
      ).sort((a, b) => String(a.month).localeCompare(String(b.month)));
    case 'daily': {
      const start = String(inputs.period?.start ?? '');
      const end = String(inputs.period?.end ?? '');
      return groupBy(
        filtered(inputs).filter(
          (o) => o.order_date >= start && o.order_date <= end,
        ),
        (o) => o.order_date,
        (g, day) => ({
          order_date: day,
          revenue: sum(g, (r) => r.revenue),
          orders: g.length,
        }),
      ).sort((a, b) =>
        String(a.order_date).localeCompare(String(b.order_date)),
      );
    }
    case 'by_region':
      return groupBy(
        filtered(inputs, { region: false }),
        (o) => o.region,
        (g, region) => ({
          region,
          revenue: sum(g, (r) => r.revenue),
        }),
      ).sort((a, b) => Number(b.revenue) - Number(a.revenue));
    case 'top_customers':
      return groupBy(
        filtered(inputs),
        (o) => o.customer,
        (g, customer) => ({
          customer,
          orders: g.length,
          revenue: sum(g, (r) => r.revenue),
          margin: margin(g),
        }),
      )
        .sort((a, b) => Number(b.revenue) - Number(a.revenue))
        .slice(0, 10);
    case 'region_leaders': {
      const byPair = groupBy(
        filtered(inputs, { region: false }),
        (o) => `${o.region}|${o.customer}`,
        (g) => ({
          region: g[0].region,
          customer: g[0].customer,
          revenue: sum(g, (r) => r.revenue),
        }),
      );
      return groupBy(
        byPair,
        (r) => String(r.region),
        (g) =>
          g.reduce((best, r) =>
            Number(r.revenue) > Number(best.revenue) ? r : best,
          ),
      ).sort((a, b) => Number(b.revenue) - Number(a.revenue));
    }
    default:
      return [];
  }
}

export const salesOverview: ExamplePage = {
  id: 'example:sales-overview',
  title: 'Sales Overview',
  description: 'Filters, KPI tiles, trends, a customer table and page logic',
  routePath: '/examples/sales-overview',
  markdown,
  resolve,
};
