import React from 'react';
import { Box, Alert, Button, Chip, Tooltip, Typography } from '@mui/material';
import CloudIcon from '@mui/icons-material/Cloud';
import { PipelineGraph } from './PipelineGraph';
import { parsePipelineConfig } from './parsePipelineConfig';
import type { PipelineJob, PipelineStep } from './types';
import { useCloudActionStatus } from '../../controllers/rosettaCloud.controller';
import type {
  CloudActionStatus,
  CloudPipelineData,
  CloudStepStatus,
} from '../../../types/cloudAction';

type PipelineViewProps = {
  content: string;
  onEdit?: (content?: string) => void;
  /**
   * Cloud action id recorded for this specific pipeline file. When null, no
   * status is fetched and every node renders neutral.
   */
  actionId?: string | null;
  /** Notifies parent of the active action id (for log viewer wiring). */
  onActiveActionChange?: (actionId: string | null) => void;
  /** When provided, enables visual edit mode with a Save button. */
  onSave?: (content: string) => Promise<void>;
  /** When provided (cloud mode), shows a Run button that triggers a cloud run. */
  onRun?: () => void;
  /** When set, the Run button is shown but disabled with this text as its tooltip. */
  runDisabledReason?: string;
  /** When true, the Run button is replaced with a Stop button. */
  isRunning?: boolean;
  /** Called when the Stop button is clicked (only rendered while isRunning). */
  onStop?: () => void;
  /** Notifies parent when the visual graph enters/exits edit mode. */
  onEditingChange?: (isEditing: boolean) => void;
  /** Fired once when the pipeline view first mounts (e.g. tab opened). */
  onEnterView?: () => void;
};

const ACTION_STATUS_COLOR: Record<CloudActionStatus, string> = {
  PENDING: 'default',
  STARTING: 'info',
  RUNNING: 'info',
  CANCELLING: 'warning',
  CANCELLED: 'warning',
  FINISHED: 'success',
  FAILED: 'error',
};

function applyStatuses(
  jobs: PipelineJob[],
  remote: CloudPipelineData | null | undefined,
): PipelineJob[] {
  if (!remote || !remote.steps?.length) return jobs;

  const byName = new Map<
    string,
    { status: CloudStepStatus; duration?: number | null; error?: string | null }
  >();
  remote.steps.forEach((s) => {
    byName.set(s.name, {
      status: s.status,
      duration: s.duration ?? null,
      error: s.error_message ?? null,
    });
  });

  return jobs.map((job) => ({
    ...job,
    steps: job.steps.map((step): PipelineStep => {
      const match = byName.get(step.name);
      if (!match) return step;
      return {
        ...step,
        status: match.status,
        duration: match.duration,
        error_message: match.error,
      };
    }),
  }));
}

export const PipelineView: React.FC<PipelineViewProps> = ({
  content,
  onEdit,
  actionId,
  onActiveActionChange,
  onSave,
  onRun,
  runDisabledReason,
  isRunning,
  onStop,
  onEditingChange,
  onEnterView,
}) => {
  const config = React.useMemo(() => parsePipelineConfig(content), [content]);

  // Pull status only for the action recorded against this pipeline file.
  const { data: actionStatus } = useCloudActionStatus(actionId ?? null);

  React.useEffect(() => {
    onActiveActionChange?.(actionId ?? null);
  }, [actionId, onActiveActionChange]);

  const jobsWithStatus = React.useMemo(() => {
    if (!config) return [];
    return applyStatuses(config.jobs, actionStatus);
  }, [config, actionStatus]);

  // Prefer the overall container status when the API provides one — steps
  // are updated conditionally and may never all reach a terminal state even
  // after the run finishes, so deriving from steps alone can get stuck.
  // Fall back to deriving from steps only for responses that omit it.
  const derivedRunState: CloudActionStatus | null = React.useMemo(() => {
    if (!actionId || !actionStatus) return null;
    if (actionStatus.status) return actionStatus.status;
    if (!actionStatus.steps?.length) return null;
    const statuses = actionStatus.steps.map((s) => s.status);
    if (statuses.includes('failed')) return 'FAILED';
    if (statuses.includes('running')) return 'RUNNING';
    if (statuses.every((s) => s === 'success' || s === 'skipped')) {
      return 'FINISHED';
    }
    if (statuses.every((s) => s === 'pending' || s === 'not_started')) {
      return 'PENDING';
    }
    return 'RUNNING';
  }, [actionId, actionStatus]);

  if (!config) {
    return (
      <Box sx={{ p: 3, display: 'flex', flexDirection: 'column', gap: 2 }}>
        <Alert severity="warning">
          Unable to parse pipeline config. Make sure the file is valid YAML with
          a <code>jobs</code> array.
        </Alert>
        {onEdit && (
          <Button
            variant="outlined"
            onClick={() => onEdit()}
            sx={{ alignSelf: 'flex-start' }}
          >
            Open pipeline.yml in editor
          </Button>
        )}
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
      {actionId && derivedRunState && (
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            gap: 1,
            px: 2,
            py: 0.75,
            borderBottom: 1,
            borderColor: 'divider',
            bgcolor: 'background.paper',
          }}
        >
          <CloudIcon fontSize="small" sx={{ color: 'text.secondary' }} />
          <Typography variant="caption" sx={{ color: 'text.secondary' }}>
            Last run
          </Typography>
          <Tooltip title={actionId}>
            <Typography
              variant="caption"
              sx={{
                fontFamily: 'monospace',
                color: 'text.disabled',
                fontSize: '0.7rem',
              }}
            >
              {actionId.slice(0, 8)}
            </Typography>
          </Tooltip>
          <Chip
            label={derivedRunState}
            size="small"
            color={
              (ACTION_STATUS_COLOR[derivedRunState] as
                | 'default'
                | 'info'
                | 'warning'
                | 'success'
                | 'error') ?? 'default'
            }
            sx={{ height: 18, fontSize: '0.65rem' }}
          />
        </Box>
      )}
      <PipelineGraph
        jobs={jobsWithStatus}
        pipelineName={config.name}
        onEdit={onEdit}
        onSave={onSave}
        onRun={onRun}
        runDisabledReason={runDisabledReason}
        isRunning={isRunning}
        onStop={onStop}
        onEditingChange={onEditingChange}
        onEnterView={onEnterView}
      />
    </Box>
  );
};
