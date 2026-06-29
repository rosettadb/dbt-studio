import React from 'react';
import { toast } from 'react-toastify';
import { useCli, useSecureStorage } from './index';
import {
  useGetSettings,
  useSetConnectionEnvVariable,
  useGetConnections,
} from '../controllers';
import { Project } from '../../types/backend';
import { settingsServices, connectionStorage } from '../services';

const useRosettaExtract = () => {
  const {
    getDatabaseUsername,
    getDatabasePassword,
    getDatabaseToken,
    getBigQueryServiceAccountKey,
    getConnectionField,
    getCloudAwsSecret,
  } = useSecureStorage();
  const { data: settings } = useGetSettings();
  const { data: connections = [] } = useGetConnections(true);
  const { error, runCommand } = useCli();
  const setEnvVariables = useSetConnectionEnvVariable();
  const [isRunning, setIsRunning] = React.useState(false);

  React.useEffect(() => {
    if (!isRunning) return;
    if (error.length > 0) {
      toast.error('Extract command failed');
      setIsRunning(false);
    }
  }, [error]);

  return {
    fn: async (project: Project) => {
      setIsRunning(true);

      // Check if connection exists
      const connection = connections.find((c) => c.id === project.connectionId);
      if (!connection) {
        toast.error(
          'No database connection configured for this project. Please add a connection first.',
        );
        setIsRunning(false);
        return;
      }

      // Set environment variables for the project using connection name
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

      await Promise.all(envPromises);

      const projectPath = await settingsServices.usePathJoin(
        project.path,
        'rosetta',
      );
      await runCommand(
        `cd "${projectPath}" && "${settings?.rosettaPath}" extract -s ${project.rosettaConnection?.name}`,
      );
    },
    isRunning,
  };
};

export default useRosettaExtract;
