import { useCallback, useSyncExternalStore } from 'react';
import type { TaskRecord } from '../../types/ipc';
import { useTaskManager } from '../context';

// Subscribes to a single task by its unique id, like subscribing to a
// pub/sub topic on mount and unsubscribing on unmount. The task itself
// keeps running in the main process independent of this subscription; only
// the component that renders this task's progress re-renders on updates.
export const useTaskChannel = (
  taskId: string | null | undefined,
): TaskRecord | undefined => {
  const { subscribe, getTask } = useTaskManager();

  const subscribeFn = useCallback(
    (onStoreChange: () => void) => {
      if (!taskId) return () => {};
      return subscribe(taskId, onStoreChange);
    },
    [subscribe, taskId],
  );

  const getSnapshot = useCallback(
    () => (taskId ? getTask(taskId) : undefined),
    [getTask, taskId],
  );

  return useSyncExternalStore(subscribeFn, getSnapshot);
};

export default useTaskChannel;
