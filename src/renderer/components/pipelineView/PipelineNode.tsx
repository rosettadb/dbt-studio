import React, { memo } from 'react';
import { Handle, Position, NodeProps } from 'reactflow';
import {
  Box,
  Typography,
  Chip,
  Paper,
  useTheme,
  CircularProgress,
  alpha,
} from '@mui/material';
import type { Theme } from '@mui/material';
import {
  FolderOpen,
  Terminal,
  Link as LinkIcon,
  Edit,
  DeleteOutline,
  CheckCircle,
  Cancel,
  Schedule,
  SkipNext,
  Block,
  HourglassEmpty,
} from '@mui/icons-material';
import type { PipelineStep } from './types';
import type { CloudStepStatus } from '../../../types/cloudAction';
import { PLUGIN_MAP } from './pluginDefinitions';

export type PipelineNodeData = PipelineStep & {
  stepIndex: number;
  isCleanup?: boolean;
  jobName?: string;
  jobType?: string;
  editMode?: boolean;
  onEditClick?: () => void;
  onDeleteClick?: () => void;
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
    const isDark = theme.palette.mode === 'dark';
    const statusVisual = data.status
      ? getStatusVisual(data.status, theme.palette)
      : null;

    const pluginDef = PLUGIN_MAP.get(data.plugin);
    const pluginColor = data.isCleanup
      ? CLEANUP_COLOR
      : (pluginDef?.color ?? theme.palette.primary.main);
    const PluginIcon = pluginDef?.icon ?? Terminal;

    let outerBorderColor = 'transparent';
    if (selected) outerBorderColor = theme.palette.primary.main;
    else if (data.status === 'running')
      outerBorderColor = theme.palette.info.main;
    else if (data.status === 'failed')
      outerBorderColor = theme.palette.error.main;

    const isGitClone = data.plugin === 'git_clone@v1';
    const displayValue = isGitClone ? (data.url ?? '') : (data.command ?? '');

    return (
      <Box sx={{ position: 'relative' }}>
        <Handle
          type="target"
          position={Position.Left}
          style={{
            background: pluginColor,
            width: 10,
            height: 10,
            border: `2px solid ${theme.palette.background.paper}`,
            boxShadow: `0 0 0 1px ${pluginColor}`,
          }}
        />

        <Paper
          elevation={selected ? 6 : 2}
          sx={{
            width: 272,
            borderRadius: 2.5,
            border: `2px solid ${outerBorderColor}`,
            backgroundColor: isDark
              ? theme.palette.background.paper
              : '#ffffff',
            overflow: 'hidden',
            transition: 'box-shadow 0.2s, border-color 0.2s',
            cursor: data.editMode ? 'pointer' : 'default',
            boxShadow: (() => {
              if (data.status === 'running')
                return `0 0 0 3px ${alpha(theme.palette.info.main, 0.2)}, ${theme.shadows[3]}`;
              if (selected)
                return `0 0 0 3px ${alpha(theme.palette.primary.main, 0.2)}, ${theme.shadows[6]}`;
              return theme.shadows[2];
            })(),
            '&:hover': {
              boxShadow: `0 0 0 3px ${alpha(pluginColor, 0.15)}, ${theme.shadows[8]}`,
              '& .edit-hint': { opacity: 1 },
            },
          }}
        >
          {/* Colored header strip */}
          <Box
            sx={{
              background: `linear-gradient(135deg, ${pluginColor} 0%, ${alpha(pluginColor, 0.75)} 100%)`,
              px: 1.5,
              pt: 1.25,
              pb: 1.25,
              display: 'flex',
              alignItems: 'center',
              gap: 1,
              position: 'relative',
            }}
          >
            {/* Plugin icon badge */}
            <Box
              sx={{
                width: 28,
                height: 28,
                borderRadius: 1.5,
                bgcolor: alpha('#ffffff', 0.2),
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
                backdropFilter: 'blur(4px)',
              }}
            >
              <PluginIcon sx={{ fontSize: 16, color: '#fff' }} />
            </Box>

            {/* Step name */}
            <Typography
              variant="subtitle2"
              noWrap
              title={data.error_message || data.name}
              sx={{
                fontWeight: 700,
                fontSize: '0.8rem',
                color: '#fff',
                flex: 1,
                lineHeight: 1.2,
                textShadow: '0 1px 2px rgba(0,0,0,0.2)',
              }}
            >
              {data.name}
            </Typography>

            {/* Step index badge */}
            {data.stepIndex != null && (
              <Box
                sx={{
                  bgcolor: alpha('#000', 0.2),
                  borderRadius: 1,
                  px: 0.75,
                  py: 0.25,
                  flexShrink: 0,
                }}
              >
                <Typography
                  sx={{
                    fontSize: '0.6rem',
                    fontWeight: 700,
                    color: alpha('#fff', 0.9),
                    lineHeight: 1,
                    fontFamily: 'monospace',
                  }}
                >
                  #{data.stepIndex + 1}
                </Typography>
              </Box>
            )}

            {/* Edit / delete hints */}
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
                  gap: 0.5,
                  zIndex: 1,
                }}
              >
                <Box
                  onClick={(e) => {
                    e.stopPropagation();
                    data.onEditClick?.();
                  }}
                  sx={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    bgcolor: alpha('#fff', 0.25),
                    borderRadius: '50%',
                    width: 22,
                    height: 22,
                    cursor: 'pointer',
                    '&:hover': { bgcolor: alpha('#fff', 0.4) },
                  }}
                >
                  <Edit sx={{ fontSize: 12, color: '#fff' }} />
                </Box>
                <Box
                  onClick={(e) => {
                    e.stopPropagation();
                    data.onDeleteClick?.();
                  }}
                  sx={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    bgcolor: alpha('#fff', 0.25),
                    borderRadius: '50%',
                    width: 22,
                    height: 22,
                    cursor: 'pointer',
                    '&:hover': { bgcolor: theme.palette.error.main },
                  }}
                >
                  <DeleteOutline sx={{ fontSize: 12, color: '#fff' }} />
                </Box>
              </Box>
            )}
          </Box>

          {/* Card body */}
          <Box sx={{ px: 1.5, pt: 1, pb: 1.25 }}>
            {/* Plugin name + version + status row */}
            <Box
              sx={{
                display: 'flex',
                alignItems: 'center',
                gap: 0.75,
                mb: 1,
                flexWrap: 'wrap',
              }}
            >
              <Chip
                label={getPluginLabel(data.plugin)}
                size="small"
                sx={{
                  height: 18,
                  fontSize: '0.6rem',
                  fontWeight: 700,
                  letterSpacing: 0.4,
                  color: '#fff',
                  bgcolor: alpha(pluginColor, 0.85),
                  border: 'none',
                  '& .MuiChip-label': { px: 0.75 },
                }}
              />
              {data.plugin.includes('@') && (
                <Typography
                  variant="caption"
                  sx={{
                    color: 'text.disabled',
                    fontSize: '0.58rem',
                    fontFamily: 'monospace',
                  }}
                >
                  {data.plugin.split('@')[1]}
                </Typography>
              )}

              {statusVisual && (
                <Box
                  sx={{
                    ml: 'auto',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 0.5,
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
                      height: 18,
                      fontSize: '0.58rem',
                      fontWeight: 600,
                      color: statusVisual.color,
                      borderColor: alpha(statusVisual.color, 0.5),
                      bgcolor: alpha(statusVisual.color, 0.08),
                      '& .MuiChip-label': { px: 0.75 },
                    }}
                  />
                  {data.duration ? (
                    <Typography
                      variant="caption"
                      sx={{ color: 'text.disabled', fontSize: '0.58rem' }}
                    >
                      {formatDuration(data.duration)}
                    </Typography>
                  ) : null}
                </Box>
              )}
            </Box>

            {/* Divider */}
            <Box
              sx={{
                height: 1,
                bgcolor: 'divider',
                mx: -0.5,
                mb: 1,
              }}
            />

            {/* Command or URL */}
            <Box
              sx={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: 0.75,
                mb: data.working_dir ? 0.75 : 0,
                bgcolor: isDark ? alpha('#000', 0.2) : alpha('#000', 0.03),
                borderRadius: 1,
                px: 1,
                py: 0.5,
                border: `1px solid ${theme.palette.divider}`,
              }}
            >
              {isGitClone ? (
                <LinkIcon
                  sx={{
                    fontSize: 11,
                    color: pluginColor,
                    mt: '2px',
                    flexShrink: 0,
                  }}
                />
              ) : (
                <Terminal
                  sx={{
                    fontSize: 11,
                    color: pluginColor,
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
                  flex: 1,
                  wordBreak: 'break-all',
                  whiteSpace: 'pre-wrap',
                  display: '-webkit-box',
                  WebkitLineClamp: 4,
                  WebkitBoxOrient: 'vertical',
                  overflow: 'hidden',
                }}
              >
                {displayValue || <span style={{ opacity: 0.3 }}>—</span>}
              </Typography>
            </Box>

            {/* Working dir */}
            {data.working_dir && (
              <Box
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 0.75,
                  mt: 0.5,
                }}
              >
                <FolderOpen
                  sx={{ fontSize: 11, color: 'text.disabled', flexShrink: 0 }}
                />
                <Typography
                  variant="caption"
                  sx={{
                    color: 'text.disabled',
                    fontFamily: 'monospace',
                    fontSize: '0.62rem',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
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
          style={{
            background: pluginColor,
            width: 10,
            height: 10,
            border: `2px solid ${theme.palette.background.paper}`,
            boxShadow: `0 0 0 1px ${pluginColor}`,
          }}
        />
      </Box>
    );
  },
);
