import React from 'react';
import { Box, Typography, Tooltip, IconButton } from '@mui/material';
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import ErrorIcon from '@mui/icons-material/Error';
import WarningIcon from '@mui/icons-material/Warning';
import InfoIcon from '@mui/icons-material/Info';
import {
  DbtRunHistoryEntry,
  DbtRunHistoryResult,
} from '../../../types/dbtRunHistory';
import { buildResultFailurePrompt } from './dbtRunHistoryPromptBuilders';

interface Props {
  entry: DbtRunHistoryEntry;
  result: DbtRunHistoryResult;
  onExplainFailure?: (prompt: string) => void;
}

const getStatusIcon = (status: string) => {
  switch (status) {
    case 'success':
    case 'pass':
      return <CheckCircleIcon color="success" fontSize="small" />;
    case 'error':
    case 'fail':
    case 'runtime error':
      return <ErrorIcon color="error" fontSize="small" />;
    case 'warn':
      return <WarningIcon color="warning" fontSize="small" />;
    default:
      return <InfoIcon color="disabled" fontSize="small" />;
  }
};

export const DbtRunHistoryResultRow: React.FC<Props> = ({
  entry,
  result,
  onExplainFailure,
}) => {
  const isFailedOrWarn = ['error', 'fail', 'warn', 'runtime error'].includes(
    result.status,
  );

  return (
    <Box
      sx={{
        display: 'flex',
        alignItems: 'center',
        padding: '4px 8px 4px 32px',
        borderBottom: '1px solid',
        borderColor: 'divider',
        backgroundColor: 'action.hover',
        '&:hover': {
          backgroundColor: 'action.selected',
        },
      }}
    >
      <Box sx={{ mr: 1, display: 'flex', alignItems: 'center' }}>
        {getStatusIcon(result.status)}
      </Box>

      <Typography
        variant="body2"
        sx={{ flexGrow: 1, fontWeight: 500, minWidth: 200 }}
      >
        {result.name}
      </Typography>

      {result.resourceType && (
        <Typography variant="caption" color="textSecondary" sx={{ width: 100 }}>
          {result.resourceType}
        </Typography>
      )}

      {result.executionTime !== undefined && (
        <Typography
          variant="caption"
          color="textSecondary"
          sx={{ width: 80, textAlign: 'right' }}
        >
          {result.executionTime.toFixed(2)}s
        </Typography>
      )}

      {result.message && (
        <Tooltip title={result.message} arrow>
          <Typography
            variant="caption"
            sx={{
              width: 150,
              ml: 2,
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              color: isFailedOrWarn ? 'error.main' : 'textSecondary',
            }}
          >
            {result.message}
          </Typography>
        </Tooltip>
      )}

      <Box sx={{ width: 40, display: 'flex', justifyContent: 'flex-end' }}>
        {isFailedOrWarn && onExplainFailure && (
          <Tooltip title="Explain failure with AI">
            <IconButton
              size="small"
              onClick={(e) => {
                e.stopPropagation();
                onExplainFailure(buildResultFailurePrompt(entry, result));
              }}
            >
              <AutoAwesomeIcon color="primary" fontSize="small" />
            </IconButton>
          </Tooltip>
        )}
      </Box>
    </Box>
  );
};
