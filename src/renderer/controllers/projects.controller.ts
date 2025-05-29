import {
  useMutation,
  UseMutationOptions,
  UseMutationResult,
  useQuery,
  useQueryClient,
  UseQueryOptions,
} from 'react-query';
import { CustomError, FileNode, Project } from '../../types/backend';
import { QUERY_KEYS } from '../config/constants';
import { projectsServices } from '../services';

export const useGetProjects = (
  customOptions?: UseQueryOptions<Project[], CustomError, Project[]>,
) => {
  return useQuery({
    queryKey: [QUERY_KEYS.GET_PROJECTS],
    queryFn: async () => {
      return projectsServices.getProjects();
    },
    ...customOptions,
  });
};

export const useGetSelectedProject = (
  customOptions?: UseQueryOptions<
    Project | undefined,
    CustomError,
    Project | undefined
  >,
) => {
  return useQuery({
    queryKey: [QUERY_KEYS.GET_SELECTED_PROJECT],
    queryFn: async () => {
      const project = await projectsServices.getSelectedProject();
      if (project) {
        await projectsServices.fileSync(project);
      }
      return project;
    },
    ...customOptions,
  });
};

export const useSelectProject = (
  customOptions?: UseMutationOptions<void, CustomError, { projectId: string }>,
): UseMutationResult<void, CustomError, { projectId: string }> => {
  const { onSuccess: onCustomSuccess, onError: onCustomError } =
    customOptions || {};
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data) => {
      return projectsServices.selectProject(data);
    },
    onSuccess: async (...args) => {
      await queryClient.invalidateQueries([QUERY_KEYS.GET_SELECTED_PROJECT]);
      onCustomSuccess?.(...args);
    },
    onError: (...args) => {
      onCustomError?.(...args);
    },
  });
};
export const useGetProjectById = (
  id: string,
  customOptions?: UseQueryOptions<
    Project | undefined,
    CustomError,
    Project | undefined
  >,
) => {
  const queryClient = useQueryClient();
  return useQuery({
    queryKey: [QUERY_KEYS.GET_PROJECT_BY_ID, id],
    queryFn: async () => {
      return projectsServices.getProjectById({ id });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries([QUERY_KEYS.GET_PROJECTS]);
    },
    ...customOptions,
  });
};

export const useAddProject = (
  customOptions?: UseMutationOptions<Project, CustomError, { name: string }>,
): UseMutationResult<Project, CustomError, { name: string }> => {
  const { onSuccess: onCustomSuccess, onError: onCustomError } =
    customOptions || {};
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data) => {
      return projectsServices.addProject(data);
    },
    onSuccess: async (...args) => {
      await queryClient.invalidateQueries([QUERY_KEYS.GET_PROJECTS]);
      onCustomSuccess?.(...args);
    },
    onError: (...args) => {
      onCustomError?.(...args);
    },
  });
};

export const useDeleteProject = (
  customOptions?: UseMutationOptions<boolean, CustomError, { id: string }>,
): UseMutationResult<boolean, CustomError, { id: string }> => {
  const { onSuccess: onCustomSuccess, onError: onCustomError } =
    customOptions || {};
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data) => {
      return projectsServices.deleteProject(data);
    },
    onSuccess: async (...args) => {
      await queryClient.invalidateQueries([QUERY_KEYS.GET_PROJECTS]);
      queryClient.removeQueries([
        QUERY_KEYS.GET_PROJECT_BY_ID,
        args[1].id,
        QUERY_KEYS.GET_PROJECTS,
      ]);
      onCustomSuccess?.(...args);
    },
    onError: (...args) => {
      onCustomError?.(...args);
    },
  });
};

export const useUpdateProject = (
  customOptions?: UseMutationOptions<Project, CustomError, Project>,
): UseMutationResult<Project, CustomError, Project> => {
  const { onSuccess: onCustomSuccess, onError: onCustomError } =
    customOptions || {};
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data) => {
      return projectsServices.updateProject(data);
    },
    onSuccess: async (...args) => {
      await queryClient.invalidateQueries([QUERY_KEYS.GET_SELECTED_PROJECT]);
      onCustomSuccess?.(...args);
    },
    onError: (...args) => {
      onCustomError?.(...args);
    },
  });
};

export const useGetProjectFiles = (
  project: Project,
  customOptions?: UseQueryOptions<FileNode, CustomError, FileNode>,
) => {
  return useQuery({
    queryKey: [QUERY_KEYS.GET_FILE_STRUCTURE, project.path],
    queryFn: async () => {
      return projectsServices.loadProjectDirectory(project);
    },
    ...customOptions,
  });
};

export const useGetFileContent = (
  path: string,
  customOptions?: UseQueryOptions<string, CustomError, string>,
) => {
  return useQuery({
    queryKey: [QUERY_KEYS.GET_FILE_CONTENT, path],
    queryFn: async () => {
      return projectsServices.getFileContent({ path });
    },
    ...customOptions,
  });
};
