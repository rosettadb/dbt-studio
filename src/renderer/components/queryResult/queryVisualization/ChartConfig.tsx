import React from 'react';
import {
  Box,
  FormControl,
  MenuItem,
  Select,
  SelectChangeEvent,
  Typography,
} from '@mui/material';

export type ChartType = 'bar' | 'line' | 'scatter' | 'pie';

export interface ChartConfigProps {
  chartType: ChartType;
  xAxisCol: string;
  yAxisCol: string;
  availableColumns: string[];
  onChartTypeChange: (type: ChartType) => void;
  onXAxisChange: (col: string) => void;
  onYAxisChange: (col: string) => void;
}

export const ChartConfig: React.FC<ChartConfigProps> = ({
  chartType,
  xAxisCol,
  yAxisCol,
  availableColumns,
  onChartTypeChange,
  onXAxisChange,
  onYAxisChange,
}) => {
  const handleChartTypeChange = (event: SelectChangeEvent<string>) => {
    onChartTypeChange(event.target.value as ChartType);
  };

  const handleXAxisChange = (event: SelectChangeEvent<string>) => {
    onXAxisChange(event.target.value);
  };

  const handleYAxisChange = (event: SelectChangeEvent<string>) => {
    onYAxisChange(event.target.value);
  };

  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        gap: 2,
        alignItems: 'stretch',
        padding: 2,
        borderLeft: 1,
        borderColor: 'divider',
        backgroundColor: 'background.paper',
        width: 220,
        flexShrink: 0,
      }}
    >
      <Typography variant="subtitle2" sx={{ fontWeight: 'bold', mb: 1 }}>
        Chart Configuration
      </Typography>

      <FormControl size="small" fullWidth>
        <Typography variant="caption" color="text.secondary" sx={{ mb: 0.5 }}>
          Chart Type
        </Typography>
        <Select
          id="chart-type-select"
          value={chartType}
          onChange={handleChartTypeChange}
          sx={{ height: 28, fontSize: '0.875rem' }}
        >
          <MenuItem value="bar">Bar Chart</MenuItem>
          <MenuItem value="line">Line Chart</MenuItem>
          <MenuItem value="scatter">Scatter Plot</MenuItem>
          <MenuItem value="pie">Pie Chart</MenuItem>
        </Select>
      </FormControl>

      <FormControl size="small" fullWidth>
        <Typography variant="caption" color="text.secondary" sx={{ mb: 0.5 }}>
          X-Axis (Category)
        </Typography>
        <Select
          id="x-axis-select"
          value={xAxisCol}
          onChange={handleXAxisChange}
          sx={{ height: 28, fontSize: '0.875rem' }}
        >
          {availableColumns.map((col) => (
            <MenuItem key={col} value={col}>
              {col}
            </MenuItem>
          ))}
        </Select>
      </FormControl>

      <FormControl size="small" fullWidth>
        <Typography variant="caption" color="text.secondary" sx={{ mb: 0.5 }}>
          Y-Axis (Value)
        </Typography>
        <Select
          id="y-axis-select"
          value={yAxisCol}
          onChange={handleYAxisChange}
          sx={{ height: 28, fontSize: '0.875rem' }}
        >
          {availableColumns.map((col) => (
            <MenuItem key={col} value={col}>
              {col}
            </MenuItem>
          ))}
        </Select>
      </FormControl>
    </Box>
  );
};
