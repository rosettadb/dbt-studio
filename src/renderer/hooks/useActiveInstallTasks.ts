import { useMemo } from 'react';
import type { TaskRecord } from '../../types/ipc';
import { isInstallTaskType } from '../../shared/installTasks';
import { useTaskManager } from '../context';

// Install tasks that are running or waiting in the queue, read from the
// main-process registry, so screens can show what is queued (by each task's
// `subject`) even after they unmount and mount again.
export const useActiveInstallTasks = (): TaskRecord[] => {
  const { tasks } = useTaskManager();
  return useMemo(
    () =>
      tasks.filter(
        (task) =>
          isInstallTaskType(task.type) &&
          (task.status === 'running' || task.status === 'pending'),
      ),
    [tasks],
  );
};

export default useActiveInstallTasks;
