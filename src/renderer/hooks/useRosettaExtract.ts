import React from 'react';
import { toast } from 'react-toastify';
import { useCli, useSecureStorage } from './index';
import { useGetSettings, useSetConnectionEnvVariable } from '../controllers';
import { Project } from '../../types/backend';
import { settingsServices } from '../services';

const useRosettaExtract = () => {
  const {
    getDatabaseUsername,
    getDatabasePassword,
    getDatabaseToken,
    getBigQueryServiceAccountKey,
  } = useSecureStorage();
  const { data: settings } = useGetSettings();
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
      // Set environment variables for the project
      const secureUserName = await getDatabaseUsername(project.name);
      if (secureUserName) {
        setEnvVariables.mutate({
          key: `db-user-${project.name}`,
          value: secureUserName || '',
        });
      }
      const securePassword = await getDatabasePassword(project.name);
      if (securePassword) {
        setEnvVariables.mutate({
          key: `db-password-${project.name}`,
          value: securePassword || '',
        });
      }
      const secureToken = await getDatabaseToken(project.name);
      if (secureToken) {
        setEnvVariables.mutate({
          key: `db-token-${project.name}`,
          value: secureToken || '',
        });
      }
      const bigQueryKey = await getBigQueryServiceAccountKey(project.name);
      if (bigQueryKey) {
        setEnvVariables.mutate({
          key: `db-bigquery-${project.name}`,
          value: bigQueryKey,
        });
      }

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
