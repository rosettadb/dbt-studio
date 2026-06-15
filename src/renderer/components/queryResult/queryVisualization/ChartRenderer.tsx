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
];

export const ChartRenderer: React.FC<ChartRendererProps> = ({
  data,
  chartType,
  xAxisCol,
  yAxisCols,
}) => {
  if (!data || data.length === 0) {
    return (
      <Box sx={{ p: 3, display: 'flex', justifyContent: 'center' }}>
        <Typography color="text.secondary">
          No data available for visualization.
        </Typography>
      </Box>
    );
  }

  if (!xAxisCol || !yAxisCols || yAxisCols.length === 0) {
    return (
      <Box sx={{ p: 3, display: 'flex', justifyContent: 'center' }}>
        <Typography color="text.secondary">
          Please select X and Y axes to render the chart.
        </Typography>
      </Box>
    );
  }

  const renderChart = () => {
    switch (chartType) {
      case 'bar':
        return (
          <BarChart
            data={data}
            margin={{ top: 20, right: 30, left: 20, bottom: 5 }}
          >
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey={xAxisCol} />
            <YAxis />
            <Tooltip />
            <Legend />
            {yAxisCols.map((col, index) => (
              <Bar
                key={col}
                dataKey={col}
                fill={COLORS[index % COLORS.length]}
              />
            ))}
          </BarChart>
        );
      case 'line':
        return (
          <LineChart
            data={data}
            margin={{ top: 20, right: 30, left: 20, bottom: 5 }}
          >
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey={xAxisCol} />
            <YAxis />
            <Tooltip />
            <Legend />
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
      case 'scatter':
        return (
          <ScatterChart margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis type="category" dataKey={xAxisCol} name={xAxisCol} />
            <YAxis type="number" />
            <Tooltip cursor={{ strokeDasharray: '3 3' }} />
            <Legend />
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
      case 'pie': {
        const primaryYAxisCol = yAxisCols[0];
        // Recharts Pie crashes if the dataKey values are not numbers.
        // Filter out non-numeric or negative values.
        const validPieData = data.filter(
          (d) =>
            typeof d[primaryYAxisCol] === 'number' &&
            !Number.isNaN(d[primaryYAxisCol]) &&
            d[primaryYAxisCol] >= 0,
        );

        if (validPieData.length === 0) {
          return (
            <Box
              sx={{
                p: 3,
                display: 'flex',
                justifyContent: 'center',
                alignItems: 'center',
                height: '100%',
              }}
            >
              <Typography color="error">
                Pie chart requires numeric values for the Y-Axis. Please select
                a column with numbers.
              </Typography>
            </Box>
          );
        }

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
              label
            >
              {validPieData.map((entry, index) => (
                <Cell
                  key={`cell-${index}`}
                  fill={COLORS[index % COLORS.length]}
                />
              ))}
            </Pie>
            <Tooltip />
            <Legend />
          </PieChart>
        );
      }
      default:
        return <Typography>Unsupported chart type</Typography>;
    }
  };

  return (
    <Box sx={{ width: '100%', height: '100%', minHeight: 400, p: 2 }}>
      <ResponsiveContainer width="100%" height="100%">
        {renderChart()}
      </ResponsiveContainer>
    </Box>
  );
};
