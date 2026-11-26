/**
 * Example dashboard: Product Analytics.
 * Shows: Slider, Checkbox and TextInput filters, ScatterPlot with series,
 * DonutChart, 100% stacked bars, LineChart with several y columns,
 * Accordion, inline expressions with helpers, and {#if} / {#each}.
 */
import type { InputState } from '../engine';
import {
  AccountRow,
  avg,
  groupBy,
  PLANS,
  Row,
  sampleAccounts,
  sum,
} from './sampleData';
import type { ExamplePage } from './types';

const markdown = `---
title: Product Analytics
---

<Alert status="info" title="Example dashboard (read-only)">
Built-in sample data. Read the markdown on the left to see how it's built, or click **Duplicate to my pages** to edit a copy.
</Alert>

<Slider name="min_seats" title="Minimum seats" min={1} max={100} step={1} defaultValue={1} fmt="num0" />
<Checkbox name="paid_only" title="Plan" label="Paid plans only" />
<TextInput name="account_search" title="Account name contains" placeholder="e.g. zen" />

A Checkbox gives \`true\` or \`false\`, so SQL can use it directly: \`where not \${inputs.paid_only.value} or plan <> 'Free'\`.

\`\`\`sql accounts
select *
from accounts
where seats >= \${inputs.min_seats.value}
  and (not \${inputs.paid_only.value} or plan <> 'Free')
  and lower(account) like lower('%\${inputs.account_search.value}%')
\`\`\`

\`\`\`sql headline
select
  count(*) as accounts,
  sum(mrr) as mrr,
  sum(weekly_active_users) * 1.0 / sum(seats) as activation,
  avg(case when churned then 1.0 else 0 end) as churn_rate
from {{accounts}}
\`\`\`

<BigValue data={headline} value="accounts" fmt="num0" />
<BigValue data={headline} value="mrr" title="MRR" fmt="usd0k" />
<BigValue data={headline} value="activation" title="Seats active weekly" fmt="pct0" />
<BigValue data={headline} value="churn_rate" title="Churned" fmt="pct1" downIsGood />

{#if headline[0].accounts == 0}
<Alert status="warning">No accounts match these filters.</Alert>
{:else}
The {fmt(headline[0].accounts, 'num0')} matching accounts pay {fmt(headline[0].mrr, 'usd0k')} a month, and {fmt(headline[0].churn_rate, 'pct1')} of them have churned.
{/if}

## Who uses the product

\`\`\`sql by_plan
select
  plan,
  count(*) as accounts,
  sum(mrr) as mrr,
  avg(sessions_per_user) as sessions_per_user
from {{accounts}}
group by 1
order by mrr desc
\`\`\`

<Grid cols={2}>
  <ScatterPlot data={accounts} x="seats" y="weekly_active_users" series="plan" xAxisTitle="Seats" yAxisTitle="Weekly active users" title="Seats vs. weekly active users" />
  <DonutChart data={by_plan} x="plan" y="mrr" yFmt="usd0k" title="MRR by plan" />
</Grid>

\`\`\`sql feature_adoption
select plan, 'Reports' as feature, avg(case when uses_reports then 1.0 else 0 end) as share from {{accounts}} group by 1
union all
select plan, 'Alerts', avg(case when uses_alerts then 1.0 else 0 end) from {{accounts}} group by 1
union all
select plan, 'API', avg(case when uses_api then 1.0 else 0 end) from {{accounts}} group by 1
\`\`\`

<BarChart data={feature_adoption} x="feature" y="share" series="plan" type="grouped" yFmt="pct0" sort={false} title="Feature adoption by plan" />

\`\`\`sql signups
select
  signup_month,
  count(*) as signups,
  sum(case when churned then 1 else 0 end) as churned
from {{accounts}}
group by 1
order by 1
\`\`\`

<LineChart data={signups} x="signup_month" y={['signups', 'churned']} markers title="Signups and churn by signup month" />

## Plans at a glance

{#each by_plan as p}
- **{p.plan}**: {p.accounts} accounts, {fmt(p.mrr, 'usd0')} MRR, {round(p.sessions_per_user, 1)} sessions per user
{/each}

<Accordion>
  <AccordionItem title="What counts as active?">
A seat is active in a week when its user opens the app at least once that week.
  </AccordionItem>
  <AccordionItem title="Why is Free MRR zero?">
Free accounts don't pay; they are still counted in accounts, activation and churn.
  </AccordionItem>
</Accordion>
`;

function filtered(inputs: InputState): AccountRow[] {
  const minSeats = Number(inputs.min_seats?.value ?? 1);
  const paidOnly = Boolean(inputs.paid_only?.value);
  const search = String(inputs.account_search?.value ?? '').toLowerCase();
  return sampleAccounts().filter(
    (a) =>
      a.seats >= minSeats &&
      (!paidOnly || a.plan !== 'Free') &&
      a.account.toLowerCase().includes(search),
  );
}

function resolve(queryName: string, inputs: InputState): Row[] {
  const rows = filtered(inputs);
  switch (queryName) {
    case 'accounts':
      return rows.map((a) => ({ ...a }));
    case 'headline': {
      const seats = sum(rows, (a) => a.seats);
      return [
        {
          accounts: rows.length,
          mrr: sum(rows, (a) => a.mrr),
          activation: seats
            ? sum(rows, (a) => a.weekly_active_users) / seats
            : null,
          churn_rate: rows.length
            ? rows.filter((a) => a.churned).length / rows.length
            : null,
        },
      ];
    }
    case 'by_plan':
      return groupBy(
        rows,
        (a) => a.plan,
        (g, plan) => ({
          plan,
          accounts: g.length,
          mrr: sum(g, (a) => a.mrr),
          sessions_per_user: avg(g, (a) => a.sessions_per_user),
        }),
      ).sort((a, b) => Number(b.mrr) - Number(a.mrr));
    case 'feature_adoption': {
      const share = (g: AccountRow[], fn: (a: AccountRow) => boolean) =>
        g.length ? g.filter(fn).length / g.length : null;
      const plans = PLANS.filter((p) => rows.some((a) => a.plan === p));
      const features: Array<[string, (a: AccountRow) => boolean]> = [
        ['Reports', (a) => a.uses_reports],
        ['Alerts', (a) => a.uses_alerts],
        ['API', (a) => a.uses_api],
      ];
      return features.flatMap(([feature, fn]) =>
        plans.map((plan) => ({
          plan,
          feature,
          share: share(
            rows.filter((a) => a.plan === plan),
            fn,
          ),
        })),
      );
    }
    case 'signups':
      return groupBy(
        rows,
        (a) => a.signup_month,
        (g, month) => ({
          signup_month: month,
          signups: g.length,
          churned: g.filter((a) => a.churned).length,
        }),
      ).sort((a, b) =>
        String(a.signup_month).localeCompare(String(b.signup_month)),
      );
    default:
      return [];
  }
}

export const productAnalytics: ExamplePage = {
  id: 'example:product-analytics',
  title: 'Product Analytics',
  description:
    'Slider, checkbox and text filters, scatter, donut and adoption charts',
  routePath: '/examples/product-analytics',
  markdown,
  resolve,
};
