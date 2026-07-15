import React from 'react';
import {
  Box,
  Tooltip,
  Popover,
  Typography,
  LinearProgress,
  Divider,
} from '@mui/material';
import { useTheme } from '@mui/material/styles';

export interface ContextUsageBreakdown {
  conversation: number;
  userFiles: number;
  skills: number;
  mcpTools: number;
  secondBrain?: number;
  total: number;
  contextWindow: number;
  percentUsed: number;
}

interface ContextUsageRingProps {
  breakdown: ContextUsageBreakdown | null;
  size?: number;
}

const RING_SIZE = 20;
const STROKE_WIDTH = 2.5;
const AUTO_COMPACTION_THRESHOLD = 70;

function getColor(percent: number): string {
  if (percent >= 90) return '#f44336'; // red
  if (percent >= 70) return '#ff9800'; // orange
  if (percent >= 50) return '#2196f3'; // blue
  return '#4caf50'; // green
}

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}k`;
  return String(n);
}

export function formatContextPercentage(percent: number): string {
  if (!Number.isFinite(percent) || percent <= 0) return '0%';
  if (percent < 0.1) return '<0.1%';
  const rounded =
    percent < 10 ? Math.round(percent * 10) / 10 : Math.round(percent);
  return `${rounded}%`;
}

interface RowProps {
  label: string;
  tokens: number;
  total: number;
  color?: string;
}

const UsageRow: React.FC<RowProps> = ({ label, tokens, total, color }) => {
  const pct = total > 0 ? Math.min(100, (tokens / total) * 100) : 0;
  return (
    <Box sx={{ mb: 1.25 }}>
      <Box
        sx={{
          display: 'flex',
          justifyContent: 'space-between',
          mb: 0.4,
          alignItems: 'center',
        }}
      >
        <Typography
          variant="caption"
          sx={{ color: 'text.secondary', fontSize: '0.72rem' }}
        >
          {label}
        </Typography>
        <Typography
          variant="caption"
          sx={{ color: 'text.disabled', fontSize: '0.7rem', ml: 1 }}
        >
          {formatTokens(tokens)} ({formatContextPercentage(pct)})
        </Typography>
      </Box>
      <LinearProgress
        variant="determinate"
        value={pct}
        sx={{
          height: 3,
          borderRadius: 2,
          bgcolor: 'action.hover',
          '& .MuiLinearProgress-bar': {
            bgcolor: color || 'primary.main',
            borderRadius: 2,
          },
        }}
      />
    </Box>
  );
};

export const ContextUsageRing: React.FC<ContextUsageRingProps> = ({
  breakdown,
  size = RING_SIZE,
}) => {
  const theme = useTheme();
  const [anchorEl, setAnchorEl] = React.useState<HTMLElement | null>(null);
  const open = Boolean(anchorEl);

  // When no data yet, render a dim empty ring as a placeholder
  if (!breakdown) {
    const r = (size - STROKE_WIDTH) / 2;
    const circ = 2 * Math.PI * r;
    return (
      <Tooltip
        title="Context usage (no data yet)"
        placement="top"
        arrow
        enterDelay={300}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', opacity: 0.3 }}>
          <svg
            width={size}
            height={size}
            style={{ transform: 'rotate(-90deg)' }}
          >
            <circle
              cx={size / 2}
              cy={size / 2}
              r={r}
              fill="none"
              stroke={theme.palette.divider}
              strokeWidth={STROKE_WIDTH}
              strokeDasharray={`${circ} ${circ}`}
            />
          </svg>
        </Box>
      </Tooltip>
    );
  }

  const pct = Math.max(0, Math.min(100, breakdown.percentUsed));
  const ringColor = getColor(pct);

  const r = (size - STROKE_WIDTH) / 2;
  const circ = 2 * Math.PI * r;
  const dash = (pct / 100) * circ;
  const gap = circ - dash;

  const totalLabel = `${formatContextPercentage(pct)} context used`;

  return (
    <>
      <Tooltip title={totalLabel} placement="top" arrow enterDelay={300}>
        <Box
          onClick={(e) => setAnchorEl(e.currentTarget)}
          sx={{
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            borderRadius: '50%',
            width: size,
            height: size,
            '&:hover': { opacity: 0.8 },
          }}
        >
          <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
            {/* Track */}
            <circle
              cx={size / 2}
              cy={size / 2}
              r={r}
              fill="none"
              stroke={theme.palette.action.selected}
              strokeWidth={STROKE_WIDTH}
            />
            {/* Fill */}
            <circle
              cx={size / 2}
              cy={size / 2}
              r={r}
              fill="none"
              stroke={ringColor}
              strokeWidth={STROKE_WIDTH}
              strokeDasharray={`${dash} ${gap}`}
              strokeLinecap="round"
              transform={`rotate(-90 ${size / 2} ${size / 2})`}
            />
          </svg>
        </Box>
      </Tooltip>

      <Popover
        open={open}
        anchorEl={anchorEl}
        onClose={() => setAnchorEl(null)}
        anchorOrigin={{ vertical: 'top', horizontal: 'center' }}
        transformOrigin={{ vertical: 'bottom', horizontal: 'center' }}
        PaperProps={{
          sx: {
            p: 2,
            minWidth: 250,
            maxWidth: 300,
            borderRadius: 1.5,
            boxShadow: 4,
          },
        }}
      >
        <Typography
          variant="body2"
          sx={{ fontWeight: 600, mb: 0.25, fontSize: '0.8rem' }}
        >
          Context Window Usage
        </Typography>
        <Typography
          variant="caption"
          sx={{ color: 'text.disabled', fontSize: '0.7rem' }}
        >
          {formatTokens(breakdown.total)} /{' '}
          {formatTokens(breakdown.contextWindow)} tokens
        </Typography>

        <Divider sx={{ my: 1.25 }} />

        <UsageRow
          label="Conversation"
          tokens={breakdown.conversation}
          total={breakdown.contextWindow}
          color="#2196f3"
        />
        <UsageRow
          label="User files"
          tokens={breakdown.userFiles}
          total={breakdown.contextWindow}
          color="#9c27b0"
        />
        <UsageRow
          label="Skills"
          tokens={breakdown.skills}
          total={breakdown.contextWindow}
          color="#ff9800"
        />
        <UsageRow
          label="MCP tools"
          tokens={breakdown.mcpTools}
          total={breakdown.contextWindow}
          color="#4caf50"
        />
        <UsageRow
          label="Second Brain"
          tokens={breakdown.secondBrain ?? 0}
          total={breakdown.contextWindow}
          color="#00acc1"
        />

        <Divider sx={{ my: 1.25 }} />

        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <Box
            sx={{
              width: 8,
              height: 8,
              borderRadius: '50%',
              bgcolor: ringColor,
              flexShrink: 0,
            }}
          />
          <Typography
            variant="caption"
            sx={{
              fontSize: '0.72rem',
              color:
                pct >= AUTO_COMPACTION_THRESHOLD
                  ? 'error.main'
                  : 'text.secondary',
              fontWeight: pct >= AUTO_COMPACTION_THRESHOLD ? 600 : 400,
            }}
          >
            {pct >= AUTO_COMPACTION_THRESHOLD
              ? 'Auto-compaction threshold reached'
              : `${formatContextPercentage(
                  Math.max(0, AUTO_COMPACTION_THRESHOLD - pct),
                )} until auto-compaction`}
          </Typography>
        </Box>
      </Popover>
    </>
  );
};
