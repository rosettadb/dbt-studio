import React, {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useSyncExternalStore,
  ReactNode,
} from 'react';

export interface CloudRunRecord {
  actionId: string;
  projectId: string;
  // Relative pipeline name as sent in PIPELINE_FILE. Absent for plain dbt
  // command runs, which only have a project-level action id.
  pipelineFile?: string;
}

export interface ActiveCloudRun {
  run: CloudRunRecord | null;
  // Bumped every time a run is *started* (not merely viewed), so a subscriber
  // can tell "a new run just kicked off" apart from "the user switched to a
  // pipeline that already has a run".
  startedSeq: number;
}

export const buildCloudRunKey = (
  projectId: string,
  pipelineFile?: string | null,
): string => `${projectId}::${pipelineFile ?? ''}`;

type Listener = () => void;

export interface CloudRunContextValue {
  // A run was just triggered. Becomes the active run and bumps startedSeq.
  publishStarted: (record: CloudRunRecord) => void;
  // A view is now showing this pipeline's last known run. Becomes the active
  // run without bumping startedSeq (no focus change for subscribers).
  publishViewed: (record: CloudRunRecord | null) => void;
  subscribeActive: (listener: Listener) => () => void;
  getActive: () => ActiveCloudRun;
  subscribeKey: (key: string, listener: Listener) => () => void;
  getActionId: (key: string) => string | null;
}

export const CloudRunContext = createContext<CloudRunContextValue | null>(null);

interface CloudRunProviderProps {
  children: ReactNode;
}

// Root-mounted pub/sub for cloud (CI/CD) runs, mirroring TaskManagerProvider:
// whoever triggers a run publishes it; whoever renders it (pipeline graph,
// log panel, terminal tab strip) subscribes by key or to the active run.
// Nothing routes through a screen component.
export const CloudRunProvider: React.FC<CloudRunProviderProps> = ({
  children,
}) => {
  const byKeyRef = useRef<Map<string, string>>(new Map());
  const keyListenersRef = useRef<Map<string, Set<Listener>>>(new Map());
  const activeRef = useRef<ActiveCloudRun>({ run: null, startedSeq: 0 });
  const activeListenersRef = useRef<Set<Listener>>(new Set());

  const notifyKey = useCallback((key: string) => {
    keyListenersRef.current.get(key)?.forEach((listener) => listener());
  }, []);

  const notifyActive = useCallback(() => {
    activeListenersRef.current.forEach((listener) => listener());
  }, []);

  const remember = useCallback(
    (record: CloudRunRecord) => {
      const key = buildCloudRunKey(record.projectId, record.pipelineFile);
      if (byKeyRef.current.get(key) === record.actionId) return;
      byKeyRef.current.set(key, record.actionId);
      notifyKey(key);
    },
    [notifyKey],
  );

  const publishStarted = useCallback(
    (record: CloudRunRecord) => {
      remember(record);
      activeRef.current = {
        run: record,
        startedSeq: activeRef.current.startedSeq + 1,
      };
      notifyActive();
    },
    [remember, notifyActive],
  );

  const publishViewed = useCallback(
    (record: CloudRunRecord | null) => {
      if (record) remember(record);
      const current = activeRef.current.run;
      if (
        current?.actionId === record?.actionId &&
        current?.projectId === record?.projectId &&
        current?.pipelineFile === record?.pipelineFile
      ) {
        return;
      }
      activeRef.current = {
        run: record,
        startedSeq: activeRef.current.startedSeq,
      };
      notifyActive();
    },
    [remember, notifyActive],
  );

  const subscribeActive = useCallback((listener: Listener) => {
    activeListenersRef.current.add(listener);
    return () => {
      activeListenersRef.current.delete(listener);
    };
  }, []);

  const getActive = useCallback(() => activeRef.current, []);

  const subscribeKey = useCallback((key: string, listener: Listener) => {
    let listeners = keyListenersRef.current.get(key);
    if (!listeners) {
      listeners = new Set();
      keyListenersRef.current.set(key, listeners);
    }
    listeners.add(listener);
    return () => {
      listeners?.delete(listener);
      if (listeners && listeners.size === 0) {
        keyListenersRef.current.delete(key);
      }
    };
  }, []);

  const getActionId = useCallback(
    (key: string) => byKeyRef.current.get(key) ?? null,
    [],
  );

  const value = useMemo<CloudRunContextValue>(
    () => ({
      publishStarted,
      publishViewed,
      subscribeActive,
      getActive,
      subscribeKey,
      getActionId,
    }),
    [
      publishStarted,
      publishViewed,
      subscribeActive,
      getActive,
      subscribeKey,
      getActionId,
    ],
  );

  return (
    <CloudRunContext.Provider value={value}>
      {children}
    </CloudRunContext.Provider>
  );
};

export const useCloudRuns = (): CloudRunContextValue => {
  const ctx = useContext(CloudRunContext);
  if (!ctx) {
    throw new Error('useCloudRuns must be used within a CloudRunProvider');
  }
  return ctx;
};

// The run the workspace is currently looking at (last started or last viewed).
export const useActiveCloudRun = (): ActiveCloudRun => {
  const { subscribeActive, getActive } = useCloudRuns();
  return useSyncExternalStore(subscribeActive, getActive);
};

// Last known action id for one pipeline (or the project-level command run
// when pipelineFile is omitted).
export const useCloudRunActionId = (
  projectId: string | null | undefined,
  pipelineFile?: string | null,
): string | null => {
  const { subscribeKey, getActionId } = useCloudRuns();
  const key = projectId ? buildCloudRunKey(projectId, pipelineFile) : null;

  const subscribe = useCallback(
    (onStoreChange: Listener) => {
      if (!key) return () => {};
      return subscribeKey(key, onStoreChange);
    },
    [subscribeKey, key],
  );
  const getSnapshot = useCallback(
    () => (key ? getActionId(key) : null),
    [getActionId, key],
  );

  return useSyncExternalStore(subscribe, getSnapshot);
};
