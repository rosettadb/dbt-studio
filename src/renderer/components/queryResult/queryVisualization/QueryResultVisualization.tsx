import React, { useState, useEffect, useMemo } from 'react';
import { Box } from '@mui/material';
import { ChartConfig, ChartType } from './ChartConfig';
import { ChartRenderer } from './ChartRenderer';
import { transformSqlResultToChartData } from '../../../utils/chartDataTransformer';

export interface QueryResultVisualizationProps {
  data: any[];
  // Optionally, we could receive initial config from notebook metadata
  initialChartType?: ChartType;
  initialXAxisCol?: string;
  initialYAxisCol?: string;
  onConfigChange?: (config: {
    chartType: ChartType;
    xAxisCol: string;
    yAxisCol: string;
  }) => void;
}

export const QueryResultVisualization: React.FC<
  QueryResultVisualizationProps
> = ({
  data,
  initialChartType = 'bar',
  initialXAxisCol = '',
  initialYAxisCol = '',
  onConfigChange,
}) => {
  const [chartType, setChartType] = useState<ChartType>(initialChartType);
  const [xAxisCol, setXAxisCol] = useState<string>(initialXAxisCol);
  const [yAxisCol, setYAxisCol] = useState<string>(initialYAxisCol);
  const [availableColumns, setAvailableColumns] = useState<string[]>([]);

  // Extract columns dynamically from the first row of data
  useEffect(() => {
    if (data && data.length > 0) {
      const columns = Object.keys(data[0]);
      setAvailableColumns(columns);

      // Auto-select axes if not provided
      if (!xAxisCol && columns.length > 0) {
        setXAxisCol(columns[0]);
      }
      if (!yAxisCol && columns.length > 1) {
        setYAxisCol(columns[1]);
      } else if (!yAxisCol && columns.length === 1) {
        setYAxisCol(columns[0]);
      }
    }
  }, [data]);

  // Notify parent of config changes (useful for notebook cell persistence)
  useEffect(() => {
    if (onConfigChange) {
      onConfigChange({ chartType, xAxisCol, yAxisCol });
    }
  }, [chartType, xAxisCol, yAxisCol, onConfigChange]);

  // Transform the raw SQL data so Recharts can understand it
  const transformedData = useMemo(() => {
    return transformSqlResultToChartData(data, xAxisCol, yAxisCol);
  }, [data, xAxisCol, yAxisCol]);

  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'row',
        height: '100%',
        width: '100%',
      }}
    >
      <Box sx={{ flexGrow: 1, overflow: 'hidden' }}>
        <ChartRenderer
          data={transformedData}
          chartType={chartType}
          xAxisCol={xAxisCol}
          yAxisCol={yAxisCol}
        />
      </Box>
      <ChartConfig
        chartType={chartType}
        xAxisCol={xAxisCol}
        yAxisCol={yAxisCol}
        availableColumns={availableColumns}
        onChartTypeChange={setChartType}
        onXAxisChange={setXAxisCol}
        onYAxisChange={setYAxisCol}
      />
    </Box>
  );
};
