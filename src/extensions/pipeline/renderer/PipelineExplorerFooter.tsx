import React from 'react';
import { Box, Button, Tooltip } from '@mui/material';
import { useTheme } from '@mui/material/styles';
import { ReactComponent as RouteIcon } from './assets/route.svg';
import { projectTypeOf } from '../../../extensionApi/studio/projectTypes';
import type { Project } from '../../../extensionApi/studio/types';
import { pipelineRunStore } from './pipelineRunStore';

// The Create Pipeline button under the project file tree — shown for every
// project type with pipelines.
export const PipelineExplorerFooter: React.FC<{ project: Project }> = ({
  project,
}) => {
  const theme = useTheme();
  if (!projectTypeOf(project).capabilities.pipelines) return null;

  return (
    <Box
      sx={{
        px: 1,
        pb: 1,
        pt: 0.75,
        flexShrink: 0,
        borderTop: `1px solid ${theme.palette.divider}`,
      }}
    >
      <Tooltip
        title="Create a pipeline to run jobs on the cloud"
        placement="top"
        arrow
      >
        <Button
          fullWidth
          variant="contained"
          size="small"
          startIcon={<RouteIcon width={16} height={16} />}
          onClick={() => pipelineRunStore.openCreate()}
          sx={{
            fontSize: '0.72rem',
            py: 0.75,
          }}
        >
          Create Pipeline
        </Button>
      </Tooltip>
    </Box>
  );
};
