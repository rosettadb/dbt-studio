/**
 * Toolbar chip listing the page's SQL blocks with their status, row count,
 * duration and error. Replaces the status rows that used to sit inside the
 * dashboard where each SQL block is written.
 */
import React, { useMemo, useState } from 'react';
import {
  Box,
  Button,
  CircularProgress,
  IconButton,
  Menu,
  Tooltip,
  Typography,
} from '@mui/material';
import { PlayArrow, Storage } from '@mui/icons-material';
import { buildPageGraph, parsePage, QueryStatus } from '../engine';

export interface QueryStatusMenuProps {
  markdown: string;
  statuses: Record<string, QueryStatus>;
  errors: Record<string, string | null>;
  durations: Record<string, number | undefined>;
  results: Record<string, unknown[]>;
  onRunQuery?: (queryName: string) => void;
}

const DOT: Record<QueryStatus, string> = {
  idle: '#9e9e9e',
  running: '#1976d2',
  success: '#4caf50',
  error: '#f44336',
};

function formatDuration(ms?: number): string {
  if (ms === undefined) return '';
  return ms > 1000 ? `${(ms / 1000).toFixed(2)}s` : `${Math.round(ms)}ms`;
}

export const QueryStatusMenu: React.FC<QueryStatusMenuProps> = ({
  markdown,
  statuses,
  errors,
  durations,
  results,
  onRunQuery,
}) => {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const names = useMemo(() => {
    try {
      const graph = buildPageGraph(parsePage(markdown).nodes);
      // With a dependency error the order is partial: list every block.
      return graph.errors.length
        ? Array.from(graph.queries.keys())
        : graph.order;
    } catch {
      return [];
    }
  }, [markdown]);

  if (names.length === 0) return null;

  const failed = names.filter((n) => statuses[n] === 'error').length;
  const running = names.some((n) => statuses[n] === 'running');
  let summary = `${names.length} ${names.length === 1 ? 'query' : 'queries'}`;
  if (failed) summary = `${failed} of ${names.length} failed`;

  let icon: React.ReactNode = <Storage sx={{ fontSize: 14 }} />;
  if (running) icon = <CircularProgress size={12} />;

  return (
    <>
      <Tooltip title="Queries on this page">
        <Button
          size="small"
          variant="text"
          color={failed ? 'error' : 'inherit'}
          startIcon={icon}
          onClick={(e) => setAnchor(e.currentTarget)}
          sx={{
            textTransform: 'none',
            fontSize: '0.75rem',
            py: 0.25,
            color: failed ? undefined : 'text.secondary',
          }}
          data-testid="bi-query-status"
        >
          {summary}
        </Button>
      </Tooltip>
      <Menu
        anchorEl={anchor}
        open={Boolean(anchor)}
        onClose={() => setAnchor(null)}
        slotProps={{ paper: { sx: { width: 420, maxHeight: 420 } } }}
      >
        {names.map((name) => {
          const status = statuses[name] ?? 'idle';
          const rows = results[name]?.length;
          return (
            <Box
              key={name}
              sx={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: 1,
                px: 1.5,
                py: 0.75,
              }}
            >
              <Box
                sx={{
                  width: 8,
                  height: 8,
                  borderRadius: '50%',
                  bgcolor: DOT[status],
                  mt: 0.75,
                  flex: 'none',
                }}
              />
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Typography
                  variant="body2"
                  sx={{ fontFamily: 'monospace', fontSize: '0.8rem' }}
                >
                  {name}
                </Typography>
                <Typography
                  variant="caption"
                  color={status === 'error' ? 'error.main' : 'text.secondary'}
                  sx={{
                    display: 'block',
                    whiteSpace: 'pre-wrap',
                    wordBreak: 'break-word',
                  }}
                >
                  {status === 'error' && (errors[name] ?? 'Failed')}
                  {status === 'success' &&
                    `${rows ?? 0} row${rows === 1 ? '' : 's'} · ${formatDuration(durations[name])}`}
                  {status === 'running' && 'Running…'}
                  {status === 'idle' && 'Not run yet'}
                </Typography>
              </Box>
              {onRunQuery && (
                <Tooltip title={`Run ${name}`}>
                  <IconButton
                    size="small"
                    onClick={() => onRunQuery(name)}
                    aria-label={`Run ${name}`}
                  >
                    <PlayArrow sx={{ fontSize: 16 }} />
                  </IconButton>
                </Tooltip>
              )}
            </Box>
          );
        })}
      </Menu>
    </>
  );
};
