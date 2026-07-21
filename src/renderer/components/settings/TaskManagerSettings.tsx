import React from 'react';
import {
  Box,
  Typography,
  List,
  ListItem,
  ListItemText,
  LinearProgress,
  IconButton,
  Chip,
  Tooltip,
  Divider,
} from '@mui/material';
import { Cancel, Delete } from '@mui/icons-material';
import { formatDistanceToNow } from 'date-fns';
import type { TaskRecord, TaskStatus } from '../../../types/ipc';
import { useTaskManager } from '../../context';

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
    <ListItem
      key={task.id}
      divider
      sx={{ display: 'flex', alignItems: 'center', gap: 2, py: 1.5 }}
    >
      <ListItemText
        primary={task.label}
        secondary={[
          formatDistanceToNow(new Date(task.startedAt), { addSuffix: true }),
          task.error,
        ]
          .filter(Boolean)
          .join(' · ')}
      />
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
    </ListItem>
  );

  if (tasks.length === 0) {
    return (
      <Box sx={{ py: 4, textAlign: 'center' }}>
        <Typography variant="body2" color="text.secondary">
          No background tasks yet. Long-running operations like downloads show
          up here so you can track progress or cancel them without losing them
          when you navigate away.
        </Typography>
      </Box>
    );
  }

  return (
    <Box>
      <Box sx={{ mb: 3 }}>
        <Typography variant="h6" sx={{ mb: 1 }}>
          Active ({activeTasks.length})
        </Typography>
        {activeTasks.length === 0 ? (
          <Typography variant="body2" color="text.secondary">
            No tasks currently running.
          </Typography>
        ) : (
          <List disablePadding>{activeTasks.map(renderTask)}</List>
        )}
      </Box>

      <Divider sx={{ my: 2 }} />

      <Box>
        <Typography variant="h6" sx={{ mb: 1 }}>
          History
        </Typography>
        {historyTasks.length === 0 ? (
          <Typography variant="body2" color="text.secondary">
            No completed tasks yet.
          </Typography>
        ) : (
          <List disablePadding>{historyTasks.map(renderTask)}</List>
        )}
      </Box>
    </Box>
  );
};

export default TaskManagerSettings;
