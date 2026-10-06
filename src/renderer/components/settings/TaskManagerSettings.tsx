import React from 'react';
import {
  Box,
  Typography,
  LinearProgress,
  IconButton,
  Chip,
  Tooltip,
} from '@mui/material';
import { Cancel, Delete, PendingActions, History } from '@mui/icons-material';
import { formatDistanceToNow } from 'date-fns';
import type { TaskRecord, TaskStatus } from '../../../types/ipc';
import { useTaskManager } from '../../context';
import { SettingsRow, SettingsSection, SettingsStack } from './SettingsLayout';

const STATUS_LABEL: Record<TaskStatus, string> = {
  pending: 'Pending',
  running: 'Running',
  completed: 'Completed',
  error: 'Failed',
  cancelled: 'Cancelled',
};

const STATUS_COLOR: Record<
  TaskStatus,
  'default' | 'primary' | 'success' | 'error' | 'warning'
> = {
  pending: 'default',
  running: 'primary',
  completed: 'success',
  error: 'error',
  cancelled: 'warning',
};

const isActive = (task: TaskRecord) =>
  task.status === 'running' || task.status === 'pending';

export const TaskManagerSettings: React.FC = () => {
  const { tasks, cancel, remove } = useTaskManager();

  const activeTasks = tasks.filter(isActive);
  const historyTasks = tasks.filter((task) => !isActive(task));

  const renderTask = (task: TaskRecord) => (
    <SettingsRow
      key={task.id}
      label={
        <Box component="span" sx={{ wordBreak: 'break-all' }}>
          {task.label}
        </Box>
      }
      description={[
        formatDistanceToNow(new Date(task.startedAt), {
          addSuffix: true,
        }),
        task.error,
      ]
        .filter(Boolean)
        .join(' · ')}
    >
      {task.status === 'running' && task.progress && (
        <Box sx={{ width: 140 }}>
          <LinearProgress
            variant="determinate"
            value={task.progress.percentage}
          />
          <Typography variant="caption" color="text.secondary">
            {task.progress.percentage}%
          </Typography>
        </Box>
      )}

      <Chip
        size="small"
        label={STATUS_LABEL[task.status]}
        color={STATUS_COLOR[task.status]}
      />

      {task.status === 'running' && task.cancellable && (
        <Tooltip title="Cancel">
          <IconButton size="small" onClick={() => cancel(task.id)}>
            <Cancel fontSize="small" />
          </IconButton>
        </Tooltip>
      )}
      {!isActive(task) && (
        <Tooltip title="Dismiss">
          <IconButton size="small" onClick={() => remove(task.id)}>
            <Delete fontSize="small" />
          </IconButton>
        </Tooltip>
      )}
    </SettingsRow>
  );

  return (
    <SettingsStack>
      <SettingsSection
        title={`Active (${activeTasks.length})`}
        icon={<PendingActions />}
        description="Long-running operations keep running in the background even if you navigate away."
      >
        {activeTasks.length === 0 ? (
          <SettingsRow label="No tasks currently running." />
        ) : (
          activeTasks.map(renderTask)
        )}
      </SettingsSection>

      <SettingsSection title="History" icon={<History />}>
        {historyTasks.length === 0 ? (
          <SettingsRow label="No completed tasks yet." />
        ) : (
          historyTasks.map(renderTask)
        )}
      </SettingsSection>
    </SettingsStack>
  );
};

export default TaskManagerSettings;
