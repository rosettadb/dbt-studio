import React from 'react';
import {
  Box,
  CircularProgress,
  Tooltip,
  Typography,
  useTheme,
} from '@mui/material';
import type { QueryStatus } from '../../../../../shared/analyticsBi';

/** Clickable SQL status badge shown where a SQL block sits on the page. */
export const SqlBadge: React.FC<{
  block: { name: string; sql: string };
  status: QueryStatus;
  rowCount?: number;
  error?: string | null;
  duration?: number;
  onRun: (name: string, sql: string) => void;
}> = ({ block, status, rowCount, error, duration, onRun }) => {
  const theme = useTheme();

  const dot = (
    {
      idle: <span style={{ color: theme.palette.text.disabled }}>○</span>,
      running: <CircularProgress size={10} sx={{ mt: '1px' }} />,
      success: <span style={{ color: '#4caf50' }}>●</span>,
      error: <span style={{ color: '#f44336' }}>●</span>,
    } as Record<string, React.ReactNode>
  )[status];

  return (
    <Box
      onClick={() => onRun(block.name, block.sql)}
      sx={{
        display: 'flex',
        alignItems: 'center',
        gap: 1,
        px: 1.5,
        py: 0.5,
        my: 0.5,
        borderRadius: 1,
        bgcolor: 'action.hover',
        fontSize: '0.75rem',
        cursor: 'pointer',
        userSelect: 'none',
        '&:hover': { bgcolor: 'action.selected' },
      }}
    >
      {dot}
      <Typography variant="caption" sx={{ fontFamily: 'monospace', flex: 1 }}>
        {block.name}
        {status === 'success' &&
          rowCount !== undefined &&
          ` — ${rowCount} row${rowCount !== 1 ? 's' : ''}`}
        {status === 'success' && duration !== undefined && (
          <Typography
            component="span"
            variant="caption"
            color="text.disabled"
            sx={{ ml: 0.5 }}
          >
            {duration > 1000
              ? `${(duration / 1000).toFixed(2)}s`
              : `${Math.round(duration)}ms`}
          </Typography>
        )}
      </Typography>
      {status === 'error' && error && (
        <Typography
          variant="caption"
          color="error.main"
          sx={{ fontSize: '0.65rem' }}
          noWrap
        >
          {error}
        </Typography>
      )}
      {status === 'idle' && (
        <Typography
          variant="caption"
          color="text.disabled"
          sx={{ fontSize: '0.65rem' }}
        >
          click to run
        </Typography>
      )}
    </Box>
  );
};

export const AwaitingQuery: React.FC<{
  queryName: string;
  onRun?: () => void;
}> = ({ queryName, onRun }) => (
  <Box
    onClick={onRun}
    sx={{
      my: 2,
      p: 2,
      border: '1px dashed',
      borderColor: 'divider',
      borderRadius: 1,
      color: 'text.secondary',
      cursor: onRun ? 'pointer' : 'default',
    }}
  >
    <Typography variant="caption">
      Run the page (▷ in the toolbar) to load &ldquo;{queryName}&rdquo;
    </Typography>
  </Box>
);

export const LoadingQuery: React.FC<{
  queryName: string;
  inline?: boolean;
}> = ({ queryName, inline }) =>
  inline ? (
    <CircularProgress
      size={10}
      sx={{ mx: 0.5 }}
      aria-label={`Running ${queryName}`}
    />
  ) : (
    <Box
      sx={{
        display: 'flex',
        alignItems: 'center',
        gap: 1,
        my: 2,
        color: 'text.secondary',
      }}
    >
      <CircularProgress size={16} />
      <Typography variant="caption">Running {queryName}…</Typography>
    </Box>
  );

export const ComponentError: React.FC<{
  message: string;
  inline?: boolean;
}> = ({ message, inline }) =>
  inline ? (
    <Tooltip title={message}>
      <Typography
        component="span"
        variant="body2"
        color="warning.main"
        sx={{ borderBottom: '1px dashed', cursor: 'help' }}
      >
        ⚠
      </Typography>
    </Tooltip>
  ) : (
    <Box
      sx={{
        p: 1,
        my: 1,
        border: '1px dashed',
        borderColor: 'warning.main',
        borderRadius: 1,
      }}
    >
      <Typography
        variant="caption"
        color="warning.main"
        sx={{ whiteSpace: 'pre-wrap' }}
      >
        {message}
      </Typography>
    </Box>
  );

/** Small warning line listing attributes that are unknown or have no effect. */
export const PropWarnings: React.FC<{ messages: string[] }> = ({
  messages,
}) => {
  if (messages.length === 0) return null;
  return (
    <Tooltip
      title={
        <span style={{ whiteSpace: 'pre-wrap' }}>{messages.join('\n')}</span>
      }
    >
      <Typography
        variant="caption"
        color="warning.main"
        data-testid="bi-prop-warnings"
        sx={{
          display: 'inline-block',
          fontSize: '0.7rem',
          cursor: 'help',
          mb: 0.5,
        }}
      >
        ⚠{' '}
        {messages.length === 1
          ? messages[0]
          : `${messages.length} attribute warnings`}
      </Typography>
    </Tooltip>
  );
};
