import React from 'react';
import { Box, Alert } from '@mui/material';
import { PipelineGraph } from './PipelineGraph';
import { parsePipelineConfig } from './parsePipelineConfig';

type PipelineViewProps = {
  content: string;
  onEdit?: () => void;
};

export const PipelineView: React.FC<PipelineViewProps> = ({
  content,
  onEdit,
}) => {
  const config = React.useMemo(() => parsePipelineConfig(content), [content]);

  if (!config) {
    return (
      <Box sx={{ p: 3 }}>
        <Alert severity="warning">
          Unable to parse pipeline config. Make sure the file is valid YAML with
          a <code>jobs</code> array.
        </Alert>
      </Box>
    );
  }

  if (config.jobs.length === 0) {
    return (
      <Box sx={{ p: 3 }}>
        <Alert severity="info">
          No jobs defined. Add a <code>jobs</code> array to get started.
        </Alert>
      </Box>
    );
  }

  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        minHeight: 0,
      }}
    >
      <PipelineGraph jobs={config.jobs} onEdit={onEdit} />
    </Box>
  );
};
