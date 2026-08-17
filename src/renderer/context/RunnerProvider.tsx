import React, {
  createContext,
  useCallback,
  useEffect,
  useRef,
  useState,
  ReactNode,
} from 'react';
import { useSecureStorage } from '../hooks';
import { useSetConnectionEnvVariable } from '../controllers';

export interface RunnerLogEntry {
  message: string;
  isError: boolean;
}

interface RunnerState {
  // stdout and stderr are stored in a single array, in arrival order - kept
  // separate they'd have to be re-merged for display, which loses the actual
  // interleaving between output and error lines.
  logs: RunnerLogEntry[];
  isRunning: boolean;
  pid: number | null;
  startTime: number | null;
  duration: number | null;
  status: 'starting' | 'running' | 'stopping' | 'stopped';
}

export interface RunPipelineLocallyParams {
  workspaceDir: string;
  pipelineFile: string;
  runTeardown?: boolean;
  connectionName?: string;
  connType?: string;
}

export interface RunnerContextValue extends RunnerState {
  run: (
    params: RunPipelineLocallyParams,
  ) => Promise<{ success: boolean; taskId?: string; error?: string }>;
  stop: () => Promise<{ success: boolean; message?: string }>;
  clearOutput: () => void;
}

export const RunnerContext = createContext<RunnerContextValue | null>(null);

interface RunnerProviderProps {
  children: ReactNode;
}

// Mirrors ProcessProvider, but targets the local runner's dedicated
// 'runner:*' IPC channels so a pipeline run never mixes output with the
// shared 'process:*' slot used by "Serve Docs".
export const RunnerProvider: React.FC<RunnerProviderProps> = ({ children }) => {
  const {
    getDatabaseUsername,
    getDatabasePassword,
    getDatabaseToken,
    getConnectionField,
  } = useSecureStorage();
  const setEnvVariables = useSetConnectionEnvVariable();

  const [state, setState] = useState<RunnerState>({
    logs: [],
    isRunning: false,
    pid: null,
    startTime: null,
    duration: null,
    status: 'stopped',
  });

  // eslint-disable-next-line no-undef
  const durationIntervalRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    const handleOutput = (msg: any) => {
      setState((prev) => ({
        ...prev,
        logs: [...prev.logs, { message: msg, isError: false }],
      }));
    };

    const handleError = (msg: any) => {
      setState((prev) => ({
        ...prev,
        logs: [...prev.logs, { message: msg, isError: true }],
      }));
    };

    const handleStarted = (info: any) => {
      setState((prev) => ({
        ...prev,
        isRunning: true,
        pid: info.pid,
        startTime: info.startTime,
        status: 'running',
      }));

      if (durationIntervalRef.current) {
        clearInterval(durationIntervalRef.current);
      }
      durationIntervalRef.current = setInterval(() => {
        setState((prev) =>
          prev.startTime
            ? { ...prev, duration: Date.now() - prev.startTime }
            : prev,
        );
      }, 1000);
    };

    const handleExit = () => {
      setState((prev) => ({ ...prev, status: 'stopped' }));
    };

    const handleDone = () => {
      setState((prev) => ({ ...prev, isRunning: false, status: 'stopped' }));
      if (durationIntervalRef.current) {
        clearInterval(durationIntervalRef.current);
        durationIntervalRef.current = null;
      }
    };

    const unsubOutput = window.electron.ipcRenderer.on(
      'runner:output',
      handleOutput,
    );
    const unsubError = window.electron.ipcRenderer.on(
      'runner:error',
      handleError,
    );
    const unsubStarted = window.electron.ipcRenderer.on(
      'runner:started',
      handleStarted,
    );
    const unsubExit = window.electron.ipcRenderer.on('runner:exit', handleExit);
    const unsubDone = window.electron.ipcRenderer.on('runner:done', handleDone);

    return () => {
      if (typeof unsubOutput === 'function') unsubOutput();
      if (typeof unsubError === 'function') unsubError();
      if (typeof unsubStarted === 'function') unsubStarted();
      if (typeof unsubExit === 'function') unsubExit();
      if (typeof unsubDone === 'function') unsubDone();

      if (durationIntervalRef.current) {
        clearInterval(durationIntervalRef.current);
      }
    };
  }, []);

  // Same connection-credential-into-env-vars flow the local dbt/docs-serve
  // runs use, so the runner's dbt@v1 plugin step can connect - unlike
  // ProcessProvider.start this is awaited before spawning so the vars are
  // guaranteed present in process.env by the time the runner inherits it.
  const setupConnectionEnv = useCallback(
    async (connectionName?: string, connType?: string) => {
      if (!connectionName) return;
      try {
        const [username, password, token] = await Promise.all([
          getDatabaseUsername(connectionName),
          getDatabasePassword(connectionName),
          getDatabaseToken(connectionName),
        ]);

        const envPromises = [];

        if (username) {
          envPromises.push(
            setEnvVariables.mutateAsync({
              key: `db-user-${connectionName}`,
              value: username,
            }),
          );
        }
        if (password) {
          envPromises.push(
            setEnvVariables.mutateAsync({
              key: `db-password-${connectionName}`,
              value: password,
            }),
          );
        }
        if (token) {
          envPromises.push(
            setEnvVariables.mutateAsync({
              key: `db-token-${connectionName}`,
              value: token,
            }),
          );
        }

        if (connType) {
          const fieldMap: Record<string, string[]> = {
            postgres: ['host', 'port', 'dbname', 'schema'],
            redshift: ['host', 'port', 'dbname', 'schema'],
            snowflake: ['account', 'warehouse', 'dbname', 'schema', 'role'],
            bigquery: ['project', 'dataset'],
            databricks: ['host', 'httppath', 'catalog', 'schema'],
            kinetica: ['host', 'port', 'dbname', 'schema'],
          };
          const fields = fieldMap[connType] || [];
          const fieldPromises = fields.map(async (field) => {
            const stored = await getConnectionField(field, connectionName);
            if (stored) {
              return setEnvVariables.mutateAsync({
                key: `db-${field}-${connectionName}`,
                value: stored,
              });
            }
            return undefined;
          });
          envPromises.push(...fieldPromises);
        }

        await Promise.all(envPromises);
      } catch (error) {
        throw new Error(`Failed to setup environment variables: ${error}`);
      }
    },
    [
      getDatabaseUsername,
      getDatabasePassword,
      getDatabaseToken,
      getConnectionField,
      setEnvVariables,
    ],
  );

  const run = useCallback(
    async (params: RunPipelineLocallyParams) => {
      // Clear out the previous run's log lines so the log viewer starts
      // fresh - otherwise old and new output run together in the same view.
      setState((prev) => ({ ...prev, logs: [] }));
      try {
        await setupConnectionEnv(params.connectionName, params.connType);
        return await window.electron.ipcRenderer.invoke('runner:run', {
          workspaceDir: params.workspaceDir,
          pipelineFile: params.pipelineFile,
          runTeardown: params.runTeardown,
        });
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : String(error),
        };
      }
    },
    [setupConnectionEnv],
  );

  const stop = useCallback(async () => {
    setState((prev) => ({ ...prev, status: 'stopping' }));
    try {
      return await window.electron.ipcRenderer.invoke('runner:stop');
    } catch (error) {
      setState((prev) => ({ ...prev, status: 'stopped' }));
      return {
        success: false,
        message: error instanceof Error ? error.message : String(error),
      };
    }
  }, []);

  const clearOutput = useCallback(() => {
    setState((prev) => ({ ...prev, logs: [] }));
  }, []);

  // eslint-disable-next-line react/jsx-no-constructed-context-values
  const contextValue: RunnerContextValue = {
    ...state,
    run,
    stop,
    clearOutput,
  };

  return (
    <RunnerContext.Provider value={contextValue}>
      {children}
    </RunnerContext.Provider>
  );
};
