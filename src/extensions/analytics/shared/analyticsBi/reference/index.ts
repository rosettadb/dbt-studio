/**
 * Builds the component reference the analytics AI agent reads, from the
 * same specs that drive the renderer, so the two cannot drift apart.
 */
import { BUILT_IN_FORMATS } from '../format';
import { HELPER_NAMES } from '../expressions/evaluate';
import { COMPONENT_SPECS, ComponentCategory, ComponentSpec } from '../specs';

const CATEGORY_TITLES: Record<ComponentCategory, string> = {
  charts: 'Charts',
  values: 'Values',
  tables: 'Tables',
  inputs: 'Inputs (filters)',
  layout: 'Layout',
};

function describeComponent(spec: ComponentSpec): string {
  const lines: string[] = [];
  const aliasNote = spec.aliases?.length
    ? ` (old names: ${spec.aliases.join(', ')})`
    : '';
  lines.push(`- \`<${spec.name}>\`${aliasNote}: ${spec.description}`);
  lines.push(`  Example: \`${spec.example.replace(/\n\s*/g, ' ')}\``);
  const props = spec.props
    .map((p) => {
      const required = p.required ? '*' : '';
      const values = p.values ? ` (${p.values.join('|')})` : '';
      return `${p.name}${required}${values}`;
    })
    .join(', ');
  if (props) lines.push(`  Attributes: ${props}`);
  if (spec.parent) lines.push(`  Goes inside: ${spec.parent.join(', ')}`);
  return lines.join('\n');
}

export function buildComponentReference(): string {
  const sections = (Object.keys(CATEGORY_TITLES) as ComponentCategory[]).map(
    (category) => {
      const specs = COMPONENT_SPECS.filter((s) => s.category === category);
      return `### ${CATEGORY_TITLES[category]}\n${specs.map(describeComponent).join('\n')}`;
    },
  );

  return `
## DBT Studio Analytics Components Reference

Analytics pages are Markdown with named SQL blocks and Evidence-style component tags (legacy Evidence names and attributes). Attributes marked * are required.

### Output Rules (CRITICAL)
- A bare SQL block is never a complete deliverable. Every SQL block MUST be followed by at least one component (DataTable, chart, Value, BigValue, Delta, etc.) that renders its results via \`data={query_name}\`.
- Never answer with a raw SQL query as the final output, even if the user's request only mentions "a query" or "the data" — always render it through the appropriate component.
- If unsure which component fits, default to \`<DataTable data={query_name} />\` rather than leaving results as SQL text only.

### SQL Blocks
\`\`\`sql query_name
SELECT column1, column2 FROM my_table LIMIT 100
\`\`\`
- Components read results with \`data={query_name}\`.
- A SQL block may reuse another as a subquery with \`{{query_name}}\`.
- Results are capped at 500 rows; aggregate in SQL.

### Inputs (filters)
- Give every input a \`name\`. Read it in SQL with \`\${inputs.<name>.value}\`; DateRange gives \`\${inputs.<name>.start}\` and \`\${inputs.<name>.end}\`.
- Write the quotes yourself for text: \`WHERE region = '\${inputs.region.value}'\`. Values are escaped.
- For \`multiple\` Dropdowns use \`WHERE region IN \${inputs.region.value}\` (the value becomes a quoted list in parentheses).
- Changing an input re-runs only the queries that read it.

### Page Logic
- Inline values: \`{orders[0].total}\`, \`{orders.length}\`, \`{fmt(orders[0].total, 'usd')}\`.
- Conditions: \`{#if orders.length > 0}...{:else if ...}...{:else}...{/if}\`.
- Loops: \`{#each regions as r}- {r.region}: {fmt(r.revenue, 'usd0k')}{/each}\`.
- Helpers: ${HELPER_NAMES.join(', ')}. No other functions or methods can be called.

### Formats (fmt, yFmt, comparisonFmt, ...)
${BUILT_IN_FORMATS.join(', ')}; Excel-style patterns such as '#,##0.00' or '0.0%' also work. Columns ending in _usd, _pct or _date are formatted automatically.

${sections.join('\n\n')}
`.trim();
}
