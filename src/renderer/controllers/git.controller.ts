import {
  useMutation,
  UseMutationOptions,
  UseMutationResult,
  useQuery,
  useQueryClient,
  UseQueryOptions,
} from 'react-query';
import { RemoteWithRefs } from 'simple-git';
import { CustomError, FileStatus, GitBranch } from '../../types/backend';
import { QUERY_KEYS } from '../config/constants';
import { gitServices } from '../services';

export const useGitIsInitialized = (
  path: string,
  customOptions?: UseQueryOptions<boolean, CustomError, boolean>,
) => {
  return useQuery({
    queryKey: [QUERY_KEYS.GIT_IS_INITIALIZED, path],
    queryFn: async () => {
      return gitServices.isInitialized(path);
    },
    ...customOptions,
  });
};

export const useGetRemotes = (
  path: string,
  customOptions?: UseQueryOptions<
    RemoteWithRefs[],
    CustomError,
    RemoteWithRefs[]
  >,
) => {
  return useQuery({
    queryKey: [QUERY_KEYS.GIT_REMOTES, path],
    queryFn: async () => {
      return gitServices.getRemotes(path);
    },
    ...customOptions,
  });
};

export const useGetBranches = (
  path: string,
  customOptions?: UseQueryOptions<GitBranch[], CustomError, GitBranch[]>,
) => {
  return useQuery({
    queryKey: [QUERY_KEYS.GIT_BRANCHES, path],
    queryFn: async () => {
      return gitServices.listBranches(path);
    },
    ...customOptions,
  });
};

export const useGetFileStatuses = (
  path: string,
  customOptions?: UseQueryOptions<FileStatus[], CustomError, FileStatus[]>,
) => {
  return useQuery({
    queryKey: [QUERY_KEYS.GIT_STATUSES, path],
    queryFn: async () => {
      return gitServices.getFileStatus(path);
    },
    ...customOptions,
  });
};

export const useGitInit = (
  customOptions?: UseMutationOptions<void, CustomError, { path: string }>,
): UseMutationResult<void, CustomError, { path: string }> => {
  const { onSuccess: onCustomSuccess, onError: onCustomError } =
    customOptions || {};
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data) => {
      return gitServices.gitInit(data.path);
    },
    onSuccess: async (...args) => {
      await queryClient.invalidateQueries([
        QUERY_KEYS.GIT_IS_INITIALIZED,
        args[1].path,
      ]);
      onCustomSuccess?.(...args);
    },
    onError: (...args) => {
      onCustomError?.(...args);
    },
  });
};

export const useGitCheckout = (
  customOptions?: UseMutationOptions<
    void,
    CustomError,
    { path: string; branch: string }
  >,
): UseMutationResult<void, CustomError, { path: string; branch: string }> => {
  const { onSuccess: onCustomSuccess, onError: onCustomError } =
    customOptions || {};
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data) => {
      return gitServices.checkout(data.path, data.branch);
    },
    onSuccess: async (...args) => {
      await queryClient.invalidateQueries([
        QUERY_KEYS.GIT_BRANCHES,
        QUERY_KEYS.GET_FILE_STRUCTURE,
        args[1].path,
      ]);
      onCustomSuccess?.(...args);
    },
    onError: (...args) => {
      onCustomError?.(...args);
    },
  });
};

export const useAddGitRemote = (
  customOptions?: UseMutationOptions<
    void,
    CustomError,
    { path: string; url: string }
  >,
): UseMutationResult<void, CustomError, { path: string; url: string }> => {
  const { onSuccess: onCustomSuccess, onError: onCustomError } =
    customOptions || {};
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data) => {
      return gitServices.addRemote(data.path, data.url);
    },
    onSuccess: async (...args) => {
      await queryClient.invalidateQueries([
        QUERY_KEYS.GIT_REMOTES,
        args[1].path,
      ]);
      onCustomSuccess?.(...args);
    },
    onError: (...args) => {
      onCustomError?.(...args);
    },
  });
};

export const useGitCommit = (
  customOptions?: UseMutationOptions<
    void,
    CustomError,
    { path: string; message: string; files: string[] }
  >,
): UseMutationResult<
  void,
  CustomError,
  { path: string; message: string; files: string[] }
> => {
  const { onSuccess: onCustomSuccess, onError: onCustomError } =
    customOptions || {};
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data) => {
      return gitServices.commit(data.path, data.message, data.files);
    },
    onSuccess: async (...args) => {
      await queryClient.invalidateQueries([
        QUERY_KEYS.GIT_REMOTES,
        args[1].path,
      ]);
      await queryClient.invalidateQueries([
        QUERY_KEYS.GIT_STATUSES,
        args[1].path,
      ]);
      onCustomSuccess?.(...args);
    },
    onError: (...args) => {
      onCustomError?.(...args);
    },
  });
};

export const useGitPush = (
  customOptions?: UseMutationOptions<
    { error?: string; authRequired?: boolean },
    CustomError,
    { path: string }
  >,
): UseMutationResult<
  { error?: string; authRequired?: boolean },
  CustomError,
  { path: string }
> => {
  const { onSuccess: onCustomSuccess, onError: onCustomError } =
    customOptions || {};
  return useMutation({
    mutationFn: async (data) => {
      return gitServices.push(data.path);
    },
    onSuccess: async (...args) => {
      onCustomSuccess?.(...args);
    },
    onError: (...args) => {
      onCustomError?.(...args);
    },
  });
};

export const useGitPull = (
  customOptions?: UseMutationOptions<
    { error?: string; authRequired?: boolean },
    CustomError,
    { path: string }
  >,
): UseMutationResult<
  { error?: string; authRequired?: boolean },
  CustomError,
  { path: string }
> => {
  const { onSuccess: onCustomSuccess, onError: onCustomError } =
    customOptions || {};
  return useMutation({
    mutationFn: async (data) => {
      return gitServices.pull(data.path);
    },
    onSuccess: async (...args) => {
      onCustomSuccess?.(...args);
    },
    onError: (...args) => {
      onCustomError?.(...args);
    },
  });
};
