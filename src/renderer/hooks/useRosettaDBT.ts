import React from 'react';
import { toast } from 'react-toastify';
import { useCli, useSecureStorage } from './index';
import {
  useGetConnections,
  useGetSettings,
  useSetConnectionEnvVariable,
} from '../controllers';
import { Command, CommandType, Project } from '../../types/backend';
import {
  projectsServices,
  connectionStorage,
  settingsServices,
} from '../services';
import { compileCommand } from '../helpers/utils';

const useRosettaDBT = (successCallback: () => Promise<void>) => {
  const { data: settings } = useGetSettings();
  const { error, runCommand } = useCli();
  const {
    getDatabaseUsername,
    getDatabasePassword,
    getDatabaseToken,
    getBigQueryServiceAccountKey,
    getConnectionField,
    getCloudAwsSecret,
  } = useSecureStorage();
  const setEnvVariables = useSetConnectionEnvVariable();
  const [isSuccess, setIsSuccess] = React.useState(false);
  const [isRunning, setIsRunning] = React.useState(false);
  const { data: connections = [] } = useGetConnections(true);

  React.useEffect(() => {
    let isCancelled = false;

    const resetState = () => {
      setIsRunning(false);
      setIsSuccess(false);
    };

    if (!isRunning) {
      return () => {
        isCancelled = true;
      };
    }

    if (error.length > 0) {
      toast.error('Rosetta dbt command failed');
      resetState();
      return () => {
        isCancelled = true;
      };
    }

    if (isSuccess) {
      const handleSuccess = async () => {
        await successCallback();
        if (!isCancelled) {
          toast.success('Rosetta dbt completed successfully');
          resetState();
        }
      };
      handleSuccess();
    }

    return () => {
      isCancelled = true;
    };
  }, [isSuccess, error, isRunning, successCallback]);

  return {
    fn: async (project: Project, command: Command) => {
      setIsSuccess(false);
      setIsRunning(true);
      const connection = connections.find((c) => c.id === project.connectionId);
      if (!connection) {
        toast.error(
          'No database connection configured for this project. Please add a connection first.',
        );
        setIsRunning(false);
        setIsSuccess(false);
        return;
      }
      // Set environment variables for the project
      const connectionName = connection.connection.name;
      const conn = connection.connection;
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
            value: username || '',
          }),
        );
      }
      if (password) {
        envPromises.push(
          setEnvVariables.mutateAsync({
            key: `db-password-${connectionName}`,
            value: password || '',
          }),
        );
      }
      if (token) {
        envPromises.push(
          setEnvVariables.mutateAsync({
            key: `db-token-${connectionName}`,
            value: token || '',
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
      const fieldMap: Record<string, string[]> = {
        postgres: ['host', 'port', 'dbname', 'schema'],
        redshift: ['host', 'port', 'dbname', 'schema'],
        snowflake: ['account', 'warehouse', 'dbname', 'schema', 'role'],
        bigquery: ['project', 'dataset'],
        databricks: ['host', 'httppath', 'catalog', 'schema'],
        kinetica: ['host', 'port', 'dbname', 'schema'],
      };

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

      if (
        conn.type === 'duckdb' &&
        (conn as any).use_httpfs &&
        (conn as any).cloud_connection_id
      ) {
        try {
          const cloudConnections = await connectionStorage.getConnections();
          const cloudConn = cloudConnections.find(
            (cloudConnItem) =>
              cloudConnItem.id === (conn as any).cloud_connection_id,
          );
          if (cloudConn && cloudConn.provider === 'aws') {
            const region = (cloudConn.config as any)?.region;
            const keyId = (cloudConn.config as any)?.accessKeyId;
            const secret = await getCloudAwsSecret(cloudConn.id);

            if (region) {
              envPromises.push(
                setEnvVariables.mutateAsync({
                  key: `db-s3_region-${connectionName}`,
                  value: region,
                }),
              );
            }
            if (keyId) {
              envPromises.push(
                setEnvVariables.mutateAsync({
                  key: `db-s3_access_key_id-${connectionName}`,
                  value: keyId,
                }),
              );
            }
            if (secret) {
              envPromises.push(
                setEnvVariables.mutateAsync({
                  key: `db-s3_secret_access_key-${connectionName}`,
                  value: secret,
                }),
              );
            }
          }
        } catch (err) {
          // eslint-disable-next-line no-console
          console.error(
            'Failed to load cloud connection for DuckDB httpfs',
            err,
          );
        }
      }

      const openaiKey = await settingsServices.getOpenAIKey();
      if (openaiKey) {
        setEnvVariables.mutate({
          key: 'openai-api-key',
          value: openaiKey,
        });
      }

      if (!project.isExtracted) {
        try {
          const compiledCommand = await compileCommand(project, settings, {
            commandType: CommandType.Rosetta,
            command: 'extract',
            arguments: new Map<string, string | number>().set(
              '-s',
              `${project.rosettaConnection?.name}`,
            ),
          } as Command);
          await runCommand(compiledCommand);
          await projectsServices.updateProject({
            ...project,
            isExtracted: true,
          });
          toast.info('Schema extracted, now generating dbt...');
        } catch (err) {
          toast.error('Schema extraction failed');
          setIsRunning(false);
          return;
        }
      }
      const compiledCommand = await compileCommand(project, settings, command);
      await runCommand(compiledCommand);
      setIsSuccess(true);
    },
    isRunning,
  };
};

export default useRosettaDBT;
