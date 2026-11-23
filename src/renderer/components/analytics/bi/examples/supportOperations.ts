/**
 * Example dashboard: Support Operations.
 * Shows: multi-select Dropdown with IN, ButtonGroup, Tabs, stacked AreaChart,
 * LineChart with series, horizontal bars, DataTable with delta and red
 * negatives, Details, and inline values in text.
 */
import type { InputState } from '../engine';
import {
  avg,
  groupBy,
  like,
  Row,
  sampleTickets,
  SAMPLE_END,
  TicketRow,
} from './sampleData';
import type { ExamplePage } from './types';

const markdown = `---
title: Support Operations
---

<Alert status="info" title="Example dashboard (read-only)">
Built-in sample data. Read the markdown on the left to see how it's built, or click **Duplicate to my pages** to edit a copy.
</Alert>

<Dropdown name="channels" title="Channels" multiple defaultValue={['Email', 'Chat', 'Phone']}>
  <DropdownOption value="Email" />
  <DropdownOption value="Chat" />
  <DropdownOption value="Phone" />
</Dropdown>

<ButtonGroup name="priority" title="Priority" defaultValue="%">
  <ButtonGroupItem value="%" valueLabel="All" />
  <ButtonGroupItem value="Urgent" />
  <ButtonGroupItem value="High" />
  <ButtonGroupItem value="Normal" />
  <ButtonGroupItem value="Low" />
</ButtonGroup>

A multi-select Dropdown gives a quoted list, so the SQL uses \`channel in \${inputs.channels.value}\`.

\`\`\`sql summary
select
  count(*) filter (where created_date >= date '2026-10-01') as tickets_this_month,
  count(*) filter (where status = 'Open') as open_tickets,
  median(resolution_hours) as median_hours,
  avg(csat) as avg_csat
from tickets
where channel in \${inputs.channels.value}
  and priority like '\${inputs.priority.value}'
\`\`\`

<BigValue data={summary} value="tickets_this_month" title="Tickets in October" fmt="num0" />
<BigValue data={summary} value="open_tickets" title="Open now" fmt="num0" />
<BigValue data={summary} value="median_hours" title="Median resolution (hours)" fmt="num1" />
<BigValue data={summary} value="avg_csat" title="Average CSAT" fmt="num2" />

Right now there are <Value data={summary} column="open_tickets" fmt="num0" /> open tickets, and half of all tickets are solved within <Value data={summary} column="median_hours" fmt="num1" /> hours.

\`\`\`sql weekly
select
  date_trunc('week', created_date) as week,
  channel,
  priority,
  count(*) as tickets,
  avg(resolution_hours) as avg_hours
from tickets
where channel in \${inputs.channels.value}
  and priority like '\${inputs.priority.value}'
group by 1, 2, 3
order by 1
\`\`\`

\`\`\`sql weekly_by_channel
select week, channel, sum(tickets) as tickets
from {{weekly}}
group by 1, 2
order by 1
\`\`\`

\`\`\`sql weekly_by_priority
select week, priority, sum(tickets * avg_hours) / sum(tickets) as avg_hours
from {{weekly}}
group by 1, 2
order by 1
\`\`\`

\`\`\`sql csat_distribution
select csat as score, count(*) as responses
from tickets
where csat is not null
  and channel in \${inputs.channels.value}
  and priority like '\${inputs.priority.value}'
group by 1
order by 1
\`\`\`

<Tabs>
  <Tab label="Volume">
<AreaChart data={weekly_by_channel} x="week" y="tickets" series="channel" title="Tickets per week by channel" />
  </Tab>
  <Tab label="Resolution time">
<LineChart data={weekly_by_priority} x="week" y="avg_hours" series="priority" yFmt="num0" yAxisTitle="Hours" title="Average resolution hours" />
  </Tab>
  <Tab label="Satisfaction">
<BarChart data={csat_distribution} x="score" y="responses" sort={false} labels title="CSAT responses by score" />
  </Tab>
</Tabs>

## Agents

\`\`\`sql agents
select
  agent,
  count(*) as tickets,
  avg(resolution_hours) as avg_hours,
  avg(csat) as avg_csat,
  avg(csat) - (select avg(csat) from tickets) as csat_vs_team
from tickets
where channel in \${inputs.channels.value}
  and priority like '\${inputs.priority.value}'
group by 1
order by tickets desc
\`\`\`

<DataTable data={agents} rowNumbers totalRow>
  <Column id="agent" title="Agent" totalAgg="Team" />
  <Column id="tickets" fmt="num0" />
  <Column id="avg_hours" title="Avg hours" fmt="num1" totalAgg="mean" />
  <Column id="avg_csat" title="Avg CSAT" fmt="num2" totalAgg="mean" />
  <Column id="csat_vs_team" title="CSAT vs team" fmt="num2" contentType="delta" totalAgg=" " />
</DataTable>

\`\`\`sql categories
select category, count(*) as tickets
from tickets
where channel in \${inputs.channels.value}
  and priority like '\${inputs.priority.value}'
group by 1
order by 2 desc
\`\`\`

<BarChart data={categories} x="category" y="tickets" swapXY labels title="What tickets are about" chartAreaHeight={220} />

<Details title="How are these numbers calculated?">
Resolution time counts hours from creation to the solved status; open tickets are left out. CSAT is the 1–5 score customers give after a ticket is solved; about a third don't answer. Data runs to ${SAMPLE_END}.
</Details>
`;

function filtered(inputs: InputState): TicketRow[] {
  const channels = inputs.channels?.value;
  const list = Array.isArray(channels) ? channels.map(String) : [];
  const priority = String(inputs.priority?.value ?? '%');
  return sampleTickets().filter(
    (t) => list.includes(t.channel) && like(t.priority, priority),
  );
}

const weekOf = (date: string) => {
  const d = new Date(`${date}T00:00:00Z`);
  const day = (d.getUTCDay() + 6) % 7; // Monday-based, like date_trunc('week')
  d.setUTCDate(d.getUTCDate() - day);
  return d.toISOString().slice(0, 10);
};

function median(values: number[]): number | null {
  if (!values.length) return null;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

function weekly(inputs: InputState) {
  return groupBy(
    filtered(inputs),
    (t) => `${weekOf(t.created_date)}|${t.channel}|${t.priority}`,
    (g) => ({
      week: weekOf(g[0].created_date),
      channel: g[0].channel,
      priority: g[0].priority,
      tickets: g.length,
      avg_hours: avg(g, (t) => t.resolution_hours),
    }),
  );
}

function resolve(queryName: string, inputs: InputState): Row[] {
  const rows = filtered(inputs);
  switch (queryName) {
    case 'summary':
      return [
        {
          tickets_this_month: rows.filter((t) => t.created_date >= '2026-10-01')
            .length,
          open_tickets: rows.filter((t) => t.status === 'Open').length,
          median_hours: median(
            rows
              .map((t) => t.resolution_hours)
              .filter((h): h is number => h !== null),
          ),
          avg_csat: avg(rows, (t) => t.csat),
        },
      ];
    case 'weekly':
      return weekly(inputs);
    case 'weekly_by_channel':
      return groupBy(
        weekly(inputs),
        (r) => `${r.week}|${r.channel}`,
        (g) => ({
          week: g[0].week,
          channel: g[0].channel,
          tickets: g.reduce((a, r) => a + Number(r.tickets), 0),
        }),
      ).sort((a, b) => String(a.week).localeCompare(String(b.week)));
    case 'weekly_by_priority':
      return groupBy(
        weekly(inputs),
        (r) => `${r.week}|${r.priority}`,
        (g) => {
          const withHours = g.filter((r) => r.avg_hours !== null);
          const tickets = withHours.reduce((a, r) => a + Number(r.tickets), 0);
          return {
            week: g[0].week,
            priority: g[0].priority,
            avg_hours: tickets
              ? withHours.reduce(
                  (a, r) => a + Number(r.tickets) * Number(r.avg_hours),
                  0,
                ) / tickets
              : null,
          };
        },
      ).sort((a, b) => String(a.week).localeCompare(String(b.week)));
    case 'csat_distribution':
      return groupBy(
        rows.filter((t) => t.csat !== null),
        (t) => String(t.csat),
        (g) => ({ score: g[0].csat, responses: g.length }),
      ).sort((a, b) => Number(a.score) - Number(b.score));
    case 'agents': {
      const team = avg(sampleTickets(), (t) => t.csat) ?? 0;
      return groupBy(
        rows,
        (t) => t.agent,
        (g, agent) => {
          const csat = avg(g, (t) => t.csat);
          return {
            agent,
            tickets: g.length,
            avg_hours: avg(g, (t) => t.resolution_hours),
            avg_csat: csat,
            csat_vs_team: csat === null ? null : csat - team,
          };
        },
      ).sort((a, b) => Number(b.tickets) - Number(a.tickets));
    }
    case 'categories':
      return groupBy(
        rows,
        (t) => t.category,
        (g, category) => ({
          category,
          tickets: g.length,
        }),
      ).sort((a, b) => Number(b.tickets) - Number(a.tickets));
    default:
      return [];
  }
}

export const supportOperations: ExamplePage = {
  id: 'example:support-operations',
  title: 'Support Operations',
  description:
    'Multi-select filters, tabs, resolution times and an agent table',
  routePath: '/examples/support-operations',
  markdown,
  resolve,
};
