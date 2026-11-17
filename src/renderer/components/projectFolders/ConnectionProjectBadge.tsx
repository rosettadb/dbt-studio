import React from 'react';
import { Box, Tooltip, Typography } from '@mui/material';
import { alpha } from '@mui/material/styles';
import { projectTypeUiOf } from '../../../projectTypes/registry.renderer';
import { projectTypeOf } from '../../../projectTypes/registry.shared';
import type { Project } from '../../../types/backend';

interface ConnectionProjectBadgeProps {
  /** The project linked to the connection. */
  project: Project;
  /** It's the selected (active) project. */
  active: boolean;
  /** Icon only, for the closed connection picker where space is short. */
  compact?: boolean;
}

/**
 * Which project a connection belongs to, in the SQL Editor and Notebooks
 * connection pickers (plan 95): the project's type icon and name. The
 * active project's badge is a green pill, so it stands out in the list.
 */
export const ConnectionProjectBadge: React.FC<ConnectionProjectBadgeProps> = ({
  project,
  active,
  compact = false,
}) => {
  const { Icon } = projectTypeUiOf(project);
  const pillPadding = compact ? '4px' : '6px';
  const tooltip = `${active ? 'Active project' : 'Project'}: ${project.name} (${projectTypeOf(project).title})`;
  return (
    <Tooltip title={tooltip}>
      <Box
        data-testid={
          active ? 'connection-active-project' : 'connection-linked-project'
        }
        sx={(theme) => ({
          display: 'flex',
          alignItems: 'center',
          gap: 0.5,
          flexShrink: 0,
          maxWidth: compact ? undefined : 120,
          // Compact (icon only, in the pickers) stays small next to the name
          height: compact ? 16 : 20,
          px: active ? pillPadding : 0,
          borderRadius: '10px',
          ...(active && {
            bgcolor: alpha(theme.palette.success.main, 0.16),
            border: `1px solid ${alpha(theme.palette.success.main, 0.6)}`,
          }),
        })}
      >
        <Icon size={compact ? 12 : 14} />
        {!compact && (
          <Typography
            noWrap
            sx={{
              fontSize: 11.5,
              minWidth: 0,
              fontWeight: active ? 600 : 400,
              color: active ? 'success.main' : 'text.secondary',
            }}
          >
            {project.name}
          </Typography>
        )}
      </Box>
    </Tooltip>
  );
};
