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

interface ProcessState {
  output: string[];
  error: string[];
  isRunning: boolean;
  pid: number | null;
  command: string | null;
  startTime: number | null;
  duration: number | null;
  status: 'starting' | 'running' | 'stopping' | 'stopped';
}

export interface ProcessContextValue extends ProcessState {
  start: (
    command: string,
    connectionName: string,
  ) => Promise<{ success: boolean; error?: string }>;
  stop: (
    force?: boolean,
  ) => Promise<{ success: boolean; message?: string; error?: string }>;
  forceStop: () => Promise<{
    success: boolean;
    message?: string;
    error?: string;
  }>;
  clearOutput: () => void;
  getStatus: () => Promise<any>;
}

export const ProcessContext = createContext<ProcessContextValue | null>(null);

interface ProcessProviderProps {
  children: ReactNode;
}

export const ProcessProvider: React.FC<ProcessProviderProps> = ({
  children,
}) => {
  const {
    getDatabaseUsername,
    getDatabasePassword,
    getDatabaseToken,
    getConnectionField,
  } = useSecureStorage();
  const setEnvVariables = useSetConnectionEnvVariable();

  const [state, setState] = useState<ProcessState>({
    output: [],
    error: [],
    isRunning: false,
    pid: null,
    command: null,
    startTime: null,
    duration: null,
    status: 'stopped',
  });

  // eslint-disable-next-line no-undef
  const durationIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Setup event listeners
  useEffect(() => {
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

    const handleStarted = (info: any) => {
      setState((prev) => ({
        ...prev,
        isRunning: true,
        pid: info.pid,
        command: info.command,
        startTime: info.startTime,
        status: 'running',
      }));

      // Start duration counter
      if (durationIntervalRef.current) {
        clearInterval(durationIntervalRef.current);
      }
      durationIntervalRef.current = setInterval(() => {
        setState((prev) =>
          prev.startTime
            ? {
                ...prev,
                duration: Date.now() - prev.startTime,
              }
            : prev,
        );
      }, 1000);
    };

    const handleExit = () => {
      setState((prev) => ({
        ...prev,
        status: 'stopped',
      }));
    };

    const handleDone = () => {
      setState((prev) => ({
        ...prev,
        isRunning: false,
        status: 'stopped',
      }));

      // Clear duration counter
      if (durationIntervalRef.current) {
        clearInterval(durationIntervalRef.current);
        durationIntervalRef.current = null;
      }
    };

    // Setup listeners
    const unsubOutput = window.electron.ipcRenderer.on(
      'process:output',
      handleOutput,
    );
    const unsubError = window.electron.ipcRenderer.on(
      'process:error',
      handleError,
    );
    const unsubStarted = window.electron.ipcRenderer.on(
      'process:started',
      handleStarted,
    );
    const unsubExit = window.electron.ipcRenderer.on(
      'process:exit',
      handleExit,
    );
    const unsubDone = window.electron.ipcRenderer.on(
      'process:done',
      handleDone,
    );

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

  const setupConnectionEnv = useCallback(
    async (connectionName: string, connType?: string) => {
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

        // Set connection-specific fields based on type
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

  const start = useCallback(async (command: string, connectionName: string) => {
    setupConnectionEnv(connectionName);
    return window.electron.ipcRenderer.invoke('process:start', { command });
  }, []);

  const stop = useCallback(async (force: boolean = false) => {
    setState((prev) => ({ ...prev, status: 'stopping' }));
    return window.electron.ipcRenderer.invoke('process:stop', { force });
  }, []);

  const forceStop = useCallback(async () => {
    setState((prev) => ({ ...prev, status: 'stopping' }));
    return window.electron.ipcRenderer.invoke('process:forceStop');
  }, []);

  const clearOutput = useCallback(() => {
    setState((prev) => ({
      ...prev,
      output: [],
      error: [],
    }));
  }, []);

  const getStatus = useCallback(async () => {
    return window.electron.ipcRenderer.invoke('process:status');
  }, []);

  // eslint-disable-next-line react/jsx-no-constructed-context-values
  const contextValue: ProcessContextValue = {
    ...state,
    start,
    stop,
    forceStop,
    clearOutput,
    getStatus,
  };

  return (
    <ProcessContext.Provider value={contextValue}>
      {children}
    </ProcessContext.Provider>
  );
};
