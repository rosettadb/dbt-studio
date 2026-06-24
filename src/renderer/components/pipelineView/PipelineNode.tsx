import React, { memo } from 'react';
import { Handle, Position, NodeProps } from 'reactflow';
import {
  Box,
  Typography,
  Chip,
  Paper,
  useTheme,
  Tooltip,
  CircularProgress,
} from '@mui/material';
import type { Theme } from '@mui/material';
import {
  FolderOpen,
  Terminal,
  Link as LinkIcon,
  Edit,
  CheckCircle,
  Cancel,
  Schedule,
  SkipNext,
  Block,
  HourglassEmpty,
} from '@mui/icons-material';
import type { PipelineStep } from './types';
import type { CloudStepStatus } from '../../../types/cloudAction';

export type PipelineNodeData = PipelineStep & {
  stepIndex: number;
  isCleanup?: boolean;
  jobName?: string;
  jobType?: string;
  editMode?: boolean;
  onEditClick?: () => void;
};

const CLEANUP_COLOR = '#9E9E9E'; // neutral gray for cleanup jobs

type StatusVisual = {
  label: string;
  color: string;
  icon: React.ReactNode;
  spin?: boolean;
};

function getStatusVisual(
  status: CloudStepStatus,
  palette: Theme['palette'],
): StatusVisual {
  switch (status) {
    case 'running':
      return {
        label: 'Running',
        color: palette.info.main,
        icon: (
          <CircularProgress
            size={10}
            thickness={6}
            sx={{ color: palette.info.main }}
          />
        ),
      };
    case 'success':
      return {
        label: 'Success',
        color: palette.success.main,
        icon: <CheckCircle sx={{ fontSize: 12 }} />,
      };
    case 'failed':
      return {
        label: 'Failed',
        color: palette.error.main,
        icon: <Cancel sx={{ fontSize: 12 }} />,
      };
    case 'pending':
      return {
        label: 'Pending',
        color: palette.text.secondary,
        icon: <Schedule sx={{ fontSize: 12 }} />,
      };
    case 'not_started':
      return {
        label: 'Not Started',
        color: palette.warning.main,
        icon: <HourglassEmpty sx={{ fontSize: 12 }} />,
      };
    case 'skipped':
      return {
        label: 'Skipped',
        color: palette.text.disabled,
        icon: <SkipNext sx={{ fontSize: 12 }} />,
      };
    case 'cancelled':
      return {
        label: 'Cancelled',
        color: palette.warning.dark,
        icon: <Block sx={{ fontSize: 12 }} />,
      };
    default:
      return {
        label: status,
        color: palette.text.secondary,
        icon: <Schedule sx={{ fontSize: 12 }} />,
      };
  }
}

function formatDuration(seconds: number | null | undefined): string {
  if (!seconds || seconds <= 0) return '';
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return `${m}m ${s}s`;
}

function getPluginLabel(plugin: string): string {
  return plugin.split('@')[0];
}

export const PipelineNode = memo(
  ({ data, selected }: NodeProps<PipelineNodeData>) => {
    const theme = useTheme();
    const statusVisual = data.status
      ? getStatusVisual(data.status, theme.palette)
      : null;

    // Border priority: selected > status color (only when run) > neutral divider.
    const borderColor = selected
      ? theme.palette.primary.main
      : (statusVisual?.color ?? theme.palette.divider);

    return (
      <Box sx={{ position: 'relative' }}>
        <Handle
          type="target"
          position={Position.Left}
          style={{ background: theme.palette.divider, width: 8, height: 8 }}
        />

        <Paper
          elevation={selected ? 4 : 0}
          sx={{
            width: 260,
            borderRadius: 2,
            border: `2px solid ${borderColor}`,
            backgroundColor: theme.palette.background.paper,
            overflow: 'hidden',
            transition: 'all 0.2s',
            cursor: data.editMode ? 'pointer' : 'default',
            boxShadow:
              data.status === 'running'
                ? `0 0 0 3px ${theme.palette.info.main}33`
                : undefined,
            '&:hover': {
              boxShadow: theme.shadows[4],
              '& .edit-hint': { opacity: 1 },
            },
          }}
        >
          {data.editMode && (
            <Box
              className="edit-hint"
              sx={{
                position: 'absolute',
                top: 6,
                right: 6,
                opacity: 0,
                transition: 'opacity 0.15s',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                bgcolor: 'background.paper',
                borderRadius: '50%',
                width: 20,
                height: 20,
                boxShadow: 1,
                zIndex: 1,
              }}
            >
              <Edit
                sx={{ fontSize: 12, color: 'text.secondary' }}
                onClick={(e) => {
                  e.stopPropagation();
                  data.onEditClick?.();
                }}
              />
            </Box>
          )}
          <Box sx={{ px: 1.5, pt: 1, pb: 1.25 }}>
            {/* Status row */}
            {statusVisual && (
              <Box
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  mb: 0.5,
                }}
              >
                <Chip
                  icon={
                    <Box
                      sx={{
                        display: 'flex',
                        alignItems: 'center',
                        ml: 0.5,
                        color: statusVisual.color,
                      }}
                    >
                      {statusVisual.icon}
                    </Box>
                  }
                  label={statusVisual.label}
                  size="small"
                  variant="outlined"
                  sx={{
                    height: 20,
                    fontSize: '0.6rem',
                    fontWeight: 600,
                    color: statusVisual.color,
                    borderColor: statusVisual.color,
                    '& .MuiChip-label': { px: 0.75 },
                  }}
                />
                {data.duration ? (
                  <Typography
                    variant="caption"
                    sx={{ color: 'text.disabled', fontSize: '0.6rem' }}
                  >
                    {formatDuration(data.duration)}
                  </Typography>
                ) : null}
              </Box>
            )}

            {/* Step name */}
            <Typography
              variant="subtitle2"
              noWrap
              title={data.error_message || data.name}
              sx={{
                fontWeight: 600,
                mb: 0.75,
                color: data.isCleanup ? CLEANUP_COLOR : 'text.primary',
              }}
            >
              {data.name}
            </Typography>

            {/* Plugin chip (neutral by default) */}
            <Box
              sx={{
                display: 'flex',
                alignItems: 'center',
                gap: 0.75,
                mb: 0.75,
              }}
            >
              <Chip
                label={getPluginLabel(data.plugin)}
                size="small"
                variant="outlined"
                sx={{
                  height: 18,
                  fontSize: '0.6rem',
                  fontWeight: 700,
                  letterSpacing: 0.3,
                  color: data.isCleanup ? CLEANUP_COLOR : 'text.secondary',
                  borderColor: 'divider',
                  '& .MuiChip-label': { px: 0.75 },
                }}
              />
              {data.plugin.includes('@') && (
                <Typography
                  variant="caption"
                  sx={{ color: 'text.disabled', fontSize: '0.6rem' }}
                >
                  {data.plugin.split('@')[1]}
                </Typography>
              )}
            </Box>

            {/* Command or URL */}
            {(() => {
              const isGitClone = data.plugin === 'git_clone@v1';
              const displayValue = isGitClone
                ? (data.url ?? '')
                : (data.command ?? '');
              return (
                <Tooltip title={displayValue} placement="bottom-start">
                  <Box
                    sx={{
                      display: 'flex',
                      alignItems: 'flex-start',
                      gap: 0.5,
                      mb: data.working_dir ? 0.5 : 0,
                    }}
                  >
                    {isGitClone ? (
                      <LinkIcon
                        sx={{
                          fontSize: 12,
                          color: 'text.disabled',
                          mt: '2px',
                          flexShrink: 0,
                        }}
                      />
                    ) : (
                      <Terminal
                        sx={{
                          fontSize: 12,
                          color: 'text.disabled',
                          mt: '2px',
                          flexShrink: 0,
                        }}
                      />
                    )}
                    <Typography
                      variant="caption"
                      sx={{
                        color: 'text.secondary',
                        fontFamily: 'monospace',
                        fontSize: '0.65rem',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                        maxWidth: 200,
                      }}
                    >
                      {displayValue || <span style={{ opacity: 0.4 }}>—</span>}
                    </Typography>
                  </Box>
                </Tooltip>
              );
            })()}

            {/* Working dir */}
            {data.working_dir && (
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                <FolderOpen
                  sx={{ fontSize: 12, color: 'text.disabled', flexShrink: 0 }}
                />
                <Typography
                  variant="caption"
                  sx={{
                    color: 'text.disabled',
                    fontFamily: 'monospace',
                    fontSize: '0.65rem',
                  }}
                >
                  {data.working_dir}
                </Typography>
              </Box>
            )}
          </Box>
        </Paper>

        <Handle
          type="source"
          position={Position.Right}
          style={{ background: theme.palette.divider, width: 8, height: 8 }}
        />
      </Box>
    );
  },
);
