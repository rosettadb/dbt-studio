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
import { UNLIMITED_INSTALL_TYPES } from '../../shared/installTasks';

type TaskListener = (task: TaskRecord | undefined) => void;

export interface TaskManagerContextValue {
  tasks: TaskRecord[];
  cancel: (taskId: string) => Promise<void>;
  remove: (taskId: string) => Promise<void>;
  subscribe: (taskId: string, listener: TaskListener) => () => void;
  getTask: (taskId: string) => TaskRecord | undefined;
}

// When an install with no time limit counts as possibly stuck.
const LONG_RUNNING_INSTALL_AFTER_MS = 30 * 60 * 1000;

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
  const longRunningTimersRef = useRef<
    Map<string, ReturnType<typeof setTimeout>>
  >(new Map());

  // One timer per running install that has no time limit, set for 30
  // minutes after it started; if it is still running then, one popup says
  // so. Nothing is stopped: these installs can't be stopped safely.
  const watchLongRunningInstall = useCallback((task: TaskRecord) => {
    const timers = longRunningTimersRef.current;
    if (task.status !== 'running') {
      clearTimeout(timers.get(task.id));
      timers.delete(task.id);
      return;
    }
    if (!UNLIMITED_INSTALL_TYPES.includes(task.type) || timers.has(task.id)) {
      return;
    }
    const delay = Math.max(
      0,
      task.startedAt + LONG_RUNNING_INSTALL_AFTER_MS - Date.now(),
    );
    timers.set(
      task.id,
      setTimeout(() => {
        if (tasksRef.current.get(task.id)?.status !== 'running') return;
        toast.warning(
          `${task.label} is still running after 30 minutes and may be stuck. It can't be stopped safely right now; if it stays stuck, quit the app.`,
        );
      }, delay),
    );
  }, []);

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
        watchLongRunningInstall({ ...event.task, status: 'cancelled' });
      } else {
        tasksRef.current.set(event.task.id, event.task);
        watchLongRunningInstall(event.task);
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
    [notify, queryClient, watchLongRunningInstall],
  );

  useEffect(() => {
    const timers = longRunningTimersRef.current;
    return () => {
      timers.forEach((timer) => clearTimeout(timer));
      timers.clear();
    };
  }, []);

  useEffect(() => {
    let mounted = true;
    taskManagerService
      .list()
      .then((list) => {
        if (!mounted) return undefined;
        list.forEach((task) => {
          tasksRef.current.set(task.id, task);
          // Picks up an install already running when the window loads.
          watchLongRunningInstall(task);
        });
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
  }, [applyEvent, watchLongRunningInstall]);

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
    () => ({ tasks, cancel, remove, subscribe, getTask }),
    [tasks, cancel, remove, subscribe, getTask],
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
