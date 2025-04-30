import React from 'react';
import { toast } from 'react-toastify';
import { useCli } from './index';
import { useGetSettings } from '../controllers';
import { Project } from '../../types/backend';
import { projectsServices, settingsServices } from '../services';

const useRosettaDBT = (successCallback: () => void) => {
  const { data: settings } = useGetSettings();
  const { error, runCommand } = useCli();
  const [isSuccess, setIsSuccess] = React.useState(false);
  const [isRunning, setIsRunning] = React.useState(false);

  React.useEffect(() => {
    if (!isRunning) return;
    if (error.length > 0) {
      toast.error('Rosetta dbt command failed');
      setIsRunning(false);
      return;
    }
    if (isSuccess) {
      toast.success('Rosetta dbt completed successfully');
      successCallback();
      setIsRunning(false);
    }
  }, [isSuccess, error]);

  return {
    fn: async (project: Project, incremental = '') => {
      setIsRunning(true);
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
