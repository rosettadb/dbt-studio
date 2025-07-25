import React from 'react';
import { toast } from 'react-toastify';
import { useCli, useSecureStorage } from './index';
import {
  useGetConnections,
  useGetSettings,
  useSetConnectionEnvVariable,
} from '../controllers';
import { Project } from '../../types/backend';
import { projectsServices, settingsServices } from '../services';
import { getOpenAIKey } from '../services/settings.services';

const useRosettaDBT = (successCallback: () => Promise<void>) => {
  const { data: settings } = useGetSettings();
  const { error, runCommand } = useCli();
  const {
    getDatabaseUsername,
    getDatabasePassword,
    getDatabaseToken,
    getBigQueryServiceAccountKey,
  } = useSecureStorage();
  const setEnvVariables = useSetConnectionEnvVariable();
  const [isSuccess, setIsSuccess] = React.useState(false);
  const [isRunning, setIsRunning] = React.useState(false);
  const { data: connections = [] } = useGetConnections();

  React.useEffect(() => {
    if (!isRunning) return;
    if (error.length > 0) {
      toast.error('Rosetta dbt command failed');
      setIsRunning(false);
      return;
    }
    const handleSuccess = async () => {
      await successCallback();
      toast.success('Rosetta dbt completed successfully');
      setIsRunning(false);
    };
    if (isSuccess) {
      handleSuccess();
    }
  }, [isSuccess, error]);

  return {
    fn: async (project: Project, incremental = '') => {
      setIsRunning(true);
      const connection = connections.find((c) => c.id === project.connectionId);
      if (!connection) {
        toast.error('Connection not found!');
        setIsRunning(false);
        setIsSuccess(false);
        return;
      }
      // Set environment variables for the project
      const connectionName = connection.connection.name;
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

      const openaiKey = await getOpenAIKey();
      if (openaiKey) {
        setEnvVariables.mutate({
          key: 'openai-api-key',
          value: openaiKey,
        });
      }

      const projectPath = await settingsServices.usePathJoin(
        project.path,
        'rosetta',
      );

      if (!project.isExtracted) {
        try {
          await runCommand(
            `cd "${projectPath}" && "${settings?.rosettaPath}" extract -s ${project.rosettaConnection?.name}`,
          );
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

      await runCommand(
        `cd "${projectPath}" && "${settings?.rosettaPath}" dbt ${incremental} -s ${project.rosettaConnection?.name}`,
      );
      setIsSuccess(true);
    },
    isRunning,
  };
};

export default useRosettaDBT;
