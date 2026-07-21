import React, { useState } from 'react';
import { Box, Typography, IconButton, Tooltip, Collapse } from '@mui/material';
import KeyboardArrowDownIcon from '@mui/icons-material/KeyboardArrowDown';
import KeyboardArrowRightIcon from '@mui/icons-material/KeyboardArrowRight';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import ErrorIcon from '@mui/icons-material/Error';
import HourglassEmptyIcon from '@mui/icons-material/HourglassEmpty';
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';
import WarningIcon from '@mui/icons-material/Warning';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';

import { DbtRunHistoryEntry } from '../../../types/dbtRunHistory';
import { DbtRunHistoryResultRow } from './DbtRunHistoryResultRow';
import { buildRunFailurePrompt } from './dbtRunHistoryPromptBuilders';

interface Props {
  entry: DbtRunHistoryEntry;
  onFixWithAI?: (prompt: string) => void;
}

const getStatusIcon = (status: string) => {
  switch (status) {
    case 'success':
      return <CheckCircleIcon color="success" fontSize="small" />;
    case 'error':
      return <ErrorIcon color="error" fontSize="small" />;
    case 'warn':
      return <WarningIcon color="warning" fontSize="small" />;
    case 'running':
      return (
        <HourglassEmptyIcon
          color="action"
          fontSize="small"
          sx={{ animation: 'spin 2s linear infinite' }}
        />
      );
    default:
      return <CheckCircleIcon color="disabled" fontSize="small" />;
  }
};

export const DbtRunHistoryRunRow: React.FC<Props> = ({
  entry,
  onFixWithAI,
}) => {
  const [expanded, setExpanded] = useState(false);

  const hasResults = entry.results && entry.results.length > 0;
  const isFailed = entry.status === 'error';

  return (
    <>
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          padding: 1,
          borderBottom: '1px solid',
          borderColor: 'divider',
          backgroundColor: expanded ? 'action.selected' : 'transparent',
          '&:hover': {
            backgroundColor: 'action.hover',
          },
          cursor: hasResults ? 'pointer' : 'default',
        }}
        onClick={() => hasResults && setExpanded(!expanded)}
      >
        <Box sx={{ width: 24, display: 'flex', justifyContent: 'center' }}>
          {hasResults && (
            <IconButton size="small" disableRipple sx={{ p: 0 }}>
              {expanded ? (
                <KeyboardArrowDownIcon fontSize="small" />
              ) : (
                <KeyboardArrowRightIcon fontSize="small" />
              )}
            </IconButton>
          )}
        </Box>

        <Box sx={{ mr: 1, display: 'flex', alignItems: 'center' }}>
          {getStatusIcon(entry.status)}
        </Box>

        <Box sx={{ flexGrow: 1, overflow: 'hidden', mr: 2 }}>
          <Typography
            variant="body2"
            sx={{
              fontWeight: 600,
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              fontFamily: 'monospace',
            }}
            title={entry.fullCommand}
          >
            {entry.fullCommand}
          </Typography>
        </Box>

        {entry.summary && entry.summary.total > 0 && (
          <Typography
            variant="caption"
            color="textSecondary"
            sx={{ width: 120 }}
          >
            {entry.summary.success}/{entry.summary.total} passed
            {entry.summary.error > 0 && ` (${entry.summary.error} failed)`}
          </Typography>
        )}

        <Typography
          variant="caption"
          color="textSecondary"
          sx={{ width: 80, textAlign: 'right' }}
        >
          {entry.elapsedTime !== undefined
            ? `${entry.elapsedTime.toFixed(2)}s`
            : '-'}
        </Typography>

        <Typography
          variant="caption"
          color="textSecondary"
          sx={{ width: 140, textAlign: 'right', ml: 2 }}
        >
          {new Date(entry.startedAt).toLocaleString()}
        </Typography>

        <Box
          sx={{
            width: 80,
            display: 'flex',
            justifyContent: 'flex-end',
            gap: 0.5,
          }}
        >
          <Tooltip title="Copy Command">
            <IconButton
              size="small"
              onClick={(e) => {
                e.stopPropagation();
                navigator.clipboard.writeText(
                  entry.shellCommand || entry.fullCommand,
                );
              }}
            >
              <ContentCopyIcon fontSize="small" sx={{ fontSize: 14 }} />
            </IconButton>
          </Tooltip>
          {isFailed && onFixWithAI && (
            <Tooltip title="Fix with AI">
              <IconButton
                size="small"
                onClick={(e) => {
                  e.stopPropagation();
                  onFixWithAI(buildRunFailurePrompt(entry));
                }}
              >
                <AutoAwesomeIcon color="primary" sx={{ fontSize: 16 }} />
              </IconButton>
            </Tooltip>
          )}
        </Box>
      </Box>

      {hasResults && (
        <Collapse in={expanded} unmountOnExit>
          <Box sx={{ backgroundColor: 'background.default' }}>
            {entry.results!.map((result) => (
              <DbtRunHistoryResultRow
                key={result.id}
                entry={entry}
                result={result}
                onExplainFailure={onFixWithAI}
              />
            ))}
          </Box>
        </Collapse>
      )}
    </>
  );
};
