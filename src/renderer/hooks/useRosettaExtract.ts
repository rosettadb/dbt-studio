import React from 'react';
import { toast } from 'react-toastify';
import { useCli } from './index';
import { useGetSettings } from '../controllers';
import { Project } from '../../types/backend';
import { settingsServices } from '../services';

const useRosettaExtract = (successCallback: () => void) => {
  const { data: settings } = useGetSettings();
  const { error, runCommand, isSuccess } = useCli();
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
