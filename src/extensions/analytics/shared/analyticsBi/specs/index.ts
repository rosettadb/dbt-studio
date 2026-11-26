/* eslint-disable no-template-curly-in-string -- descriptions show the literal ${inputs...} syntax */
/**
 * Component specs: the single source of truth for component names, aliases,
 * attributes and descriptions. Drives the renderer registry, validation
 * warnings, the AI agent's component reference and the example pages.
 *
 * Names and attributes follow legacy Evidence (@evidence-dev/core-components
 * 5.x). Names and snake_case attributes used by the original dbt-studio
 * Analytics renderer are kept as aliases so existing pages keep working.
 */

export type ComponentCategory =
  | 'charts'
  | 'values'
  | 'tables'
  | 'inputs'
  | 'layout';

export type PropType =
  | 'data'
  | 'column'
  | 'columns'
  | 'string'
  | 'number'
  | 'boolean'
  | 'fmt'
  | 'enum'
  | 'color'
  | 'array'
  | 'object';

export interface PropSpec {
  name: string;
  type: PropType;
  description: string;
  aliases?: string[];
  values?: string[];
  required?: boolean;
  default?: string;
}

export interface ComponentSpec {
  name: string;
  aliases?: string[];
  /** Props implied by an alias, e.g. HorizontalBarChart → swapXY. */
  aliasDefaults?: Record<string, Record<string, unknown>>;
  category: ComponentCategory;
  description: string;
  props: PropSpec[];
  /** Child components accepted; 'markdown' means any content. */
  children?: 'markdown' | string[];
  /** Must be placed inside one of these. */
  parent?: string[];
  /** Not in legacy Evidence; kept as a dbt-studio addition. */
  extra?: boolean;
  /** Old attributes accepted with no effect, with a hint. */
  retired?: Record<string, string>;
  example: string;
}

const DATA: PropSpec = {
  name: 'data',
  type: 'data',
  description: 'Name of a SQL block on the page, e.g. data={orders}',
  required: true,
};
const TITLE: PropSpec = {
  name: 'title',
  type: 'string',
  description: 'Title shown above the component',
};
const SUBTITLE: PropSpec = {
  name: 'subtitle',
  type: 'string',
  description: 'Smaller text under the title',
};
const NAME: PropSpec = {
  name: 'name',
  type: 'string',
  description: 'Input name; read it in SQL as ${inputs.<name>.value}',
  required: true,
};
const DEFAULT_VALUE: PropSpec = {
  name: 'defaultValue',
  type: 'string',
  description: 'Initial value',
  aliases: ['default'],
};

const CHART_PROPS: PropSpec[] = [
  DATA,
  {
    name: 'x',
    type: 'column',
    description: 'Column for the x axis (categories or dates)',
  },
  {
    name: 'y',
    type: 'columns',
    description:
      'Column(s) for the values; y={["a","b"]} draws one series per column',
  },
  {
    name: 'series',
    type: 'column',
    description: 'Column that splits the rows into series',
  },
  TITLE,
  SUBTITLE,
  {
    name: 'xAxisTitle',
    type: 'string',
    description: 'Title of the x axis',
    aliases: ['x_axis_title'],
  },
  {
    name: 'yAxisTitle',
    type: 'string',
    description: 'Title of the y axis',
    aliases: ['y_axis_title'],
  },
  { name: 'xFmt', type: 'fmt', description: 'Format for x values, e.g. "mdy"' },
  {
    name: 'yFmt',
    type: 'fmt',
    description: 'Format for y values, e.g. "usd0k"',
    aliases: ['fmt'],
  },
  {
    name: 'sort',
    type: 'boolean',
    description:
      'Sort bars by value (true), or "asc"/"desc"; false keeps query order',
  },
  {
    name: 'labels',
    type: 'boolean',
    description: 'Show value labels on the marks',
  },
  {
    name: 'legend',
    type: 'boolean',
    description: 'Show the legend (default: when there are 2+ series)',
  },
  {
    name: 'colorPalette',
    type: 'array',
    description: 'Series colors, e.g. {["#236aa4","#45a1bf"]}',
  },
  {
    name: 'color',
    type: 'color',
    description: 'Color for a single-series chart',
  },
  { name: 'yMin', type: 'number', description: 'Lower bound of the y axis' },
  { name: 'yMax', type: 'number', description: 'Upper bound of the y axis' },
  {
    name: 'chartAreaHeight',
    type: 'number',
    description: 'Chart height in pixels',
    aliases: ['height'],
  },
  { name: 'limit', type: 'number', description: 'Only plot the first N rows' },
  {
    name: 'xAxisOptions',
    type: 'object',
    description: 'Old style axis options {title, min, max}',
    aliases: ['x_axis_options'],
  },
  {
    name: 'yAxisOptions',
    type: 'object',
    description: 'Old style axis options {title, min, max}',
    aliases: ['y_axis_options'],
  },
];

const CHART_RETIRED = {
  date_grain:
    "Group by date in the SQL instead, e.g. date_trunc('month', order_date)",
  dateGrain:
    "Group by date in the SQL instead, e.g. date_trunc('month', order_date)",
  width: 'Wrap the chart in <Grid cols={2}> to place charts side by side',
};

const TYPE_PROP: PropSpec = {
  name: 'type',
  type: 'enum',
  values: ['grouped', 'stacked', 'stacked100'],
  description: 'How multiple series are drawn',
  default: 'stacked',
};

export const COMPONENT_SPECS: ComponentSpec[] = [
  // ── Charts ──────────────────────────────────────────────────────────────
  {
    name: 'BarChart',
    aliases: ['HorizontalBarChart', 'ColumnChart'],
    aliasDefaults: { HorizontalBarChart: { swapXY: true } },
    category: 'charts',
    description: 'Bar or column chart; set swapXY for horizontal bars',
    props: [
      ...CHART_PROPS,
      TYPE_PROP,
      {
        name: 'swapXY',
        type: 'boolean',
        description: 'Draw horizontal bars',
        aliases: ['swap_xy'],
      },
      {
        name: 'stacked',
        type: 'boolean',
        description: 'Old name for type="stacked"',
      },
    ],
    retired: CHART_RETIRED,
    example:
      '<BarChart data={sales_by_region} x="region" y="revenue" yFmt="usd0k" title="Revenue by region" />',
  },
  {
    name: 'LineChart',
    category: 'charts',
    description: 'Line chart for trends over time',
    props: [
      ...CHART_PROPS,
      {
        name: 'markers',
        type: 'boolean',
        description: 'Show a dot at each point',
      },
      { name: 'step', type: 'boolean', description: 'Draw a step line' },
    ],
    retired: CHART_RETIRED,
    example: '<LineChart data={monthly} x="month" y="revenue" yFmt="usd0k" />',
  },
  {
    name: 'AreaChart',
    category: 'charts',
    description: 'Area chart; stacked when there are several series',
    props: [
      ...CHART_PROPS,
      TYPE_PROP,
      {
        name: 'stacked',
        type: 'boolean',
        description: 'Old name for type="stacked"',
      },
    ],
    retired: CHART_RETIRED,
    example:
      '<AreaChart data={monthly} x="month" y="orders" series="channel" />',
  },
  {
    name: 'ScatterPlot',
    aliases: ['ScatterChart'],
    category: 'charts',
    description: 'Scatter plot of two numeric columns',
    props: [
      ...CHART_PROPS,
      {
        name: 'pointSize',
        type: 'number',
        description: 'Point size in pixels',
      },
    ],
    retired: { ...CHART_RETIRED, pointShape: 'Points are always circles' },
    example:
      '<ScatterPlot data={customers} x="orders" y="lifetime_value" series="segment" />',
  },
  {
    name: 'PieChart',
    category: 'charts',
    extra: true,
    description: 'Pie chart (dbt-studio addition; not in legacy Evidence)',
    props: [
      DATA,
      {
        name: 'x',
        type: 'column',
        description: 'Column with slice names',
        aliases: ['name'],
      },
      {
        name: 'y',
        type: 'column',
        description: 'Column with slice values',
        aliases: ['value'],
      },
      TITLE,
      SUBTITLE,
      {
        name: 'yFmt',
        type: 'fmt',
        description: 'Format for values',
        aliases: ['fmt'],
      },
      { name: 'labels', type: 'boolean', description: 'Show slice labels' },
      { name: 'legend', type: 'boolean', description: 'Show the legend' },
      { name: 'colorPalette', type: 'array', description: 'Slice colors' },
      {
        name: 'innerRadius',
        type: 'number',
        description: 'Inner radius in % (makes a donut)',
      },
      { name: 'donut', type: 'boolean', description: 'Draw as a donut' },
      {
        name: 'chartAreaHeight',
        type: 'number',
        description: 'Chart height in pixels',
        aliases: ['height'],
      },
      {
        name: 'limit',
        type: 'number',
        description: 'Only plot the first N rows',
      },
    ],
    retired: CHART_RETIRED,
    example: '<PieChart data={by_channel} x="channel" y="orders" />',
  },
  {
    name: 'DonutChart',
    category: 'charts',
    extra: true,
    description: 'Donut chart (dbt-studio addition; not in legacy Evidence)',
    props: [],
    retired: CHART_RETIRED,
    example: '<DonutChart data={by_channel} x="channel" y="orders" />',
  },

  // ── Values ──────────────────────────────────────────────────────────────
  {
    name: 'Value',
    category: 'values',
    description: 'A single formatted value; can sit inside a sentence',
    props: [
      DATA,
      {
        name: 'column',
        type: 'column',
        description: 'Column to show (default: first column)',
        aliases: ['value'],
      },
      { name: 'row', type: 'number', description: 'Row index (default 0)' },
      { name: 'fmt', type: 'fmt', description: 'Format, e.g. "usd" or "pct1"' },
      {
        name: 'placeholder',
        type: 'string',
        description: 'Shown while the query has not run',
      },
      {
        name: 'redNegatives',
        type: 'boolean',
        description: 'Show negative numbers in red',
      },
      { name: 'color', type: 'color', description: 'Text color' },
      {
        name: 'title',
        type: 'string',
        description: 'Old attribute; shown as a label',
        aliases: ['label'],
      },
    ],
    retired: {
      info: 'Put explanations in the text around the value',
      width: 'Not needed',
    },
    example:
      'We sold <Value data={totals} column="orders" fmt="num0" /> orders.',
  },
  {
    name: 'BigValue',
    category: 'values',
    description: 'KPI tile: big number, title and an optional comparison',
    props: [
      DATA,
      {
        name: 'value',
        type: 'column',
        description: 'Column with the value',
        required: true,
        aliases: ['column'],
      },
      {
        name: 'title',
        type: 'string',
        description: 'Tile title (default: column name)',
        aliases: ['label'],
      },
      { name: 'fmt', type: 'fmt', description: 'Format for the value' },
      {
        name: 'comparison',
        type: 'column',
        description: 'Column with a comparison value (e.g. growth)',
      },
      {
        name: 'comparisonTitle',
        type: 'string',
        description: 'Text after the comparison',
      },
      {
        name: 'comparisonFmt',
        type: 'fmt',
        description: 'Format for the comparison',
      },
      {
        name: 'comparisonDelta',
        type: 'boolean',
        description: 'Show the comparison as an up/down delta (default true)',
        default: 'true',
      },
      {
        name: 'downIsGood',
        type: 'boolean',
        description: 'Color decreases green',
      },
      {
        name: 'minWidth',
        type: 'string',
        description: 'Minimum tile width, e.g. "18%"',
      },
      {
        name: 'redNegatives',
        type: 'boolean',
        description: 'Show a negative value in red',
      },
      {
        name: 'info',
        type: 'string',
        description: 'Tooltip text next to the title',
      },
    ],
    retired: { width: 'Wrap tiles in <Grid cols={4}> to size them' },
    example:
      '<BigValue data={kpis} value="revenue" fmt="usd0k" comparison="revenue_growth" comparisonFmt="pct1" comparisonTitle="vs last month" />',
  },
  {
    name: 'Delta',
    category: 'values',
    description: 'Up/down indicator for a change, usually inline in text',
    props: [
      DATA,
      {
        name: 'column',
        type: 'column',
        description: 'Column with the change',
        aliases: ['value'],
      },
      { name: 'row', type: 'number', description: 'Row index (default 0)' },
      {
        name: 'comparison',
        type: 'column',
        description: 'Old attribute: show value minus this column',
      },
      { name: 'fmt', type: 'fmt', description: 'Format, e.g. "pct1"' },
      {
        name: 'downIsGood',
        type: 'boolean',
        description: 'Color decreases green',
      },
      {
        name: 'showSymbol',
        type: 'boolean',
        description: 'Show ▲ / ▼ (default true)',
        default: 'true',
      },
      {
        name: 'showValue',
        type: 'boolean',
        description: 'Show the number (default true)',
        default: 'true',
      },
      { name: 'text', type: 'string', description: 'Text after the value' },
      { name: 'chip', type: 'boolean', description: 'Draw as a colored chip' },
      {
        name: 'neutralMin',
        type: 'number',
        description: 'Values from neutralMin to neutralMax are grey',
      },
      {
        name: 'neutralMax',
        type: 'number',
        description: 'Values from neutralMin to neutralMax are grey',
      },
      {
        name: 'title',
        type: 'string',
        description: 'Old attribute; shown as a label',
        aliases: ['label'],
      },
    ],
    retired: {
      isMax: 'Not supported',
      isMin: 'Not supported',
      redNegatives: 'Delta colors by direction',
      width: 'Not needed',
    },
    example:
      'Revenue grew <Delta data={kpis} column="revenue_growth" fmt="pct1" /> month over month.',
  },

  // ── Tables ──────────────────────────────────────────────────────────────
  {
    name: 'DataTable',
    category: 'tables',
    description:
      'Table with search, sort, paging, totals and per-column formats',
    props: [
      DATA,
      TITLE,
      {
        name: 'rows',
        type: 'number',
        description: 'Rows per page (default 10)',
        aliases: ['pageSize'],
      },
      { name: 'search', type: 'boolean', description: 'Show a search box' },
      {
        name: 'sortable',
        type: 'boolean',
        description: 'Allow sorting by clicking a header (default true)',
        default: 'true',
      },
      {
        name: 'totalRow',
        type: 'boolean',
        description: 'Add a total row (see Column totalAgg)',
      },
      { name: 'rowNumbers', type: 'boolean', description: 'Show row numbers' },
      {
        name: 'rowShading',
        type: 'boolean',
        description: 'Shade every other row',
      },
      { name: 'compact', type: 'boolean', description: 'Tighter rows' },
      {
        name: 'emptyMessage',
        type: 'string',
        description: 'Text when there are no rows',
      },
      {
        name: 'columns',
        type: 'columns',
        description: 'Old attribute: list of columns to show',
      },
      {
        name: 'fmt',
        type: 'fmt',
        description: 'Old attribute: one format for every number',
      },
      {
        name: 'limit',
        type: 'number',
        description: 'Only show the first N rows',
      },
      {
        name: 'sort',
        type: 'string',
        description: 'Initial sort: "column" or "column desc"',
      },
      {
        name: 'wrapTitles',
        type: 'boolean',
        description: 'Wrap long column titles',
        aliases: ['wrap'],
      },
    ],
    children: ['Column'],
    example:
      '<DataTable data={orders} search rows={10}>\n  <Column id="customer" />\n  <Column id="revenue" fmt="usd0" totalAgg="sum" />\n</DataTable>',
  },
  {
    name: 'Column',
    category: 'tables',
    description: 'One column of a DataTable',
    parent: ['DataTable'],
    props: [
      {
        name: 'id',
        type: 'column',
        description: 'Column name in the query',
        required: true,
      },
      {
        name: 'title',
        type: 'string',
        description: 'Header text (default: column name)',
      },
      { name: 'fmt', type: 'fmt', description: 'Format for this column' },
      {
        name: 'align',
        type: 'enum',
        values: ['left', 'center', 'right'],
        description: 'Text alignment',
      },
      {
        name: 'totalAgg',
        type: 'enum',
        values: [
          'sum',
          'mean',
          'median',
          'min',
          'max',
          'count',
          'countDistinct',
        ],
        description: 'How the total row is computed; or any text to show',
      },
      { name: 'totalFmt', type: 'fmt', description: 'Format for the total' },
      {
        name: 'contentType',
        type: 'enum',
        values: ['delta', 'colorscale'],
        description: 'Render the value as a delta or a color scale',
      },
      {
        name: 'downIsGood',
        type: 'boolean',
        description: 'For delta columns: color decreases green',
      },
      {
        name: 'redNegatives',
        type: 'boolean',
        description: 'Show negative numbers in red',
      },
      { name: 'wrap', type: 'boolean', description: 'Wrap long text' },
      {
        name: 'colorMax',
        type: 'number',
        description: 'For colorscale: value that gets the full color',
      },
    ],
    example: '<Column id="growth" fmt="pct1" contentType="delta" />',
  },

  // ── Inputs ──────────────────────────────────────────────────────────────
  {
    name: 'Dropdown',
    aliases: ['Select'],
    category: 'inputs',
    description:
      'Dropdown filter; options from a query or DropdownOption children',
    props: [
      NAME,
      {
        name: 'data',
        type: 'data',
        description: 'SQL block that lists the options',
      },
      {
        name: 'value',
        type: 'column',
        description: 'Column with option values',
      },
      {
        name: 'label',
        type: 'column',
        description: 'Column with option labels (default: value)',
      },
      TITLE,
      DEFAULT_VALUE,
      {
        name: 'multiple',
        type: 'boolean',
        description: 'Allow several values; use IN ${inputs.x.value}',
      },
      {
        name: 'noDefault',
        type: 'boolean',
        description: 'Start with nothing selected',
      },
      {
        name: 'options',
        type: 'array',
        description: 'Old attribute: list of options',
      },
    ],
    children: ['DropdownOption'],
    example:
      '<Dropdown name="region" data={regions} value="region" title="Region" defaultValue="EMEA" />',
  },
  {
    name: 'DropdownOption',
    category: 'inputs',
    parent: ['Dropdown'],
    description: 'A fixed option of a Dropdown',
    props: [
      {
        name: 'value',
        type: 'string',
        description: 'Value passed to SQL',
        required: true,
      },
      {
        name: 'valueLabel',
        type: 'string',
        description: 'Text shown (default: value)',
        aliases: ['label'],
      },
    ],
    example: '<DropdownOption value="%" valueLabel="All regions" />',
  },
  {
    name: 'ButtonGroup',
    category: 'inputs',
    description:
      'Row of toggle buttons; options from a query or ButtonGroupItem children',
    props: [
      NAME,
      {
        name: 'data',
        type: 'data',
        description: 'SQL block that lists the options',
      },
      {
        name: 'value',
        type: 'column',
        description: 'Column with option values',
      },
      {
        name: 'label',
        type: 'column',
        description: 'Column with option labels',
      },
      TITLE,
      DEFAULT_VALUE,
      {
        name: 'options',
        type: 'array',
        description: 'Old attribute: list of options',
      },
      {
        name: 'multiple',
        type: 'boolean',
        description: 'Allow several values',
      },
    ],
    children: ['ButtonGroupItem'],
    example:
      '<ButtonGroup name="channel" defaultValue="web">\n  <ButtonGroupItem value="web" valueLabel="Web" />\n  <ButtonGroupItem value="store" valueLabel="Store" />\n</ButtonGroup>',
  },
  {
    name: 'ButtonGroupItem',
    category: 'inputs',
    parent: ['ButtonGroup'],
    description: 'A fixed option of a ButtonGroup',
    props: [
      {
        name: 'value',
        type: 'string',
        description: 'Value passed to SQL',
        required: true,
      },
      {
        name: 'valueLabel',
        type: 'string',
        description: 'Text shown (default: value)',
        aliases: ['label'],
      },
      { name: 'default', type: 'boolean', description: 'Selected at start' },
    ],
    example: '<ButtonGroupItem value="web" valueLabel="Web" />',
  },
  {
    name: 'DateRange',
    category: 'inputs',
    description:
      'Start and end date; read ${inputs.x.start} and ${inputs.x.end}',
    props: [
      NAME,
      TITLE,
      {
        name: 'start',
        type: 'string',
        description: 'Default start date (YYYY-MM-DD)',
      },
      {
        name: 'end',
        type: 'string',
        description: 'Default end date (YYYY-MM-DD)',
      },
      {
        name: 'defaultValue',
        type: 'string',
        description:
          'Preset: "Last 7 Days", "Last 30 Days", "Last 90 Days", "Last 12 Months", "Month to Date", "Year to Date", "All Time"',
        aliases: ['default'],
      },
    ],
    example:
      '<DateRange name="period" title="Period" defaultValue="Last 90 Days" />',
  },
  {
    name: 'TextInput',
    category: 'inputs',
    description: 'Free-text filter',
    props: [
      NAME,
      TITLE,
      { name: 'placeholder', type: 'string', description: 'Placeholder text' },
      DEFAULT_VALUE,
      {
        name: 'label',
        type: 'string',
        description: 'Old attribute; same as title',
      },
    ],
    example:
      '<TextInput name="search" title="Customer contains" placeholder="Acme" />',
  },
  {
    name: 'NumberInput',
    category: 'inputs',
    extra: true,
    description: 'Number box (dbt-studio addition)',
    props: [
      NAME,
      TITLE,
      DEFAULT_VALUE,
      { name: 'min', type: 'number', description: 'Minimum' },
      { name: 'max', type: 'number', description: 'Maximum' },
      { name: 'step', type: 'number', description: 'Step' },
      {
        name: 'label',
        type: 'string',
        description: 'Old attribute; same as title',
      },
    ],
    example: '<NumberInput name="top_n" title="Top N" defaultValue={10} />',
  },
  {
    name: 'Checkbox',
    category: 'inputs',
    description: 'On/off filter; value is true or false',
    props: [
      NAME,
      TITLE,
      { name: 'label', type: 'string', description: 'Text next to the box' },
      DEFAULT_VALUE,
    ],
    example: '<Checkbox name="only_active" title="Only active customers" />',
  },
  {
    name: 'Slider',
    category: 'inputs',
    description: 'Numeric slider',
    props: [
      NAME,
      TITLE,
      { name: 'min', type: 'number', description: 'Minimum (default 0)' },
      { name: 'max', type: 'number', description: 'Maximum (default 100)' },
      { name: 'step', type: 'number', description: 'Step (default 1)' },
      DEFAULT_VALUE,
      { name: 'fmt', type: 'fmt', description: 'Format for the shown value' },
    ],
    example:
      '<Slider name="min_orders" title="Minimum orders" min={0} max={50} defaultValue={5} />',
  },

  // ── Layout ──────────────────────────────────────────────────────────────
  {
    name: 'Grid',
    category: 'layout',
    description: 'Places its children side by side in equal columns',
    props: [
      {
        name: 'cols',
        type: 'number',
        description: 'Number of columns (default 2)',
        aliases: ['columns'],
      },
      {
        name: 'gapSize',
        type: 'enum',
        values: ['none', 'sm', 'md', 'lg'],
        description: 'Space between items',
        aliases: ['spacing'],
      },
    ],
    children: 'markdown',
    example:
      '<Grid cols={2}>\n  <BarChart data={a} x="x" y="y" />\n  <LineChart data={b} x="x" y="y" />\n</Grid>',
  },
  {
    name: 'Tabs',
    category: 'layout',
    description: 'Tabbed sections',
    props: [
      {
        name: 'defaultTab',
        type: 'string',
        description: 'Label of the tab open at start',
      },
    ],
    children: ['Tab'],
    example:
      '<Tabs>\n  <Tab label="Revenue">...</Tab>\n  <Tab label="Orders">...</Tab>\n</Tabs>',
  },
  {
    name: 'Tab',
    category: 'layout',
    parent: ['Tabs'],
    description: 'One tab of Tabs',
    props: [
      {
        name: 'label',
        type: 'string',
        description: 'Tab label',
        required: true,
        aliases: ['title'],
      },
    ],
    children: 'markdown',
    example: '<Tab label="Revenue">...</Tab>',
  },
  {
    name: 'Accordion',
    category: 'layout',
    description: 'Collapsible sections (AccordionItem children)',
    props: [
      {
        name: 'single',
        type: 'boolean',
        description: 'Only one item open at a time',
      },
      {
        name: 'title',
        type: 'string',
        description:
          'Old attribute: the whole accordion is one item with this title',
      },
      {
        name: 'defaultExpanded',
        type: 'boolean',
        description: 'Old attribute: open at start',
      },
    ],
    children: 'markdown',
    example:
      '<Accordion>\n  <AccordionItem title="Method">...</AccordionItem>\n</Accordion>',
  },
  {
    name: 'AccordionItem',
    category: 'layout',
    parent: ['Accordion'],
    description: 'One collapsible section',
    props: [
      {
        name: 'title',
        type: 'string',
        description: 'Section title',
        required: true,
      },
    ],
    children: 'markdown',
    example: '<AccordionItem title="Method">...</AccordionItem>',
  },
  {
    name: 'Alert',
    category: 'layout',
    description: 'Colored callout',
    props: [
      {
        name: 'status',
        type: 'enum',
        values: ['info', 'positive', 'warning', 'negative', 'success', 'error'],
        description: 'Color of the callout',
        aliases: ['severity'],
      },
      { name: 'title', type: 'string', description: 'Bold first line' },
    ],
    children: 'markdown',
    example:
      '<Alert status="warning">Data after the 25th is preliminary.</Alert>',
  },
  {
    name: 'Details',
    category: 'layout',
    description: 'Collapsible block of text',
    props: [
      {
        name: 'title',
        type: 'string',
        description: 'Summary line (default "Details")',
      },
      { name: 'open', type: 'boolean', description: 'Open at start' },
    ],
    children: 'markdown',
    example:
      '<Details title="How is churn defined?">A customer with no order in 90 days.</Details>',
  },
  {
    name: 'Box',
    category: 'layout',
    extra: true,
    description: 'Container with padding and background (dbt-studio addition)',
    props: [
      { name: 'width', type: 'string', description: 'Width' },
      { name: 'height', type: 'string', description: 'Height' },
      { name: 'bgcolor', type: 'color', description: 'Background color' },
      { name: 'p', type: 'number', description: 'Padding (theme units)' },
      { name: 'm', type: 'number', description: 'Margin (theme units)' },
    ],
    children: 'markdown',
    example: '<Box p={2}>Content</Box>',
  },
  {
    name: 'Stack',
    category: 'layout',
    extra: true,
    description: 'Lays children in a row or column (dbt-studio addition)',
    props: [
      {
        name: 'direction',
        type: 'enum',
        values: ['row', 'column'],
        description: 'Direction (default column)',
      },
      {
        name: 'spacing',
        type: 'number',
        description: 'Space between children',
      },
    ],
    children: 'markdown',
    example: '<Stack direction="row" spacing={2}>...</Stack>',
  },
];

// DonutChart shares PieChart's attributes.
const pie = COMPONENT_SPECS.find((s) => s.name === 'PieChart')!;
COMPONENT_SPECS.find((s) => s.name === 'DonutChart')!.props = pie.props;

const BY_NAME = new Map<string, ComponentSpec>();
COMPONENT_SPECS.forEach((spec) => {
  BY_NAME.set(spec.name, spec);
  spec.aliases?.forEach((alias) => BY_NAME.set(alias, spec));
});

/** Spec for a tag name or alias. */
export function getComponentSpec(tag: string): ComponentSpec | undefined {
  return BY_NAME.get(tag);
}

/** Canonical component name for a tag or alias. */
export function canonicalComponentName(tag: string): string | undefined {
  return BY_NAME.get(tag)?.name;
}

/** Props implied by using an alias (HorizontalBarChart → swapXY). */
export function aliasDefaults(tag: string): Record<string, unknown> {
  const spec = BY_NAME.get(tag);
  return spec?.aliasDefaults?.[tag] ?? {};
}

const PROP_LOOKUP = new Map<string, Map<string, string>>();

/** Map an attribute name or alias to its canonical name for a component. */
export function canonicalPropName(
  tag: string,
  prop: string,
): string | undefined {
  const spec = BY_NAME.get(tag);
  if (!spec) return undefined;
  let lookup = PROP_LOOKUP.get(spec.name);
  if (!lookup) {
    lookup = new Map();
    spec.props.forEach((p) => {
      lookup!.set(p.name, p.name);
      p.aliases?.forEach((a) => lookup!.set(a, p.name));
    });
    PROP_LOOKUP.set(spec.name, lookup);
  }
  return lookup.get(prop);
}

/** Hint for an old attribute that is accepted but has no effect. */
export function retiredPropHint(tag: string, prop: string): string | undefined {
  return BY_NAME.get(tag)?.retired?.[prop];
}

export function allComponentNames(includeAliases = false): string[] {
  return includeAliases
    ? Array.from(BY_NAME.keys())
    : COMPONENT_SPECS.map((s) => s.name);
}
