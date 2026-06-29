export const evidenceComponentRef = `
## DBT Studio Analytics Components Reference

Analytics pages use Markdown plus named SQL blocks and PascalCase JSX-style component tags.

### SQL Blocks
\`\`\`sql query_name
SELECT column1, column2 FROM my_table LIMIT 100
\`\`\`

Components reference SQL block results with \`data={query_name}\`. SQL blocks may reference earlier page queries as subqueries with \`{{query_name}}\`.

### Data Components
- \`<DataTable data={query_name} title="Rows" rows={100} />\`
  Props: data, title, columns, limit, rows, search, sort, fmt, width
- \`<Value data={query_name} value="metric" label="Metric" fmt="num" />\`
  Props: data, value, title, label, fmt, color, redNegatives, info, comparison, width
- \`<BigValue data={query_name} value="metric" label="Metric" fmt="usd" />\`
  Props: same as Value
- \`<Delta data={query_name} value="metric" comparison="previous_metric" />\`
  Props: data, value, title, label, fmt, color, redNegatives, comparison, isMax, isMin, width

### Chart Components
- \`<BarChart data={query_name} x="category" y="metric" title="Title" />\`
- \`<LineChart data={query_name} x="date" y="metric" title="Title" />\`
- \`<AreaChart data={query_name} x="date" y="metric" stacked={true} />\`
- \`<PieChart data={query_name} x="category" y="metric" />\`
- \`<DonutChart data={query_name} x="category" y="metric" />\`
- \`<ScatterChart data={query_name} x="x_col" y="y_col" />\`
Common chart props: data, title, subtitle, x, y, series, sort, limit, stacked, swap_xy, legend, labels, x_axis_title, y_axis_title, x_axis_options, y_axis_options, date_grain, fmt, width, color

### UI/Layout Components
- \`<Alert severity="info" title="Note">Markdown content</Alert>\`
- \`<Accordion title="Details">Markdown or components</Accordion>\`
- \`<Tabs><Tab title="First">Content</Tab></Tabs>\`
- \`<Grid columns={2} spacing={2}>Content</Grid>\`
- \`<Stack direction="column" spacing={2}>Content</Stack>\`
- \`<Box p={2} width="100%">Content</Box>\`

### Input Components
- \`<ButtonGroup options="A,B,C" default="A" />\`
- \`<Select data={query_name} value="id" label="name" title="Pick one" />\`
- \`<DateRange start="2026-01-01" end="2026-01-31" />\`
- \`<Checkbox label="Include archived" default={false} />\`
- \`<NumberInput label="Limit" default={100} min={1} max={1000} />\`
- \`<TextInput label="Search" placeholder="Customer name" />\`

### Formatting
Supported \`fmt\` values include: usd, eur, gbp, pct, %, k, M, num, id, date, datetime, time.

### Page Frontmatter
---
title: My Dashboard
sidebar_position: 1
sidebar_badge: "New"
---
`;
