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
  initialYAxisCols?: string[];
  onConfigChange?: (config: {
    chartType: ChartType;
    xAxisCol: string;
    yAxisCols: string[];
  }) => void;
}

export const QueryResultVisualization: React.FC<
  QueryResultVisualizationProps
> = ({
  data,
  initialChartType = 'bar',
  initialXAxisCol = '',
  initialYAxisCols = [],
  onConfigChange,
}) => {
  const [chartType, setChartType] = useState<ChartType>(initialChartType);
  const [xAxisCol, setXAxisCol] = useState<string>(initialXAxisCol);
  const [yAxisCols, setYAxisCols] = useState<string[]>(initialYAxisCols);
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
      if (yAxisCols.length === 0 && columns.length > 1) {
        setYAxisCols([columns[1]]);
      } else if (yAxisCols.length === 0 && columns.length === 1) {
        setYAxisCols([columns[0]]);
      }
    }
  }, [data]);

  useEffect(() => {
    if (onConfigChange) {
      onConfigChange({ chartType, xAxisCol, yAxisCols });
    }
  }, [chartType, xAxisCol, yAxisCols, onConfigChange]);

  // Transform the raw SQL data so Recharts can understand it
  const transformedData = useMemo(() => {
    return transformSqlResultToChartData(data, xAxisCol, yAxisCols);
  }, [data, xAxisCol, yAxisCols]);

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
          yAxisCols={yAxisCols}
        />
      </Box>
      <ChartConfig
        chartType={chartType}
        xAxisCol={xAxisCol}
        yAxisCols={yAxisCols}
        availableColumns={availableColumns}
        onChartTypeChange={setChartType}
        onXAxisChange={setXAxisCol}
        onYAxisColsChange={setYAxisCols}
      />
    </Box>
  );
};
