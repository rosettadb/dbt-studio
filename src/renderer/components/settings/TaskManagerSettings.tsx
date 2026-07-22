import React from 'react';
import {
  Box,
  Typography,
  Card,
  CardContent,
  LinearProgress,
  IconButton,
  Chip,
  Tooltip,
  Divider,
  Alert,
} from '@mui/material';
import { Cancel, Delete, PendingActions, History } from '@mui/icons-material';
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

  const renderTask = (task: TaskRecord, isLast: boolean) => (
    <React.Fragment key={task.id}>
      <Box display="flex" alignItems="center" gap={1.5} py={1}>
        <Box flex={1} minWidth={0}>
          <Typography variant="body2" sx={{ wordBreak: 'break-all' }}>
            {task.label}
          </Typography>
          <Typography variant="caption" color="text.secondary" display="block">
            {[
              formatDistanceToNow(new Date(task.startedAt), {
                addSuffix: true,
              }),
              task.error,
            ]
              .filter(Boolean)
              .join(' · ')}
          </Typography>
        </Box>

        {task.status === 'running' && task.progress && (
          <Box sx={{ width: 140, flexShrink: 0 }}>
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
          sx={{ flexShrink: 0 }}
        />

        <Box
          display="flex"
          alignItems="center"
          gap={0.5}
          flexShrink={0}
          minWidth={64}
          justifyContent="flex-end"
        >
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
        </Box>
      </Box>
      {!isLast && <Divider />}
    </React.Fragment>
  );

  return (
    <Box maxWidth={800} width="100%" mt={3}>
      <Typography variant="body2" color="text.secondary" mb={3}>
        Long-running operations, like Cloud Explorer downloads, keep running in
        the background even if you navigate away. Track their progress or cancel
        them here.
      </Typography>

      <Card
        variant="outlined"
        sx={{ borderRadius: 1, borderColor: 'divider', mb: 3 }}
      >
        <CardContent>
          <Box display="flex" alignItems="center" gap={1} mb={2}>
            <PendingActions color="primary" />
            <Typography variant="h6" sx={{ m: 0 }}>
              Active ({activeTasks.length})
            </Typography>
          </Box>
          {activeTasks.length === 0 ? (
            <Alert severity="info">No tasks currently running.</Alert>
          ) : (
            activeTasks.map((task, i) =>
              renderTask(task, i === activeTasks.length - 1),
            )
          )}
        </CardContent>
      </Card>

      <Card variant="outlined" sx={{ borderRadius: 1, borderColor: 'divider' }}>
        <CardContent>
          <Box display="flex" alignItems="center" gap={1} mb={2}>
            <History color="primary" />
            <Typography variant="h6" sx={{ m: 0 }}>
              History
            </Typography>
          </Box>
          {historyTasks.length === 0 ? (
            <Alert severity="info">No completed tasks yet.</Alert>
          ) : (
            historyTasks.map((task, i) =>
              renderTask(task, i === historyTasks.length - 1),
            )
          )}
        </CardContent>
      </Card>
    </Box>
  );
};

export default TaskManagerSettings;
