import { useCallback, useState } from 'react';
import { toast } from 'react-toastify';
import useCli from './useCli';
import useSecureStorage from './useSecureStorage';
import {
  useGetConnections,
  useGetSettings,
  useSetConnectionEnvVariable,
} from '../controllers';
import { Project } from '../../types/backend';

type DbtCommandType =
  | 'run'
  | 'test'
  | 'compile'
  | 'debug'
  | 'docs:generate'
  | 'docs:serve'
  | 'deps';

interface UseDbtReturn {
  run: (project: Project, path?: string) => Promise<void>;
  test: (project: Project, path?: string) => Promise<void>;
  compile: (project: Project, path?: string) => Promise<void>;
  debug: (project: Project) => Promise<void>;
  docsGenerate: (project: Project) => Promise<void>;
  docsServe: (project: Project) => Promise<void>;
  deps: (project: Project) => Promise<void>;
  stopCurrentCommand: () => void;
  isRunning: boolean;
  activeCommand: DbtCommandType | null;
}

const useDbt = (successCallback?: () => void): UseDbtReturn => {
  const { data: settings } = useGetSettings();
  const { runCommand, stopCommand, isRunning } = useCli();
  const { data: connections = [] } = useGetConnections();
  const {
    getDatabaseUsername,
    getDatabasePassword,
    getDatabaseToken,
    getBigQueryServiceAccountKey,
  } = useSecureStorage();
  const setEnvVariables = useSetConnectionEnvVariable();

  const [activeCommand, setActiveCommand] = useState<DbtCommandType | null>(
    null,
  );

  // Setup environment variables for connection
  const setupConnectionEnv = useCallback(
    async (connectionName: string) => {
      try {
        const [username, password, token, bigQueryKey] = await Promise.all([
          getDatabaseUsername(connectionName),
          getDatabasePassword(connectionName),
          getDatabaseToken(connectionName),
          getBigQueryServiceAccountKey(connectionName),
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

        if (bigQueryKey) {
          envPromises.push(
            setEnvVariables.mutateAsync({
              key: `db-bigquery-${connectionName}`,
              value: bigQueryKey,
            }),
          );
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
      getBigQueryServiceAccountKey,
      setEnvVariables,
    ],
  );

  // Build command string
  const buildCommand = useCallback(
    (command: DbtCommandType, project: Project, args: string = '') => {
      if (!settings?.dbtPath) {
        throw new Error('DBT path not configured in settings');
      }

      switch (command) {
        case 'docs:generate':
          return `cd "${project.path}" && "${settings.dbtPath}" docs generate`;
        case 'docs:serve':
          return `cd "${project.path}" && "${settings.dbtPath}" docs serve`;
        default:
          return `cd "${project.path}" && "${settings.dbtPath}" ${command} ${args}`.trim();
      }
    },
    [settings?.dbtPath],
  );

  // Execute DBT command
  const executeCommand = useCallback(
    async (
      command: DbtCommandType,
      project: Project,
      args: string = '',
      options: { showToast?: boolean } = { showToast: true },
    ) => {
      if (isRunning) {
        if (options.showToast) {
          toast.warning('Another dbt command is currently running');
        }
        return;
      }

      try {
        // Check if DBT path is configured
        if (!settings?.dbtPath) {
          if (options.showToast) {
            toast.error(
              'DBT path not configured in settings. Please configure it in settings.',
            );
          }
          return;
        }

        // Find connection
        const connection = connections.find(
          (c) => c.id === project.connectionId,
        );
        if (!connection) {
          if (options.showToast) {
            toast.error(
              'No database connection configured for this project. Please add a connection first.',
            );
          }
          return;
        }

        setActiveCommand(command);

        // Setup environment variables
        await setupConnectionEnv(connection.connection.name);

        // Build command string
        const cmdString = buildCommand(command, project, args);

        // Execute command
        const result = await runCommand(cmdString);

        // Handle success
        if (result.error.length === 0) {
          if (options.showToast) {
            toast.success(`dbt ${command} completed successfully`);
          }
          successCallback?.();
        } else {
          if (options.showToast) {
            toast.error(`dbt ${command} failed`);
          }
          throw new Error(
            `Command failed with errors: ${result.error.join('\n')}`,
          );
        }
      } catch (error) {
        if (options.showToast) {
          const errorMessage =
            error instanceof Error ? error.message : 'Unknown error';
          toast.error(`dbt ${command} failed: ${errorMessage}`);
        }
        throw error;
      } finally {
        setActiveCommand(null);
      }
    },
    [
      isRunning,
      connections,
      setupConnectionEnv,
      buildCommand,
      runCommand,
      successCallback,
      settings?.dbtPath,
    ],
  );

  // Stop current command
  const stopCurrentCommand = useCallback(() => {
    if (isRunning && activeCommand) {
      stopCommand();
      setActiveCommand(null);
      toast.info(`Stopped dbt ${activeCommand}`);
    }
  }, [isRunning, activeCommand, stopCommand]);

  return {
    run: useCallback(
      (project: Project, path?: string) =>
        executeCommand('run', project, path ? `--select ${path}` : ''),
      [executeCommand],
    ),

    test: useCallback(
      (project: Project, path?: string) =>
        executeCommand('test', project, path ? `--select ${path}` : '', {
          showToast: false,
        }),
      [executeCommand],
    ),

    compile: useCallback(
      (project: Project, path?: string) =>
        executeCommand('compile', project, path ? `--select ${path}` : ''),
      [executeCommand],
    ),

    debug: useCallback(
      (project: Project) => executeCommand('debug', project),
      [executeCommand],
    ),

    docsGenerate: useCallback(
      (project: Project) => executeCommand('docs:generate', project),
      [executeCommand],
    ),

    docsServe: useCallback(
      (project: Project) => executeCommand('docs:serve', project),
      [executeCommand],
    ),

    deps: useCallback(
      (project: Project) => executeCommand('deps', project),
      [executeCommand],
    ),

    stopCurrentCommand,
    isRunning,
    activeCommand,
  };
};

export default useDbt;
