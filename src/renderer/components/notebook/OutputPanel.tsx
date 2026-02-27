/**
 * Output Panel Component
 * Displays cell execution results using shared QueryResult component
 * Updated to reuse SQL Editor infrastructure (Phase 4)
 */

import React from 'react';
import { Box, Paper, Typography } from '@mui/material';
import {
  CheckCircle as SuccessIcon,
  Error as ErrorIcon,
} from '@mui/icons-material';
import { CellOutput } from '../../../types/notebooks';
import { QueryResult } from '../queryResult';
import { QueryResponseType } from '../../../types/backend';

interface OutputPanelProps {
  output: CellOutput;
  connectionId: string; // Added to support export context
}

export const OutputPanel: React.FC<OutputPanelProps> = ({
  output,
  connectionId,
}) => {
  // Error output
  if (output.type === 'error') {
    return (
      <Paper
        elevation={0}
        sx={{
          bgcolor: (theme) =>
            theme.palette.mode === 'dark' ? 'error.dark' : 'error.light',
          p: 1,
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 0.75 }}>
          <ErrorIcon color="error" sx={{ fontSize: 18 }} />
          <Box sx={{ flex: 1 }}>
            <Typography
              variant="subtitle2"
              color="error"
              gutterBottom
              sx={{ fontSize: 12, mb: 0.5 }}
            >
              Execution Error
            </Typography>
            <Typography
              variant="body2"
              component="pre"
              sx={{
                fontFamily: 'monospace',
                fontSize: 11,
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
                m: 0,
                lineHeight: 1.4,
              }}
            >
              {output.error}
            </Typography>
            <Typography
              variant="caption"
              color="text.secondary"
              sx={{ mt: 0.5, fontSize: 10 }}
            >
              Execution time: {output.executionTime}ms
            </Typography>
          </Box>
        </Box>
      </Paper>
    );
  }

  // Empty output
  if (output.type === 'empty' || !output.data || output.data.length === 0) {
    return (
      <Paper
        elevation={0}
        sx={{
          bgcolor: (theme) =>
            theme.palette.mode === 'dark' ? 'grey.800' : 'grey.100',
          p: 1,
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
          <SuccessIcon color="success" sx={{ fontSize: 18 }} />
          <Box>
            <Typography
              variant="body2"
              color="text.secondary"
              sx={{ fontSize: 12 }}
            >
              Query executed successfully (no results)
            </Typography>
            <Typography
              variant="caption"
              color="text.secondary"
              sx={{ fontSize: 10 }}
            >
              Execution time: {output.executionTime}ms
            </Typography>
          </Box>
        </Box>
      </Paper>
    );
  }

  // Table output - use shared QueryResult component
  // Convert CellOutput to QueryResponseType format
  const queryResponse: QueryResponseType = {
    success: true,
    data: output.data || [],
    fields: output.columns?.map((col) => ({ name: col, type: 'text' })) || [],
    rowCount: output.rowCount || output.data?.length || 0,
    duration: output.executionTime,
    isCommand: false,
  };

  // Determine connection type and export context
  const isDuckLake = connectionId.startsWith('ducklake-');
  const exportContext = isDuckLake
    ? {
        connectionType: 'ducklake' as const,
        duckLakeInstanceId: connectionId.replace('ducklake-', ''),
        originalSql: undefined, // SQL not available in output, export will be current page only
      }
    : {
        connectionType: 'duckdb' as const, // Default to duckdb for regular connections
        connectionId,
        originalSql: undefined,
      };

  return (
    <Box sx={{ width: '100%' }}>
      <QueryResult results={queryResponse} exportContext={exportContext} />
    </Box>
  );
};
