import React, { memo } from 'react';
import { Handle, Position, NodeProps } from 'reactflow';
import {
  Box,
  Typography,
  Chip,
  Paper,
  useTheme,
  Theme,
  Tooltip,
} from '@mui/material';
import { FolderOpen, Terminal } from '@mui/icons-material';
import type { PipelineStep } from './types';

export type PipelineNodeData = PipelineStep & { stepIndex: number };

function getPluginColor(plugin: string, palette: Theme['palette']): string {
  const name = plugin.split('@')[0].toLowerCase();
  switch (name) {
    case 'dbt':
      return '#FF694A'; // dbt brand orange
    case 'terraform':
      return '#7B42BC'; // Terraform purple
    case 'rosetta':
      return palette.primary.main;
    default:
      return palette.text.secondary;
  }
}

function getPluginLabel(plugin: string): string {
  // Strip version suffix: "dbt@v1" → "dbt"
  return plugin.split('@')[0];
}

export const PipelineNode = memo(
  ({ data, selected }: NodeProps<PipelineNodeData>) => {
    const theme = useTheme();
    const pluginColor = getPluginColor(data.plugin, theme.palette);
    const borderColor = selected ? theme.palette.primary.main : 'transparent';

    return (
      <Box sx={{ position: 'relative' }}>
        <Handle
          type="target"
          position={Position.Left}
          style={{ background: theme.palette.divider, width: 8, height: 8 }}
        />

        <Paper
          elevation={selected ? 4 : 1}
          sx={{
            width: 260,
            borderRadius: 2,
            border: `2px solid ${borderColor}`,
            backgroundColor: theme.palette.background.paper,
            overflow: 'hidden',
            transition: 'all 0.2s',
            '&:hover': { boxShadow: theme.shadows[4] },
          }}
        >
          {/* Plugin colour bar at top */}
          <Box
            sx={{
              height: 4,
              backgroundColor: pluginColor,
            }}
          />

          <Box sx={{ px: 1.5, pt: 1, pb: 1.25 }}>
            {/* Step name */}
            <Typography
              variant="subtitle2"
              noWrap
              title={data.name}
              sx={{ fontWeight: 600, mb: 0.75 }}
            >
              {data.name}
            </Typography>

            {/* Plugin chip */}
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
                sx={{
                  height: 18,
                  fontSize: '0.6rem',
                  fontWeight: 700,
                  letterSpacing: 0.3,
                  color: theme.palette.getContrastText(pluginColor),
                  backgroundColor: pluginColor,
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

            {/* Command */}
            <Tooltip title={data.command} placement="bottom-start">
              <Box
                sx={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: 0.5,
                  mb: data.working_dir ? 0.5 : 0,
                }}
              >
                <Terminal
                  sx={{
                    fontSize: 12,
                    color: 'text.disabled',
                    mt: '2px',
                    flexShrink: 0,
                  }}
                />
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
                  {data.command}
                </Typography>
              </Box>
            </Tooltip>

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
