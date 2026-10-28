import React from 'react';
import { toast } from 'react-toastify';
import {
  envFieldValueFor,
  getConnectionUi,
} from '../../connections/registry.renderer';
import { useCli, useSecureStorage } from './index';
import {
  useGetSettings,
  useSetConnectionEnvVariable,
  useGetConnections,
} from '../controllers';
import { Project } from '../../types/backend';
import { path } from '../lib/path';

const useRosettaExtract = () => {
  const {
    getDatabaseUsername,
    getDatabasePassword,
    getDatabaseToken,
    getBigQueryServiceAccountKey,
    getConnectionField,
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

      const fields = getConnectionUi(conn.type)?.envFields ?? [];
      const fieldPromises = fields.map(async (field) => {
        const stored = await getConnectionField(field, connectionName);
        const value = stored || envFieldValueFor(conn as any, field);
        if (value) {
          return setEnvVariables.mutateAsync({
            key: `db-${field}-${connectionName}`,
            value,
          });
        }
        return undefined;
      });
      envPromises.push(...fieldPromises);

      await Promise.all(envPromises);

      const projectPath = path.join(project.path, 'rosetta');
      await runCommand(
        `cd "${projectPath}" && "${settings?.rosettaPath}" extract -s ${project.rosettaConnection?.name}`,
      );
    },
    isRunning,
  };
};

export default useRosettaExtract;
