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

const isNumericChartValue = (value: any) => {
  if (typeof value === 'number') {
    return Number.isFinite(value);
  }
  if (typeof value === 'bigint') {
    return Number.isSafeInteger(Number(value));
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed !== '' && !Number.isNaN(Number(trimmed));
  }
  return false;
};

const getNumericColumns = (data: any[], columns: string[]) =>
  columns.filter(
    (col) =>
      data.some((row) => row[col] !== null && row[col] !== undefined) &&
      data.every(
        (row) =>
          row[col] === null ||
          row[col] === undefined ||
          isNumericChartValue(row[col]),
      ),
  );

const getDefaultXAxisCol = (columns: string[], numericColumns: string[]) => {
  const categoricalColumns = columns.filter(
    (col) => !numericColumns.includes(col),
  );
  return categoricalColumns[0] || columns[0] || '';
};

const getDefaultYAxisCols = (columns: string[], numericColumns: string[]) => {
  if (numericColumns.length > 0) {
    return [numericColumns[0]];
  }
  if (columns.length > 1) {
    return [columns[1]];
  }
  if (columns.length === 1) {
    return [columns[0]];
  }
  return [];
};

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

  // Extract columns dynamically from the first row of data and revalidate axis selections
  useEffect(() => {
    if (data && data.length > 0) {
      const columns = Object.keys(data[0]);
      const numericColumns = getNumericColumns(data, columns);
      setAvailableColumns(columns);

      // Revalidate xAxisCol — reset if it no longer exists in the new schema
      setXAxisCol((prev) => {
        if (prev && columns.includes(prev)) return prev;
        return getDefaultXAxisCol(columns, numericColumns);
      });

      // Revalidate yAxisCols — remove any columns that no longer exist
      setYAxisCols((prev) => {
        const stillValid = prev.filter((col) => columns.includes(col));
        if (stillValid.length > 0) return stillValid;
        return getDefaultYAxisCols(columns, numericColumns);
      });
    }
  }, [data]);

  const handleChartTypeChange = (nextChartType: ChartType) => {
    setChartType(nextChartType);
    if (nextChartType === 'pie') {
      const numericColumns = getNumericColumns(data, availableColumns);
      setYAxisCols((prev) => {
        if (prev[0] && numericColumns.includes(prev[0])) {
          return [prev[0]];
        }
        return getDefaultYAxisCols(availableColumns, numericColumns);
      });
    }
  };

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
        onChartTypeChange={handleChartTypeChange}
        onXAxisChange={setXAxisCol}
        onYAxisColsChange={setYAxisCols}
      />
    </Box>
  );
};
