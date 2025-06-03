import { useCallback, useEffect, useState } from 'react';
import { projectsServices } from '../services';

type ProcessState = {
  running: boolean;
  pid: number | null;
  loading: boolean;
  error: string | null;
};

const useProcess = () => {
  const [state, setState] = useState<ProcessState>({
    running: false,
    pid: null,
    loading: false,
    error: null,
  });

  const refreshStatus = useCallback(async () => {
    try {
      const status = await projectsServices.getProcessStatus();
      setState((prev) => ({
        ...prev,
        running: status.running,
        pid: status.pid,
        error: null,
      }));
    } catch (err: any) {
      setState((prev) => ({
        ...prev,
        error: err.message || 'Failed to get process status',
      }));
    }
  }, []);

  const start = useCallback(
    async (command: string) => {
      setState((prev) => ({ ...prev, loading: true, error: null }));
      try {
        await projectsServices.startProcess(command);
        await refreshStatus();
      } catch (err: any) {
        setState((prev) => ({
          ...prev,
          error: err.message || 'Failed to start process',
        }));
      } finally {
        setState((prev) => ({ ...prev, loading: false }));
      }
    },
    [refreshStatus],
  );

  const stop = useCallback(async () => {
    setState((prev) => ({ ...prev, loading: true, error: null }));
    try {
      await projectsServices.stopProcess();
      await refreshStatus();
    } catch (err: any) {
      setState((prev) => ({
        ...prev,
        error: err.message || 'Failed to stop process',
      }));
    } finally {
      setState((prev) => ({ ...prev, loading: false }));
    }
  }, [refreshStatus]);

  useEffect(() => {
    refreshStatus();
  }, [refreshStatus]);

  return {
    ...state,
    start,
    stop,
    refreshStatus,
  };
};

export default useProcess;
