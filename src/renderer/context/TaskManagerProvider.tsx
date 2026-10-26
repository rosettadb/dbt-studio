import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  ReactNode,
} from 'react';
import { useQueryClient } from 'react-query';
import { toast } from 'react-toastify';
import type { TaskEvent, TaskRecord } from '../../types/ipc';
import { taskManagerService } from '../services';
import { QUERY_KEYS } from '../config/constants';
import { isInstallTaskType } from '../../shared/installTasks';

type TaskListener = (task: TaskRecord | undefined) => void;

export interface TaskManagerContextValue {
  tasks: TaskRecord[];
  cancel: (taskId: string) => Promise<void>;
  remove: (taskId: string) => Promise<void>;
  subscribe: (taskId: string, listener: TaskListener) => () => void;
  getTask: (taskId: string) => TaskRecord | undefined;
  // Running installs that have taken longer than STUCK_INSTALL_AFTER_MS.
  stuckTaskIds: string[];
}

const STUCK_INSTALL_AFTER_MS = 10 * 60 * 1000;
const STUCK_CHECK_INTERVAL_MS = 30 * 1000;

export const TaskManagerContext = createContext<TaskManagerContextValue | null>(
  null,
);

const sortByStartedAtDesc = (tasks: TaskRecord[]) =>
  [...tasks].sort((a, b) => b.startedAt - a.startedAt);

interface TaskManagerProviderProps {
  children: ReactNode;
}

// Root-mounted, never unmounts across route navigation (sibling of Router in
// App.tsx). Mirrors a pub/sub topic model: tasks live in the main process and
// keep running regardless of subscribers; any component can subscribe to a
// task by its unique id via useTaskChannel, independent of who created it.
export const TaskManagerProvider: React.FC<TaskManagerProviderProps> = ({
  children,
}) => {
  const [tasks, setTasks] = useState<TaskRecord[]>([]);
  const tasksRef = useRef<Map<string, TaskRecord>>(new Map());
  const listenersRef = useRef<Map<string, Set<TaskListener>>>(new Map());
  const queryClient = useQueryClient();
  const [stuckTaskIds, setStuckTaskIds] = useState<string[]>([]);
  const warnedStuckTaskIdsRef = useRef<Set<string>>(new Set());

  const notify = useCallback((taskId: string) => {
    const listeners = listenersRef.current.get(taskId);
    if (!listeners) return;
    const task = tasksRef.current.get(taskId);
    listeners.forEach((listener) => listener(task));
  }, []);

  const applyEvent = useCallback(
    (event: TaskEvent) => {
      if (event.type === 'removed') {
        tasksRef.current.delete(event.task.id);
      } else {
        tasksRef.current.set(event.task.id, event.task);
      }
      setTasks(sortByStartedAtDesc(Array.from(tasksRef.current.values())));
      notify(event.task.id);

      // Installs save new paths and versions (dbt, Python, ...) in the main
      // process. Reload the settings so no screen keeps an old copy that a
      // later save would write back over them.
      if (
        event.task.type.startsWith('install:') &&
        (event.task.status === 'completed' || event.task.status === 'error')
      ) {
        queryClient.invalidateQueries([QUERY_KEYS.GET_SETTINGS]);
      }
    },
    [notify, queryClient],
  );

  // Nothing is stopped automatically: a long install only gets a "Looks
  // stuck" label in the Task Manager and one popup pointing there.
  useEffect(() => {
    const checkForStuckInstalls = () => {
      const now = Date.now();
      const stuck = Array.from(tasksRef.current.values()).filter(
        (task) =>
          isInstallTaskType(task.type) &&
          task.status === 'running' &&
          now - task.startedAt >= STUCK_INSTALL_AFTER_MS,
      );
      stuck.forEach((task) => {
        if (warnedStuckTaskIdsRef.current.has(task.id)) return;
        warnedStuckTaskIdsRef.current.add(task.id);
        toast.warning(
          `${task.label} is taking longer than usual and may be stuck. Check the Task Manager.`,
        );
      });
      setStuckTaskIds((previous) => {
        const next = stuck.map((task) => task.id);
        return previous.length === next.length &&
          previous.every((id, index) => id === next[index])
          ? previous
          : next;
      });
    };
    const interval = setInterval(
      checkForStuckInstalls,
      STUCK_CHECK_INTERVAL_MS,
    );
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    let mounted = true;
    taskManagerService
      .list()
      .then((list) => {
        if (!mounted) return undefined;
        list.forEach((task) => tasksRef.current.set(task.id, task));
        setTasks(sortByStartedAtDesc(list));
        return undefined;
      })
      .catch(() => {
        // Hydration failure is non-fatal; the task:event feed still keeps
        // the registry in sync going forward.
      });

    const unsubscribe = taskManagerService.onEvent(applyEvent);
    return () => {
      mounted = false;
      unsubscribe();
    };
  }, [applyEvent]);

  const cancel = useCallback(async (taskId: string) => {
    await taskManagerService.cancel(taskId);
  }, []);

  const remove = useCallback(async (taskId: string) => {
    await taskManagerService.remove(taskId);
  }, []);

  const subscribe = useCallback((taskId: string, listener: TaskListener) => {
    let listeners = listenersRef.current.get(taskId);
    if (!listeners) {
      listeners = new Set();
      listenersRef.current.set(taskId, listeners);
    }
    listeners.add(listener);
    listener(tasksRef.current.get(taskId));

    return () => {
      listeners?.delete(listener);
      if (listeners && listeners.size === 0) {
        listenersRef.current.delete(taskId);
      }
    };
  }, []);

  const getTask = useCallback(
    (taskId: string) => tasksRef.current.get(taskId),
    [],
  );

  const value = useMemo<TaskManagerContextValue>(
    () => ({ tasks, cancel, remove, subscribe, getTask, stuckTaskIds }),
    [tasks, cancel, remove, subscribe, getTask, stuckTaskIds],
  );

  return (
    <TaskManagerContext.Provider value={value}>
      {children}
    </TaskManagerContext.Provider>
  );
};

export const useTaskManager = (): TaskManagerContextValue => {
  const ctx = useContext(TaskManagerContext);
  if (!ctx) {
    throw new Error('useTaskManager must be used within a TaskManagerProvider');
  }
  return ctx;
};
