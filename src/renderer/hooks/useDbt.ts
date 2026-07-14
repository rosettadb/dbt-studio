import React, { useCallback, useState } from 'react';
import { toast } from 'react-toastify';
import useCli from './useCli';
import useSecureStorage from './useSecureStorage';
import {
  useApiKey,
  useGetConnections,
  useGetSettings,
  useCheckProjectAdapterCompatibility,
  useSetConnectionEnvVariable,
} from '../controllers';
import { Project, DbtCommandType, ConnectionInput } from '../../types/backend';
import { useAppContext } from './index';
import { extractCliErrorDetails } from '../utils/dbtCommandResult';

interface UseDbtReturn {
  run: (project: Project, path?: string) => Promise<void>;
  test: (project: Project, path?: string) => Promise<void>;
  compile: (project: Project, path?: string) => Promise<string>;
  compileProject: (project: Project, path?: string) => Promise<void>;
  build: (project: Project, path?: string) => Promise<void>;
  list: (project: Project) => Promise<string>;
  debug: (project: Project) => Promise<void>;
  docsGenerate: (project: Project) => Promise<void>;
  docsServe: (project: Project) => Promise<void>;
  deps: (project: Project) => Promise<void>;
  clean: (project: Project) => Promise<void>;
  seed: (project: Project, path?: string) => Promise<void>;
  stopCurrentCommand: () => void;
  isRunning: boolean;
  activeCommand: DbtCommandType | null;
}

const useDbt = (
  successCallback?: () => void,
  cloudRunCb?: (command: DbtCommandType) => void,
): UseDbtReturn => {
  const { data: settings } = useGetSettings();
  const { data: apiKey } = useApiKey();

  const { env: environment } = useAppContext();

  const { runCommand, stopCommand, isRunning } = useCli();
  const { data: connections = [] } = useGetConnections(true);
  const {
    getDatabaseUsername,
    getDatabasePassword,
    getDatabaseToken,
    getBigQueryServiceAccountKey,
    getConnectionField,
  } = useSecureStorage();
  const setEnvVariables = useSetConnectionEnvVariable();
  const checkProjectAdapterCompatibility =
    useCheckProjectAdapterCompatibility();

  const env = React.useMemo(() => {
    return apiKey ? environment : 'local';
  }, [apiKey, environment]);

  const [activeCommand, setActiveCommand] = useState<DbtCommandType | null>(
    null,
  );

  // Setup environment variables for connection
  const setupConnectionEnv = useCallback(
    async (connectionName: string, conn?: ConnectionInput) => {
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

        // Set connection-specific fields based on type
        if (conn) {
          const fieldMap: Record<string, string[]> = {
            postgres: ['host', 'port', 'dbname', 'schema'],
            redshift: ['host', 'port', 'dbname', 'schema'],
            snowflake: ['account', 'warehouse', 'dbname', 'schema', 'role'],
            bigquery: ['project', 'dataset'],
            databricks: ['host', 'httppath', 'catalog', 'schema'],
            kinetica: ['host', 'port', 'dbname', 'schema'],
          };

          // Map field names to connection object values for fallback
          const c = conn as any;
          const getFieldValue = (field: string): string | undefined => {
            const valueMap: Record<string, string | undefined> = {
              host: c.host ? String(c.host) : undefined,
              port: c.port ? String(c.port) : undefined,
              dbname: c.database,
              schema: c.schema,
              account: c.account,
              warehouse: c.warehouse,
              role: c.role,
              project: c.project,
              dataset: c.dataset || c.schema,
              httppath: c.httpPath,
              catalog: c.database,
            };
            return valueMap[field];
          };

          const fields = fieldMap[conn.type] || [];
          const fieldPromises = fields.map(async (field) => {
            // Try secure storage first, fall back to connection model
            const stored = await getConnectionField(field, connectionName);
            const value = stored || getFieldValue(field);
            if (value) {
              return setEnvVariables.mutateAsync({
                key: `db-${field}-${connectionName}`,
                value,
              });
            }
            return undefined;
          });
          envPromises.push(...fieldPromises);
        }

        await Promise.all(envPromises);
      } catch (error) {
        toast.info(`Failed to setup environment variables: ${error}`);
      }
    },
    [
      getDatabaseUsername,
      getDatabasePassword,
      getDatabaseToken,
      getBigQueryServiceAccountKey,
      getConnectionField,
      setEnvVariables,
    ],
  );

  // Build command string
  const buildCommand = useCallback(
    (command: DbtCommandType, project: Project, args: string = '') => {
      if (!settings?.dbtPath) {
        // maybe this should be dbt (trademark) core path
        toast.info('dbt Core™ path not configured in settings');
        return '';
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
      if (env === 'cloud') {
        setActiveCommand(command);
        cloudRunCb?.(command);
        return;
      }

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

        const adapterCheck = await checkProjectAdapterCompatibility(
          project.path,
        );
        if (!adapterCheck.adapter.canExecute) {
          if (options.showToast) toast.error(adapterCheck.adapter.notes);
          return;
        }

        setActiveCommand(command);

        // Setup environment variables
        await setupConnectionEnv(
          connection.connection.name,
          connection.connection,
        );

        // Build command string
        const cmdString = buildCommand(command, project, args);
        if (!cmdString) {
          // buildCommand already toasted; nothing to execute
          return;
        }

        // Execute command
        const result = await runCommand(cmdString);
        const aggregatedError = extractCliErrorDetails(
          result.output,
          result.error,
          result.exitCode,
        );

        // Handle success vs failure
        if (aggregatedError.length === 0) {
          if (options.showToast) {
            toast.success(`dbt ${command} completed successfully`);
          }
          successCallback?.();
        } else if (options.showToast) {
          toast.error(`Command failed: ${aggregatedError.join('\n')}`);
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
      settings?.dbtVersion,
      checkProjectAdapterCompatibility,
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
          showToast: true,
        }),
      [executeCommand],
    ),

    compile: useCallback(
      async (project: Project, path?: string) => {
        try {
          // Find connection
          const connection = connections.find(
            (c) => c.id === project.connectionId,
          );
          if (!connection) {
            toast.info('Connection not found');
            return '';
          }

          const adapterCheck = await checkProjectAdapterCompatibility(
            project.path,
          );
          if (!adapterCheck.adapter.canExecute) {
            toast.error(adapterCheck.adapter.notes);
            return '';
          }

          setActiveCommand('compile');

          // Setup environment variables
          await setupConnectionEnv(
            connection.connection.name,
            connection.connection,
          );

          // Build command string
          const cmdString = buildCommand(
            'compile',
            project,
            path ? `--select ${path}` : '',
          );
          if (!cmdString) {
            return '';
          }

          // Execute command and capture output
          const result = await runCommand(cmdString);

          // Detect failure via stderr forwarded to stdout or non-zero exit code indicator
          const aggregatedError = extractCliErrorDetails(
            result.output,
            result.error,
            result.exitCode,
          );
          if (aggregatedError.length === 0) {
            // Extract the compiled SQL from the output
            let compiledSql = '';

            // Split the output into lines and filter out the command
            const fullOutput = result.output.join('\n');
            const lines = fullOutput.split('\n');

            // Filter out the command line and find the SQL block
            const dbtOutputLines = lines.filter(
              (line) =>
                !line.includes('cd "') &&
                !line.includes('&&') &&
                !line.includes('dbt" compile'),
            );

            // Find the SQL block between "Compiled node ... is:" and the next warning
            let inSqlBlock = false;
            const sqlLines: string[] = [];

            for (let i = 0; i < dbtOutputLines.length; i += 1) {
              const line = dbtOutputLines[i].replace(/\[[0-9;]*m/g, ''); // Remove ANSI codes

              if (line.includes("Compiled node '") && line.includes(' is:')) {
                inSqlBlock = true;
              } else if (inSqlBlock) {
                // Stop at warning patterns or timestamp, but not at empty lines within SQL
                if (
                  line.includes('[WARNING]') ||
                  line.includes('DeprecationsSummary') ||
                  line.includes('Deprecated') ||
                  line.match(/^\d{2}:\d{2}:\d{2}/)
                ) {
                  break;
                }
                // Only add non-empty lines or lines that are part of SQL
                if (line.trim() !== '' || sqlLines.length > 0) {
                  sqlLines.push(line);
                }
              }
            }

            compiledSql = sqlLines.join('\n');
            const finalResult = compiledSql.trim();

            if (!finalResult) {
              toast.info('Failed to extract compiled SQL from dbt output');
              return '';
            }

            return finalResult;
          }
          toast.info(`dbt compile failed: ${aggregatedError.join('\n')}`);
          return '';
        } catch (error) {
          const errorMessage =
            error instanceof Error ? error.message : 'Unknown error';
          toast.error(`dbt compile failed: ${errorMessage}`);
          throw error;
        } finally {
          setActiveCommand(null);
        }
      },
      [
        connections,
        setupConnectionEnv,
        buildCommand,
        runCommand,
        settings?.dbtVersion,
        checkProjectAdapterCompatibility,
      ],
    ),

    compileProject: useCallback(
      (project: Project, path?: string) =>
        executeCommand('compile', project, path ? `--select ${path}` : ''),
      [executeCommand],
    ),

    build: useCallback(
      (project: Project, path?: string) =>
        executeCommand('build', project, path ? `--select ${path}` : ''),
      [executeCommand],
    ),

    list: useCallback(
      async (project: Project) => {
        try {
          const connection = connections.find(
            (c) => c.id === project.connectionId,
          );
          if (!connection) {
            toast.info('Connection not found');
            return '';
          }

          const adapterCheck = await checkProjectAdapterCompatibility(
            project.path,
          );
          if (!adapterCheck.adapter.canExecute) {
            toast.error(adapterCheck.adapter.notes);
            return '';
          }

          setActiveCommand('list');
          await setupConnectionEnv(
            connection.connection.name,
            connection.connection,
          );
          const cmdString = buildCommand('list', project, '');
          if (!cmdString) {
            return '';
          }
          const result = await runCommand(cmdString);

          const aggregatedError = extractCliErrorDetails(
            result.output,
            result.error,
            result.exitCode,
          );
          if (aggregatedError.length === 0) {
            return result.output.join('\n');
          }
          toast.info(`dbt list failed: ${aggregatedError.join('\n')}`);
          return '';
        } catch (error) {
          const errorMessage =
            error instanceof Error ? error.message : 'Unknown error';
          toast.info(`dbt list failed: ${errorMessage}`);
          return '';
        } finally {
          setActiveCommand(null);
        }
      },
      [
        connections,
        setupConnectionEnv,
        buildCommand,
        runCommand,
        settings?.dbtVersion,
        checkProjectAdapterCompatibility,
      ],
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

    clean: useCallback(
      (project: Project) => executeCommand('clean', project),
      [executeCommand],
    ),

    seed: useCallback(
      (project: Project, path?: string) =>
        executeCommand('seed', project, path ? `--select ${path}` : ''),
      [executeCommand],
    ),

    stopCurrentCommand,
    isRunning,
    activeCommand,
  };
};

export default useDbt;
