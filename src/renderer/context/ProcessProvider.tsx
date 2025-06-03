import React, { createContext, useCallback, useEffect, useState } from 'react';
import { projectsServices } from '../services';

type ProcessState = {
  output: string[];
  error: string[];
  running: boolean;
  pid: number | null;
  loading: boolean;
  errorMessage: string | null;
};

export type ProcessContextType = ProcessState & {
  start: (command: string) => Promise<void>;
  stop: () => Promise<void>;
  refreshStatus: () => Promise<void>;
};

export const ProcessContext = createContext<ProcessContextType | undefined>(
  undefined,
);

export const ProcessProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [state, setState] = useState<ProcessState>({
    output: [],
    error: [],
    running: false,
    pid: null,
    loading: false,
    errorMessage: null,
  });

  const refreshStatus = useCallback(async () => {
    try {
      const status = await projectsServices.getProcessStatus();
      setState((prev) => ({
        ...prev,
        running: status.running,
        pid: status.pid,
        errorMessage: null,
      }));
    } catch (err: any) {
      setState((prev) => ({
        ...prev,
        errorMessage: err.message || 'Failed to get process status',
      }));
    }
  }, []);

  const start = useCallback(
    async (command: string) => {
      setState((prev) => ({
        ...prev,
        loading: true,
        errorMessage: null,
        output: [],
        error: [],
      }));
      try {
        await projectsServices.startProcess(command);
        await refreshStatus();
      } catch (err: any) {
        setState((prev) => ({
          ...prev,
          errorMessage: err.message || 'Failed to start process',
        }));
      } finally {
        setState((prev) => ({ ...prev, loading: false }));
      }
    },
    [refreshStatus],
  );

  const stop = useCallback(async () => {
    setState((prev) => ({ ...prev, loading: true, errorMessage: null }));
    try {
      await projectsServices.stopProcess();
      await refreshStatus();
    } catch (err: any) {
      setState((prev) => ({
        ...prev,
        errorMessage: err.message || 'Failed to stop process',
      }));
    } finally {
      setState((prev) => ({ ...prev, loading: false }));
    }
  }, [refreshStatus]);

  useEffect(() => {
    refreshStatus();

    const handleOutput = (msg: any) => {
      setState((prev) => ({
        ...prev,
        output: [...prev.output, msg],
      }));
    };

    const handleError = (msg: any) => {
      setState((prev) => ({
        ...prev,
        error: [...prev.error, msg],
      }));
    };

    window.electron.ipcRenderer.on('process:output', handleOutput);
    window.electron.ipcRenderer.on('process:error', handleError);

    return () => {
      window.electron.ipcRenderer.removeListener(
        'process:output',
        handleOutput,
      );
      window.electron.ipcRenderer.removeListener('process:error', handleError);
    };
  }, [refreshStatus]);

  const contextValue: ProcessContextType = React.useMemo(
    () => ({
      ...state,
      start,
      stop,
      refreshStatus,
    }),
    [stop, start, state.output, state.running, state.error],
  );

  return (
    <ProcessContext.Provider value={contextValue}>
      {children}
    </ProcessContext.Provider>
  );
};
