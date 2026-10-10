import { useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'react-toastify';
import { projectsServices } from '../services';
import { useSelectProject } from '../controllers';

/** Folder / zip import, shared by the projects list, the new-project screen and the dashboard. */
export const useProjectImport = () => {
  const navigate = useNavigate();
  const { mutateAsync: selectProject } = useSelectProject();

  const importProject = useCallback(async () => {
    try {
      const project = await projectsServices.addProjectFromFolder();
      if (project && project.id) {
        await selectProject({ projectId: project.id });
        if (project.isExtracted) {
          toast.success(
            `Project ${project.name} imported from compressed file successfully!`,
          );
        } else {
          toast.success(`Project ${project.name} loaded successfully!`);
        }
        navigate('/app/loading');
      } else {
        toast.error('Failed to import project.');
      }
    } catch (error: any) {
      if (
        error instanceof Error &&
        error.message === 'No file or folder selected'
      ) {
        return;
      }
      const message: string = error?.message ?? '';
      if (message.includes('compressed')) {
        toast.error(
          'Failed to extract compressed file. Please ensure it contains a valid dbt project.',
        );
      } else if (message.includes('validation')) {
        toast.error(
          'Invalid dbt project structure. Please ensure the folder contains a valid dbt_project.yml file.',
        );
      } else if (
        message.includes('already exists') ||
        message.includes('already imported')
      ) {
        toast.error(message);
      } else {
        toast.error('Failed to import project. Please try again.');
      }
    }
  }, [navigate, selectProject]);

  return { importProject };
};
