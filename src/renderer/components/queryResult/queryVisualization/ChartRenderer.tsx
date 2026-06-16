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
import { Box, Typography } from '@mui/material';
import { ChartType } from './ChartConfig';

export interface ChartRendererProps {
  data: any[];
  chartType: ChartType;
  xAxisCol: string;
  yAxisCols: string[];
}

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
      minHeight: 300,
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
      sx={{ maxWidth: 400 }}
    >
      {message}
    </Typography>
  </Box>
);

export const ChartRenderer: React.FC<ChartRendererProps> = ({
  data,
  chartType,
  xAxisCol,
  yAxisCols,
}) => {
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
            <Tooltip />
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
            <Tooltip />
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
            <Tooltip cursor={{ strokeDasharray: '3 3' }} />
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
        // Recharts Pie crashes if the dataKey values are not numbers.
        const validPieData = data.filter(
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

        // Suppress the auto-labels and legend when there are too many slices
        const tooManySlices = validPieData.length > MAX_LEGEND_ITEMS;

        return (
          <PieChart>
            <Pie
              data={validPieData}
              dataKey={primaryYAxisCol}
              nameKey={xAxisCol}
              cx="50%"
              cy="50%"
              outerRadius={150}
              fill="#8884d8"
              // Only show inline labels when there are few enough slices
              label={!tooManySlices}
            >
              {validPieData.map((entry, index) => (
                <Cell
                  key={`cell-${index}`}
                  fill={COLORS[index % COLORS.length]}
                />
              ))}
            </Pie>
            <Tooltip />
            {!tooManySlices && <Legend />}
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
        // Use a fixed height so ResponsiveContainer always gets a measurable parent
        height: 420,
        p: 2,
        flexShrink: 0,
      }}
    >
      <ResponsiveContainer width="100%" height="100%">
        {renderChart()}
      </ResponsiveContainer>
    </Box>
  );
};
