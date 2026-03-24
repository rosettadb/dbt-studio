import React from 'react';
import {
  Box,
  MenuItem,
  Select,
  Typography,
  FormControl,
  InputLabel,
  Alert,
} from '@mui/material';
import { PipelineGraph } from './PipelineGraph';
import { parsePipelineConfig } from './parsePipelineConfig';

type PipelineViewProps = {
  content: string;
};

export const PipelineView: React.FC<PipelineViewProps> = ({ content }) => {
  const config = React.useMemo(() => parsePipelineConfig(content), [content]);

  const jobs = config?.jobs ?? [];

  const [selectedJobName, setSelectedJobName] = React.useState<string | null>(
    null,
  );

  // Auto-select first job when config changes
  React.useEffect(() => {
    if (jobs.length > 0) {
      setSelectedJobName((prev) =>
        jobs.find((j) => j.name === prev) ? prev : jobs[0].name,
      );
    } else {
      setSelectedJobName(null);
    }
  }, [jobs]);

  const activeJob = jobs.find((j) => j.name === selectedJobName);

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

  if (jobs.length === 0) {
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
      {/* Toolbar */}
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 2,
          px: 2,
          py: 1,
          borderBottom: 1,
          borderColor: 'divider',
          flexShrink: 0,
        }}
      >
        {config.name && (
          <Typography variant="subtitle2" sx={{ color: 'text.secondary' }}>
            {config.name}
          </Typography>
        )}

        {jobs.length > 1 ? (
          <FormControl size="small" sx={{ minWidth: 240 }}>
            <InputLabel>Job</InputLabel>
            <Select
              value={selectedJobName ?? ''}
              label="Job"
              onChange={(e) => setSelectedJobName(e.target.value)}
            >
              {jobs.map((j) => (
                <MenuItem key={j.name} value={j.name}>
                  {j.name}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
        ) : (
          <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
            {jobs[0].name}
          </Typography>
        )}

        {activeJob && (
          <Typography
            variant="caption"
            sx={{ color: 'text.disabled', ml: 'auto' }}
          >
            {activeJob.steps.length} step
            {activeJob.steps.length !== 1 ? 's' : ''}
          </Typography>
        )}
      </Box>

      {/* Graph */}
      <Box sx={{ flex: 1, minHeight: 0 }}>
        {activeJob && <PipelineGraph job={activeJob} />}
      </Box>
    </Box>
  );
};
