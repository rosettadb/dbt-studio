import React, { useMemo } from 'react';
import { Box, Typography, CircularProgress } from '@mui/material';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  Legend,
  ResponsiveContainer,
  PieChart as RechartsPieChart,
  Pie,
  Cell,
} from 'recharts';
import { ChartRenderer } from '../queryResult/queryVisualization/ChartRenderer';
import { transformSqlResultToChartData } from '../../utils/chartDataTransformer';
import {
  parseComponentProps,
  getStringProp,
  getBooleanProp,
  getNumberProp,
} from '../../utils/analyticsComponentProps';
import { parseAnalyticsMarkdown } from '../../utils/analyticsMarkdown';
import type { ParsedProps } from '../../utils/analyticsComponentProps';
import {
  getComponentDefinition,
  validateComponentProps,
} from './registry/analyticsComponentRegistry';
import { SqlBadge } from './AnalyticsPreview';
import { AnalyticsAlert } from './components/ui/Alert';
import { AnalyticsAccordion } from './components/ui/Accordion';
import { AnalyticsTabs, AnalyticsTab } from './components/ui/Tabs';
import { AnalyticsGrid } from './components/ui/Grid';
import { AnalyticsStack } from './components/ui/Stack';
import { AnalyticsBox } from './components/ui/Box';
import { AnalyticsButtonGroup } from './components/inputs/ButtonGroup';
import { AnalyticsSelect } from './components/inputs/Select';
import { AnalyticsDateRange } from './components/inputs/DateRange';
import { AnalyticsCheckbox } from './components/inputs/Checkbox';
import { AnalyticsNumberInput } from './components/inputs/NumberInput';
import { AnalyticsTextInput } from './components/inputs/TextInput';

type Row = Record<string, unknown>;

interface RendererProps {
  tag: string;
  rawProps: string;
  content?: string;
  queryCache: Record<string, Row[]>;
  queryStatuses: Record<string, 'idle' | 'running' | 'success' | 'error'>;
  /** Passed down so nested SQL badges inside containers can trigger execution */
  onRunQuery?: (queryName: string, sql: string) => void;
}

interface ChartSubProps {
  data: Row[];
  chartProps: ParsedProps;
}

const CHART_COLORS = [
  '#0088FE',
  '#00C49F',
  '#FFBB28',
  '#FF8042',
  '#8884d8',
  '#82ca9d',
  '#FF6384',
  '#36A2EB',
];

function detectColumns(
  data: Row[],
  propsX?: string,
  propsY?: string,
): { xCol: string; yCols: string[] } {
  if (data.length === 0) return { xCol: '', yCols: [] };
  const keys = Object.keys(data[0]);
  const xCol = propsX || keys[0] || '';
  if (propsY) {
    return {
      xCol,
      yCols: propsY
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean),
    };
  }
  const numericCols = keys.filter(
    (k) => k !== xCol && typeof data[0][k] === 'number',
  );
  return { xCol, yCols: numericCols.length > 0 ? numericCols : keys.slice(1) };
}

/** Safely coerce SQL result values (string numerics, bigint) to number. Returns null if not convertible. */
function toNumber(v: unknown): number | null {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v === 'bigint') {
    if (
      v <= BigInt(Number.MAX_SAFE_INTEGER) &&
      v >= BigInt(Number.MIN_SAFE_INTEGER)
    ) {
      return Number(v);
    }
    return null;
  }
  if (typeof v === 'string' && v.trim() !== '') {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function formatAnalyticsValue(raw: unknown, fmt?: string): string {
  if (raw === null || raw === undefined) return '—';
  // Coerce string/bigint SQL numerics before formatting
  const coerced = toNumber(raw);
  if (coerced === null) return String(raw);
  const num = coerced;
  switch (fmt) {
    case 'usd':
    case '$':
      return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD',
        maximumFractionDigits: 0,
      }).format(num);
    case 'eur':
    case '€':
      return new Intl.NumberFormat('de-DE', {
        style: 'currency',
        currency: 'EUR',
        maximumFractionDigits: 0,
      }).format(num);
    case 'gbp':
    case '£':
      return new Intl.NumberFormat('en-GB', {
        style: 'currency',
        currency: 'GBP',
        maximumFractionDigits: 0,
      }).format(num);
    case 'pct':
    case '%':
      return `${(num * 100).toFixed(1)}%`;
    case 'k':
      return num >= 1000 ? `${(num / 1000).toFixed(1)}k` : String(num);
    case 'M':
      return num >= 1_000_000
        ? `${(num / 1_000_000).toFixed(1)}M`
        : String(num);
    case 'num':
      return new Intl.NumberFormat('en-US', {
        maximumFractionDigits: 2,
      }).format(num);
    case 'id':
      return String(num);
    default:
      return new Intl.NumberFormat('en-US', {
        maximumFractionDigits: 2,
      }).format(num);
  }
}

const ChartTitle: React.FC<{ title?: string }> = ({ title }) =>
  title ? (
    <Typography variant="subtitle1" fontWeight={600} sx={{ mb: 1 }}>
      {title}
    </Typography>
  ) : null;

// ─── BarChart ─────────────────────────────────────────────────────────────────
const AnalyticsBarChart: React.FC<ChartSubProps> = ({ data, chartProps }) => {
  const { xCol, yCols } = detectColumns(
    data,
    getStringProp(chartProps, 'x'),
    getStringProp(chartProps, 'y'),
  );
  const chartData = useMemo(
    () => transformSqlResultToChartData(data, xCol, yCols),
    [data, xCol, yCols],
  );
  return (
    <Box sx={{ mb: 3 }}>
      <ChartTitle title={getStringProp(chartProps, 'title')} />
      <ChartRenderer
        data={chartData}
        chartType="bar"
        xAxisCol={xCol}
        yAxisCols={yCols}
      />
    </Box>
  );
};

// ─── LineChart ────────────────────────────────────────────────────────────────
const AnalyticsLineChart: React.FC<ChartSubProps> = ({ data, chartProps }) => {
  const { xCol, yCols } = detectColumns(
    data,
    getStringProp(chartProps, 'x'),
    getStringProp(chartProps, 'y'),
  );
  const chartData = useMemo(
    () => transformSqlResultToChartData(data, xCol, yCols),
    [data, xCol, yCols],
  );
  return (
    <Box sx={{ mb: 3 }}>
      <ChartTitle title={getStringProp(chartProps, 'title')} />
      <ChartRenderer
        data={chartData}
        chartType="line"
        xAxisCol={xCol}
        yAxisCols={yCols}
      />
    </Box>
  );
};

// ─── AreaChart ────────────────────────────────────────────────────────────────
const AnalyticsAreaChart: React.FC<ChartSubProps> = ({ data, chartProps }) => {
  const { xCol, yCols } = detectColumns(
    data,
    getStringProp(chartProps, 'x'),
    getStringProp(chartProps, 'y'),
  );
  const chartData = useMemo(
    () => transformSqlResultToChartData(data, xCol, yCols),
    [data, xCol, yCols],
  );
  const isStacked = getBooleanProp(chartProps, 'stacked');
  return (
    <Box sx={{ mb: 3 }}>
      <ChartTitle title={getStringProp(chartProps, 'title')} />
      <Box sx={{ width: '100%', height: 300 }}>
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart
            data={chartData}
            margin={{ top: 10, right: 30, left: 0, bottom: 0 }}
          >
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey={xCol} tick={{ fontSize: 11 }} />
            <YAxis tick={{ fontSize: 11 }} />
            <RechartsTooltip />
            {yCols.length <= 10 && <Legend />}
            {yCols.map((col, i) => (
              <Area
                key={col}
                type="monotone"
                dataKey={col}
                stackId={isStacked ? 'stack' : undefined}
                stroke={CHART_COLORS[i % CHART_COLORS.length]}
                fill={CHART_COLORS[i % CHART_COLORS.length]}
                fillOpacity={0.3}
              />
            ))}
          </AreaChart>
        </ResponsiveContainer>
      </Box>
    </Box>
  );
};

// ─── PieChart ─────────────────────────────────────────────────────────────────
const AnalyticsPieChart: React.FC<ChartSubProps> = ({ data, chartProps }) => {
  const { xCol, yCols } = detectColumns(
    data,
    getStringProp(chartProps, 'x'),
    getStringProp(chartProps, 'y'),
  );
  const chartData = useMemo(
    () => transformSqlResultToChartData(data, xCol, yCols),
    [data, xCol, yCols],
  );
  return (
    <Box sx={{ mb: 3 }}>
      <ChartTitle title={getStringProp(chartProps, 'title')} />
      <ChartRenderer
        data={chartData}
        chartType="pie"
        xAxisCol={xCol}
        yAxisCols={yCols}
      />
    </Box>
  );
};

// ─── DonutChart ───────────────────────────────────────────────────────────────
const AnalyticsDonutChart: React.FC<ChartSubProps> = ({ data, chartProps }) => {
  const { xCol, yCols } = detectColumns(
    data,
    getStringProp(chartProps, 'x'),
    getStringProp(chartProps, 'y'),
  );
  const yCol = yCols[0] ?? '';
  const innerRadius = getNumberProp(chartProps, 'innerRadius', 50);
  // Run through the same SQL-coercion step as BarChart/LineChart/PieChart so
  // COUNT/SUM values that arrive as strings or bigint are converted to numbers.
  const chartData = useMemo(
    () => transformSqlResultToChartData(data, xCol, yCols),
    [data, xCol, yCols],
  );

  return (
    <Box sx={{ mb: 3 }}>
      <ChartTitle title={getStringProp(chartProps, 'title')} />
      <Box
        sx={{
          width: '100%',
          height: 300,
          display: 'flex',
          justifyContent: 'center',
        }}
      >
        <ResponsiveContainer width="100%" height="100%">
          <RechartsPieChart>
            <RechartsTooltip />
            <Legend />
            <Pie
              data={chartData}
              dataKey={yCol}
              nameKey={xCol}
              cx="50%"
              cy="50%"
              innerRadius={innerRadius}
              outerRadius={120}
              paddingAngle={2}
              label
            >
              {data.map((_, i) => (
                <Cell
                  key={`cell-${i}`}
                  fill={CHART_COLORS[i % CHART_COLORS.length]}
                />
              ))}
            </Pie>
          </RechartsPieChart>
        </ResponsiveContainer>
      </Box>
    </Box>
  );
};

// ─── ScatterChart ─────────────────────────────────────────────────────────────
const AnalyticsScatterChart: React.FC<ChartSubProps> = ({
  data,
  chartProps,
}) => {
  const { xCol, yCols } = detectColumns(
    data,
    getStringProp(chartProps, 'x'),
    getStringProp(chartProps, 'y'),
  );
  const chartData = useMemo(
    () => transformSqlResultToChartData(data, xCol, yCols),
    [data, xCol, yCols],
  );
  return (
    <Box sx={{ mb: 3 }}>
      <ChartTitle title={getStringProp(chartProps, 'title')} />
      <ChartRenderer
        data={chartData}
        chartType="scatter"
        xAxisCol={xCol}
        yAxisCols={yCols}
      />
    </Box>
  );
};

function formatCellValue(val: unknown): React.ReactNode {
  if (val === null || val === undefined) {
    return <span style={{ color: '#999', fontStyle: 'italic' }}>NULL</span>;
  }
  if (typeof val === 'object') return JSON.stringify(val);
  return String(val);
}

// ─── DataTable ────────────────────────────────────────────────────────────────
const AnalyticsDataTable: React.FC<ChartSubProps> = ({ data, chartProps }) => {
  if (data.length === 0) {
    return (
      <Typography
        variant="caption"
        color="text.secondary"
        sx={{ my: 1, display: 'block' }}
      >
        No data available
      </Typography>
    );
  }

  const limit = getNumberProp(chartProps, 'rows', 100);
  const displayRows = data.slice(0, limit);
  const cols = Object.keys(data[0]);

  return (
    <Box
      sx={{
        mb: 3,
        overflowX: 'auto',
        border: '1px solid',
        borderColor: 'divider',
        borderRadius: 1,
      }}
    >
      {chartProps.title && (
        <ChartTitle title={getStringProp(chartProps, 'title')} />
      )}
      <table
        style={{
          width: '100%',
          borderCollapse: 'collapse',
          fontSize: '0.8rem',
        }}
      >
        <thead>
          <tr>
            {cols.map((col) => (
              <th
                key={col}
                style={{
                  textAlign: 'left',
                  padding: '8px 12px',
                  fontWeight: 600,
                  whiteSpace: 'nowrap',
                  borderBottom: '1px solid rgba(0,0,0,0.12)',
                }}
              >
                {col}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {displayRows.map((row, i) => (
            <tr key={i}>
              {cols.map((col) => {
                const val = row[col];
                return (
                  <td
                    key={col}
                    style={{
                      padding: '6px 12px',
                      borderBottom: '1px solid rgba(0,0,0,0.06)',
                    }}
                  >
                    {formatCellValue(val)}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      {data.length > displayRows.length && (
        <Typography
          variant="caption"
          color="text.secondary"
          sx={{ px: 1.5, py: 0.5, display: 'block' }}
        >
          Showing {displayRows.length} of {data.length} rows
        </Typography>
      )}
    </Box>
  );
};

// ─── Delta ────────────────────────────────────────────────────────────────────
const AnalyticsDelta: React.FC<ChartSubProps> = ({ data, chartProps }) => {
  if (data.length === 0) {
    return (
      <Typography variant="caption" color="text.secondary">
        No data
      </Typography>
    );
  }

  const valCol = getStringProp(chartProps, 'value') || Object.keys(data[0])[0];
  const comparisonCol =
    getStringProp(chartProps, 'comparison') ||
    (data.length > 1 ? Object.keys(data[0])[1] : valCol);
  const currentVal = data[0][valCol];
  const prevVal = data.length > 1 ? data[1][comparisonCol] : undefined;
  const fmt = getStringProp(chartProps, 'fmt');
  const redNeg = getBooleanProp(chartProps, 'redNegatives');
  const isMax = getBooleanProp(chartProps, 'isMax');
  const isMin = getBooleanProp(chartProps, 'isMin');

  // Coerce SQL strings/bigints to numbers before any math
  const currentNum = toNumber(currentVal);
  const prevNum = prevVal !== undefined ? toNumber(prevVal) : null;

  const currentDisplay = formatAnalyticsValue(currentVal, fmt);
  const delta =
    currentNum !== null && prevNum !== null && prevNum !== 0
      ? ((currentNum - prevNum) / Math.abs(prevNum)) * 100
      : null;
  const absDelta =
    currentNum !== null && prevNum !== null ? currentNum - prevNum : null;

  let isGood = true;
  if (delta !== null) {
    if (isMax) isGood = delta > 0;
    else if (isMin) isGood = delta < 0;
    else isGood = delta >= 0;
  }

  const effectiveColor = (() => {
    if (delta === null) return undefined;
    if (redNeg) return delta < 0 ? 'error.main' : 'success.main';
    return isGood ? 'success.main' : 'error.main';
  })();

  return (
    <Box
      sx={{
        mb: 2,
        p: 2,
        border: '1px solid',
        borderColor: 'divider',
        borderRadius: 1,
        display: 'inline-block',
        minWidth: 160,
      }}
    >
      {getStringProp(chartProps, 'title') && (
        <Typography
          variant="caption"
          color="text.secondary"
          display="block"
          gutterBottom
        >
          {getStringProp(chartProps, 'title')}
        </Typography>
      )}
      <Typography variant="h4" fontWeight={700}>
        {currentDisplay}
      </Typography>
      {delta !== null && (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mt: 0.5 }}>
          {absDelta !== null && (
            <Typography
              variant="body2"
              color={effectiveColor ?? 'text.secondary'}
              fontWeight={500}
            >
              {absDelta >= 0 ? '▲' : '▼'}{' '}
              {formatAnalyticsValue(Math.abs(absDelta), fmt)}
            </Typography>
          )}
          <Typography
            variant="body2"
            color={effectiveColor ?? 'text.secondary'}
            fontWeight={500}
          >
            ({delta >= 0 ? '+' : ''}
            {delta.toFixed(1)}%)
          </Typography>
        </Box>
      )}
    </Box>
  );
};

// ─── BigValue / Value ─────────────────────────────────────────────────────────
const AnalyticsBigValue: React.FC<ChartSubProps> = ({ data, chartProps }) => {
  const valCol =
    getStringProp(chartProps, 'value') ||
    (data.length > 0 ? Object.keys(data[0])[0] : '');
  const rawValue = data.length > 0 ? data[0][valCol] : undefined;
  const fmt = getStringProp(chartProps, 'fmt');
  const displayValue =
    rawValue !== undefined ? formatAnalyticsValue(rawValue, fmt) : '—';
  const label =
    getStringProp(chartProps, 'label') || getStringProp(chartProps, 'title');
  const redNeg = getBooleanProp(chartProps, 'redNegatives');
  const comparison = getStringProp(chartProps, 'comparison');

  // Coerce to number for sign check and delta math
  const rawNum = rawValue !== undefined ? toNumber(rawValue) : null;
  const isNegative = rawNum !== null && rawNum < 0;
  const valueColor = redNeg && isNegative ? 'error.main' : undefined;

  // Delta from 2nd row
  const comparisonRow = data.length > 1 ? data[1] : null;
  const prevValue = comparisonRow && valCol ? comparisonRow[valCol] : undefined;
  const prevNum = prevValue !== undefined ? toNumber(prevValue) : null;
  const delta =
    rawNum !== null && prevNum !== null && prevNum !== 0
      ? ((rawNum - prevNum) / Math.abs(prevNum)) * 100
      : null;

  return (
    <Box
      sx={{
        mb: 2,
        p: 2.5,
        border: '1px solid',
        borderColor: 'divider',
        borderRadius: 2,
        display: 'inline-flex',
        flexDirection: 'column',
        gap: 0.5,
        minWidth: 160,
        mr: 2,
        bgcolor: 'background.paper',
        boxShadow: 1,
      }}
    >
      {label && (
        <Typography
          variant="caption"
          color="text.secondary"
          display="block"
          fontWeight={500}
        >
          {label}
        </Typography>
      )}
      <Typography
        variant="h4"
        fontWeight={700}
        lineHeight={1.2}
        color={valueColor}
      >
        {displayValue}
      </Typography>
      {delta !== null && (
        <Typography
          variant="body2"
          sx={{
            color: delta >= 0 ? 'success.main' : 'error.main',
            fontWeight: 500,
          }}
        >
          {delta >= 0 ? '▲' : '▼'} {Math.abs(delta).toFixed(1)}%
        </Typography>
      )}
      {comparison && !delta && (
        <Typography variant="body2" color="text.secondary">
          {comparison}
        </Typography>
      )}
    </Box>
  );
};

// ─── Placeholder ──────────────────────────────────────────────────────────────
const AwaitingQueryPlaceholder: React.FC<{ queryName: string }> = ({
  queryName,
}) => (
  <Box
    sx={{
      my: 2,
      p: 2,
      border: '1px dashed',
      borderColor: 'divider',
      borderRadius: 1,
      color: 'text.secondary',
    }}
  >
    <Typography variant="caption">
      Waiting for query &ldquo;{queryName}&rdquo; — click ▷ to run
    </Typography>
  </Box>
);

const LoadingPlaceholder: React.FC<{ queryName: string }> = ({ queryName }) => (
  <Box
    sx={{
      display: 'flex',
      alignItems: 'center',
      gap: 1,
      my: 2,
      color: 'text.secondary',
    }}
  >
    <CircularProgress size={16} />
    <Typography variant="caption">Running {queryName}…</Typography>
  </Box>
);

const NotImplementedPlaceholder: React.FC<{ tag: string }> = ({ tag }) => (
  <Box
    sx={{
      p: 1.5,
      my: 1,
      border: '1px dashed',
      borderColor: 'warning.main',
      borderRadius: 1,
      bgcolor: 'warning.soft',
    }}
  >
    <Typography variant="caption" color="warning.main">
      &lt;{tag}&gt; — Component not yet implemented
    </Typography>
  </Box>
);

const ComponentError: React.FC<{ message: string }> = ({ message }) => (
  <Box
    sx={{
      p: 1,
      my: 1,
      border: '1px dashed',
      borderColor: 'warning.main',
      borderRadius: 1,
    }}
  >
    <Typography variant="caption" color="warning.main">
      {message}
    </Typography>
  </Box>
);

// ─── Main Dispatcher ──────────────────────────────────────────────────────────
export function AnalyticsComponentRenderer({
  tag,
  rawProps,
  content,
  queryCache,
  queryStatuses,
  onRunQuery,
}: RendererProps): React.ReactElement {
  const parsedProps = useMemo(() => parseComponentProps(rawProps), [rawProps]);
  const def = getComponentDefinition(tag);
  if (!def) {
    return <ComponentError message={`Unknown component: <${tag} />`} />;
  }

  const validation = validateComponentProps(tag, parsedProps);
  if (!validation.success) {
    return <ComponentError message={validation.error} />;
  }

  const dataKey = getStringProp(parsedProps, 'data');
  const data = dataKey ? (queryCache[dataKey] ?? []) : [];
  const status = dataKey ? (queryStatuses[dataKey] ?? 'idle') : 'idle';

  if (status === 'running') {
    return <LoadingPlaceholder queryName={dataKey} />;
  }
  if (dataKey && !queryCache[dataKey] && status === 'idle') {
    return <AwaitingQueryPlaceholder queryName={dataKey} />;
  }

  if (def?.notImplemented) {
    return <NotImplementedPlaceholder tag={tag} />;
  }

  const subProps: ChartSubProps = { data, chartProps: parsedProps };
  const renderNestedContent = (nestedContent?: string): React.ReactNode => {
    if (!nestedContent?.trim()) return null;
    const blocks = parseAnalyticsMarkdown(nestedContent);
    return blocks.map((block, index) => {
      if (block.type === 'text') {
        return (
          <Typography
            key={`${block.lineStart}-${index}`}
            variant="body2"
            sx={{ whiteSpace: 'pre-wrap', mb: 1 }}
          >
            {block.markdown}
          </Typography>
        );
      }
      if (block.type === 'component') {
        return (
          <AnalyticsComponentRenderer
            key={`${block.tag}-${block.lineStart}-${index}`}
            tag={block.tag}
            rawProps={block.rawProps}
            content={block.content}
            queryCache={queryCache}
            queryStatuses={queryStatuses}
            onRunQuery={onRunQuery}
          />
        );
      }
      if (block.type === 'sql') {
        const rowCount = queryCache[block.name]?.length;
        return (
          <SqlBadge
            key={`${block.name}-${index}`}
            block={block}
            status={queryStatuses[block.name] ?? 'idle'}
            rowCount={rowCount}
            onRun={onRunQuery ?? (() => {})}
          />
        );
      }
      return null;
    });
  };
  const children = renderNestedContent(content);

  switch (tag) {
    case 'BarChart':
      return (
        <AnalyticsBarChart
          data={subProps.data}
          chartProps={subProps.chartProps}
        />
      );
    case 'LineChart':
      return (
        <AnalyticsLineChart
          data={subProps.data}
          chartProps={subProps.chartProps}
        />
      );
    case 'AreaChart':
      return (
        <AnalyticsAreaChart
          data={subProps.data}
          chartProps={subProps.chartProps}
        />
      );
    case 'PieChart':
      return (
        <AnalyticsPieChart
          data={subProps.data}
          chartProps={subProps.chartProps}
        />
      );
    case 'DonutChart':
      return (
        <AnalyticsDonutChart
          data={subProps.data}
          chartProps={subProps.chartProps}
        />
      );
    case 'ScatterChart':
      return (
        <AnalyticsScatterChart
          data={subProps.data}
          chartProps={subProps.chartProps}
        />
      );
    case 'DataTable':
      return (
        <AnalyticsDataTable
          data={subProps.data}
          chartProps={subProps.chartProps}
        />
      );
    case 'BigValue':
    case 'Value':
      return (
        <AnalyticsBigValue
          data={subProps.data}
          chartProps={subProps.chartProps}
        />
      );
    case 'Delta':
      return (
        <AnalyticsDelta data={subProps.data} chartProps={subProps.chartProps} />
      );
    // ── UI Components ────────────────────────────────────────────────
    case 'Alert':
      return (
        <AnalyticsAlert chartProps={parsedProps}>{children}</AnalyticsAlert>
      );
    case 'Accordion':
      return (
        <AnalyticsAccordion chartProps={parsedProps}>
          {children}
        </AnalyticsAccordion>
      );
    case 'Tabs':
      return <AnalyticsTabs chartProps={parsedProps}>{children}</AnalyticsTabs>;
    case 'Tab':
      return <AnalyticsTab chartProps={parsedProps}>{children}</AnalyticsTab>;
    case 'Grid':
      return <AnalyticsGrid chartProps={parsedProps}>{children}</AnalyticsGrid>;
    case 'Stack':
      return (
        <AnalyticsStack chartProps={parsedProps}>{children}</AnalyticsStack>
      );
    case 'Box':
      return <AnalyticsBox chartProps={parsedProps}>{children}</AnalyticsBox>;
    // ── Input Components ─────────────────────────────────────────────
    case 'ButtonGroup':
      return <AnalyticsButtonGroup chartProps={parsedProps} data={data} />;
    case 'Select':
      return <AnalyticsSelect chartProps={parsedProps} data={data} />;
    case 'DateRange':
      return <AnalyticsDateRange chartProps={parsedProps} />;
    case 'Checkbox':
      return <AnalyticsCheckbox chartProps={parsedProps} />;
    case 'NumberInput':
      return <AnalyticsNumberInput chartProps={parsedProps} />;
    case 'TextInput':
      return <AnalyticsTextInput chartProps={parsedProps} />;
    default:
      // Check registry for a not-implemented component
      if (def) {
        return <NotImplementedPlaceholder tag={tag} />;
      }
      return <ComponentError message={`Unknown component: <${tag} />`} />;
  }
}
