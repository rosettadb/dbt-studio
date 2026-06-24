import React from 'react';
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  ScatterChart,
  Scatter,
  PieChart,
  Pie,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  Cell,
} from 'recharts';
import { Box, Typography, useTheme } from '@mui/material';
import { ChartType } from './ChartConfig';

export interface ChartRendererProps {
  data: any[];
  chartType: ChartType;
  xAxisCol: string;
  yAxisCols: string[];
}

/**
 * Formats a value for display in the Recharts tooltip.
 * Converts Date objects to locale strings to avoid React rendering errors.
 */
const formatTooltipValue = (value: any) => {
  if (value instanceof Date) {
    return value.toLocaleString();
  }
  if (typeof value === 'object' && value !== null) {
    return JSON.stringify(value);
  }
  return value;
};

const COLORS = [
  '#0088FE',
  '#00C49F',
  '#FFBB28',
  '#FF8042',
  '#8884d8',
  '#82ca9d',
  '#ffc658',
  '#a4de6c',
  '#d0ed57',
  '#83a6ed',
];

// Suppress legend when there are more than this many items to avoid clutter
const MAX_LEGEND_ITEMS = 10;

const EmptyState: React.FC<{ message: string; isError?: boolean }> = ({
  message,
  isError,
}) => (
  <Box
    sx={{
      width: '100%',
      height: '100%',
      display: 'flex',
      flexDirection: 'column',
      justifyContent: 'center',
      alignItems: 'center',
      p: 4,
      textAlign: 'center',
    }}
  >
    <Typography
      color={isError ? 'error' : 'text.secondary'}
      variant="body1"
      sx={{ maxWidth: 400, fontWeight: isError ? 500 : 400 }}
    >
      {message}
    </Typography>
  </Box>
);

const PIE_COLORS = [
  '#4f83cc',
  '#4caf50',
  '#ff9800',
  '#e53935',
  '#9c27b0',
  '#00acc1',
  '#ff5722',
  '#8bc34a',
  '#ff4081',
  '#607d8b',
];

const formatPieLabelText = (value: any, maxLength = 18) => {
  const text = formatTooltipValue(value);
  const stringValue = String(text);
  if (stringValue.length <= maxLength) {
    return stringValue;
  }
  return `${stringValue.slice(0, maxLength - 1)}…`;
};

const renderPieLabel = ({
  name,
  percent,
}: {
  name?: any;
  percent?: number;
}) => {
  const percentage =
    typeof percent === 'number' ? ` ${(percent * 100).toFixed(0)}%` : '';
  return `${formatPieLabelText(name)}${percentage}`;
};

export const ChartRenderer: React.FC<ChartRendererProps> = ({
  data,
  chartType,
  xAxisCol,
  yAxisCols,
}) => {
  const theme = useTheme();
  // Force a remeasure whenever key chart config changes.
  // ResponsiveContainer reads its parent size on mount; changing this key
  // unmounts/remounts the container so it picks up the current size.
  const containerKey = `${chartType}-${xAxisCol}-${yAxisCols.join(',')}`;

  if (!data || data.length === 0) {
    return <EmptyState message="No data available for visualization." />;
  }

  if (!xAxisCol || !yAxisCols || yAxisCols.length === 0) {
    return (
      <EmptyState message="Please select X and Y axes to render the chart." />
    );
  }

  // Validate pie data early — must be outside ResponsiveContainer to avoid zero-size wrapper
  let validPieData: any[] | null = null;
  if (chartType === 'pie') {
    const primaryYAxisCol = yAxisCols[0];
    validPieData = data.filter(
      (d) =>
        typeof d[primaryYAxisCol] === 'number' &&
        !Number.isNaN(d[primaryYAxisCol]) &&
        d[primaryYAxisCol] >= 0,
    );
    if (validPieData.length === 0) {
      return (
        <EmptyState
          isError
          message="Pie chart requires numeric values for the Y-Axis. Please select a column with numbers."
        />
      );
    }
  }

  const renderChart = () => {
    switch (chartType) {
      case 'bar': {
        const showLegend = yAxisCols.length <= MAX_LEGEND_ITEMS;
        return (
          <BarChart
            data={data}
            margin={{ top: 20, right: 30, left: 20, bottom: 5 }}
          >
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey={xAxisCol} tick={{ fontSize: 11 }} />
            <YAxis tick={{ fontSize: 11 }} />
            <Tooltip formatter={formatTooltipValue} />
            {showLegend && <Legend />}
            {yAxisCols.map((col, index) => (
              <Bar
                key={col}
                dataKey={col}
                fill={COLORS[index % COLORS.length]}
              />
            ))}
          </BarChart>
        );
      }
      case 'line': {
        const showLegend = yAxisCols.length <= MAX_LEGEND_ITEMS;
        return (
          <LineChart
            data={data}
            margin={{ top: 20, right: 30, left: 20, bottom: 5 }}
          >
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey={xAxisCol} tick={{ fontSize: 11 }} />
            <YAxis tick={{ fontSize: 11 }} />
            <Tooltip formatter={formatTooltipValue} />
            {showLegend && <Legend />}
            {yAxisCols.map((col, index) => (
              <Line
                key={col}
                type="monotone"
                dataKey={col}
                stroke={COLORS[index % COLORS.length]}
                activeDot={{ r: 8 }}
              />
            ))}
          </LineChart>
        );
      }
      case 'scatter': {
        const showLegend = yAxisCols.length <= MAX_LEGEND_ITEMS;
        return (
          <ScatterChart margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis
              type="category"
              dataKey={xAxisCol}
              name={xAxisCol}
              tick={{ fontSize: 11 }}
            />
            <YAxis type="number" tick={{ fontSize: 11 }} />
            <Tooltip
              cursor={{ strokeDasharray: '3 3' }}
              formatter={formatTooltipValue}
            />
            {showLegend && <Legend />}
            {yAxisCols.map((col, index) => (
              <Scatter
                key={col}
                name={col}
                dataKey={col}
                data={data}
                fill={COLORS[index % COLORS.length]}
              />
            ))}
          </ScatterChart>
        );
      }
      case 'pie': {
        const primaryYAxisCol = yAxisCols[0];
        const sliceStroke = theme.palette.mode === 'dark' ? '#1e1e1e' : '#fff';

        return (
          <PieChart margin={{ top: 40, right: 40, left: 40, bottom: 40 }}>
            <Pie
              data={validPieData!}
              dataKey={primaryYAxisCol}
              nameKey={xAxisCol}
              cx="50%"
              cy="50%"
              outerRadius={130}
              stroke={sliceStroke}
              strokeWidth={2}
              label={renderPieLabel}
            >
              {validPieData!.map((entry, index) => (
                <Cell
                  key={`cell-${index}`}
                  fill={PIE_COLORS[index % PIE_COLORS.length]}
                />
              ))}
            </Pie>
            <Tooltip formatter={formatTooltipValue} />
            {validPieData!.length <= MAX_LEGEND_ITEMS && <Legend />}
          </PieChart>
        );
      }
      default:
        return <Typography>Unsupported chart type</Typography>;
    }
  };

  return (
    <Box
      key={containerKey}
      sx={{
        width: '100%',
        height: '100%',
        p: 2,
      }}
    >
      <ResponsiveContainer width="100%" height="100%">
        {renderChart()}
      </ResponsiveContainer>
    </Box>
  );
};
