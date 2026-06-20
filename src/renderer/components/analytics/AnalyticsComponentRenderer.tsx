/**
 * AnalyticsComponentRenderer
 *
 * Dispatches Evidence-style component tags to their React implementations.
 * Receives the raw props string from the markdown parser and the query cache,
 * then renders the appropriate chart, table, or KPI component.
 *
 * Supported tags:
 *   BarChart, LineChart, AreaChart, PieChart, ScatterChart, DataTable, BigValue, Value
 */
import React, { useMemo } from 'react';
import { Box, Typography, CircularProgress } from '@mui/material';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import { ChartRenderer } from '../queryResult/queryVisualization/ChartRenderer';
import { transformSqlResultToChartData } from '../../utils/chartDataTransformer';
import { parseComponentProps } from '../../utils/analyticsMarkdown';

// ─── Types ────────────────────────────────────────────────────────────────────
type Row = Record<string, unknown>;

interface RendererProps {
  tag: string;
  rawProps: string;
  queryCache: Record<string, Row[]>;
  queryStatuses: Record<string, 'idle' | 'running' | 'success' | 'error'>;
}

interface ChartSubProps {
  data: Row[];
  chartProps: Record<string, string>;
}

// ─── Color palette (matches Evidence defaults) ─────────────────────────────────
const CHART_COLORS = [
  '#0088FE',
  '#00C49F',
  '#FFBB28',
  '#FF8042',
  '#8884d8',
  '#82ca9d',
];

// ─── Column Auto-Detection ────────────────────────────────────────────────────
/**
 * If the author specifies x/y props, use them.
 * Otherwise auto-detect: first column = X, remaining numeric columns = Y.
 * Supports comma-separated y columns: y="amount,revenue"
 */
function detectColumns(
  data: Row[],
  propsX?: string,
  propsY?: string,
): { xCol: string; yCols: string[] } {
  if (data.length === 0) return { xCol: '', yCols: [] };

  const keys = Object.keys(data[0]);
  const xCol = propsX || keys[0] || '';

  if (propsY) {
    const yCols = propsY
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    return { xCol, yCols };
  }

  const numericCols = keys.filter(
    (k) => k !== xCol && typeof data[0][k] === 'number',
  );
  return { xCol, yCols: numericCols.length > 0 ? numericCols : keys.slice(1) };
}

// ─── Chart Wrapper ────────────────────────────────────────────────────────────
const ChartTitle: React.FC<{ title?: string }> = ({ title }) =>
  title ? (
    <Typography variant="subtitle1" fontWeight={600} sx={{ mb: 1 }}>
      {title}
    </Typography>
  ) : null;

// ─── BarChart ─────────────────────────────────────────────────────────────────
const AnalyticsBarChart: React.FC<ChartSubProps> = ({ data, chartProps }) => {
  const { xCol, yCols } = detectColumns(data, chartProps.x, chartProps.y);
  const chartData = useMemo(
    () => transformSqlResultToChartData(data, xCol, yCols),
    [data, xCol, yCols],
  );
  return (
    <Box sx={{ mb: 3 }}>
      <ChartTitle title={chartProps.title} />
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
  const { xCol, yCols } = detectColumns(data, chartProps.x, chartProps.y);
  const chartData = useMemo(
    () => transformSqlResultToChartData(data, xCol, yCols),
    [data, xCol, yCols],
  );
  return (
    <Box sx={{ mb: 3 }}>
      <ChartTitle title={chartProps.title} />
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
  const { xCol, yCols } = detectColumns(data, chartProps.x, chartProps.y);
  const chartData = useMemo(
    () => transformSqlResultToChartData(data, xCol, yCols),
    [data, xCol, yCols],
  );
  const isStacked = chartProps.stacked === 'true';

  return (
    <Box sx={{ mb: 3 }}>
      <ChartTitle title={chartProps.title} />
      <Box sx={{ width: '100%', height: 300 }}>
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart
            data={chartData}
            margin={{ top: 10, right: 30, left: 0, bottom: 0 }}
          >
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey={xCol} tick={{ fontSize: 11 }} />
            <YAxis tick={{ fontSize: 11 }} />
            <Tooltip />
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
  const { xCol, yCols } = detectColumns(data, chartProps.x, chartProps.y);
  const chartData = useMemo(
    () => transformSqlResultToChartData(data, xCol, yCols),
    [data, xCol, yCols],
  );
  return (
    <Box sx={{ mb: 3 }}>
      <ChartTitle title={chartProps.title} />
      <ChartRenderer
        data={chartData}
        chartType="pie"
        xAxisCol={xCol}
        yAxisCols={yCols}
      />
    </Box>
  );
};

// ─── ScatterChart ─────────────────────────────────────────────────────────────
const AnalyticsScatterChart: React.FC<ChartSubProps> = ({
  data,
  chartProps,
}) => {
  const { xCol, yCols } = detectColumns(data, chartProps.x, chartProps.y);
  const chartData = useMemo(
    () => transformSqlResultToChartData(data, xCol, yCols),
    [data, xCol, yCols],
  );
  return (
    <Box sx={{ mb: 3 }}>
      <ChartTitle title={chartProps.title} />
      <ChartRenderer
        data={chartData}
        chartType="scatter"
        xAxisCol={xCol}
        yAxisCols={yCols}
      />
    </Box>
  );
};

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

  const displayRows = chartProps.rows
    ? data.slice(0, Number(chartProps.rows))
    : data.slice(0, 100);
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
      {chartProps.title && <ChartTitle title={chartProps.title} />}
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
            // eslint-disable-next-line react/no-array-index-key
            <tr key={i}>
              {cols.map((col) => (
                <td
                  key={col}
                  style={{
                    padding: '6px 12px',
                    borderBottom: '1px solid rgba(0,0,0,0.06)',
                  }}
                >
                  {String(row[col] ?? '')}
                </td>
              ))}
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

function formatAnalyticsValue(raw: unknown, fmt?: string): string {
  if (typeof raw !== 'number') return String(raw ?? '—');

  switch (fmt) {
    case 'usd':
    case '$':
      return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD',
        maximumFractionDigits: 0,
      }).format(raw);
    case 'eur':
    case '€':
      return new Intl.NumberFormat('de-DE', {
        style: 'currency',
        currency: 'EUR',
        maximumFractionDigits: 0,
      }).format(raw);
    case 'pct':
    case '%':
      return `${(raw * 100).toFixed(1)}%`;
    case 'k':
      return raw >= 1000 ? `${(raw / 1000).toFixed(1)}k` : String(raw);
    case 'M':
      return raw >= 1_000_000
        ? `${(raw / 1_000_000).toFixed(1)}M`
        : String(raw);
    default:
      return new Intl.NumberFormat('en-US', {
        maximumFractionDigits: 2,
      }).format(raw);
  }
}

// ─── BigValue / Value KPI ─────────────────────────────────────────────────────
const AnalyticsBigValue: React.FC<ChartSubProps> = ({ data, chartProps }) => {
  const valCol =
    chartProps.value || (data.length > 0 ? Object.keys(data[0])[0] : '');
  const rawValue = data.length > 0 ? data[0][valCol] : undefined;
  const displayValue =
    rawValue !== undefined
      ? formatAnalyticsValue(rawValue, chartProps.fmt)
      : '—';

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
      {chartProps.label && (
        <Typography
          variant="caption"
          color="text.secondary"
          display="block"
          gutterBottom
        >
          {chartProps.label}
        </Typography>
      )}
      <Typography variant="h4" fontWeight={700}>
        {displayValue}
      </Typography>
      {chartProps.comparison && (
        <Typography variant="body2" color="text.secondary">
          {chartProps.comparison}
        </Typography>
      )}
    </Box>
  );
};

// ─── Awaiting Query Placeholder ───────────────────────────────────────────────
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

// ─── Loading Placeholder ──────────────────────────────────────────────────────
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

// ─── Main Dispatcher ──────────────────────────────────────────────────────────
export const AnalyticsComponentRenderer: React.FC<RendererProps> = ({
  tag,
  rawProps,
  queryCache,
  queryStatuses,
}) => {
  const parsedProps = useMemo(() => parseComponentProps(rawProps), [rawProps]);
  const dataKey = parsedProps.data ?? '';
  const data = dataKey ? (queryCache[dataKey] ?? []) : [];
  const status = dataKey ? (queryStatuses[dataKey] ?? 'idle') : 'idle';

  if (status === 'running') {
    return <LoadingPlaceholder queryName={dataKey} />;
  }

  if (dataKey && !queryCache[dataKey] && status === 'idle') {
    return <AwaitingQueryPlaceholder queryName={dataKey} />;
  }

  switch (tag) {
    case 'BarChart':
      return <AnalyticsBarChart data={data} chartProps={parsedProps} />;
    case 'LineChart':
      return <AnalyticsLineChart data={data} chartProps={parsedProps} />;
    case 'AreaChart':
      return <AnalyticsAreaChart data={data} chartProps={parsedProps} />;
    case 'PieChart':
    case 'DonutChart':
      return <AnalyticsPieChart data={data} chartProps={parsedProps} />;
    case 'ScatterChart':
      return <AnalyticsScatterChart data={data} chartProps={parsedProps} />;
    case 'DataTable':
      return <AnalyticsDataTable data={data} chartProps={parsedProps} />;
    case 'BigValue':
    case 'Value':
      return <AnalyticsBigValue data={data} chartProps={parsedProps} />;
    default:
      return (
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
            Unknown component: &lt;{tag} /&gt;
          </Typography>
        </Box>
      );
  }
};
