import React from 'react';
import { toast } from 'react-toastify';
import { useCli } from './index';
import { useGetSettings, useSetConnectionEnvVariable } from '../controllers';
import { Project } from '../../types/backend';
import { settingsServices } from '../services';
import {
  getDatabasePassword,
  getDatabaseUsername,
} from '../services/settings.services';

const useRosettaExtract = (successCallback: () => void) => {
  const { data: settings } = useGetSettings();
  const { error, runCommand, isSuccess } = useCli();
  const setEnvVariables = useSetConnectionEnvVariable();
  const [isRunning, setIsRunning] = React.useState(false);

  React.useEffect(() => {
    if (!isRunning) return;
    if (error.length > 0) {
      toast.error('Extract command failed');
      setIsRunning(false);
      return;
    }
    if (isSuccess) {
      toast.success('Extract completed successfully');
      setIsRunning(false);
      successCallback();
    }
  }, [isSuccess, error]);

  return {
    fn: async (project: Project) => {
      setIsRunning(true);
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
