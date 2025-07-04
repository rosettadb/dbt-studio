import React from 'react';
import { toast } from 'react-toastify';
import { useCli } from './index';
import { useGetSettings, useSetConnectionEnvVariable } from '../controllers';
import { Project } from '../../types/backend';
import { projectsServices, settingsServices } from '../services';
import {
  getDatabasePassword,
  getDatabaseUsername,
} from '../services/settings.services';

const useRosettaDBT = (successCallback: () => Promise<void>) => {
  const { data: settings } = useGetSettings();
  const { error, runCommand } = useCli();
  const setEnvVariables = useSetConnectionEnvVariable();
  const [isSuccess, setIsSuccess] = React.useState(false);
  const [isRunning, setIsRunning] = React.useState(false);

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
