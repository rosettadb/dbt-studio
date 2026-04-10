import {
  useMutation,
  UseMutationOptions,
  UseMutationResult,
  useQuery,
  useQueryClient,
  UseQueryOptions,
} from 'react-query';
import { RemoteWithRefs } from 'simple-git';
import {
  CustomError,
  DiffResponse,
  FileStatus,
  GitBranch,
  GitChangesRes,
  RepoInfoRes,
} from '../../types/backend';
import { QUERY_KEYS } from '../config/constants';
import { gitServices } from '../services';

export const useGitIsInitialized = (
  path?: string,
  customOptions?: UseQueryOptions<boolean, CustomError, boolean>,
) => {
  return useQuery({
    queryKey: [QUERY_KEYS.GIT_IS_INITIALIZED, path],
    queryFn: async () => {
      return gitServices.isInitialized(path);
    },
    staleTime: 30000, // Git init status rarely changes - 30 seconds
    cacheTime: 600000,
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
    staleTime: 30000, // Remotes rarely change - 30 seconds
    cacheTime: 600000,
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
    staleTime: 10000, // Branches change occasionally - 10 seconds
    cacheTime: 600000,
    ...customOptions,
  });
};

export const useGetFileStatuses = (
  path?: string,
  customOptions?: UseQueryOptions<FileStatus[], CustomError, FileStatus[]>,
) => {
  return useQuery({
    queryKey: [QUERY_KEYS.GIT_STATUSES, path],
    queryFn: async () => {
      return gitServices.getFileStatusList(path);
    },
    staleTime: 5000, // Consider data fresh for 5 seconds
    cacheTime: 600000, // Keep in cache for 10 minutes
    ...customOptions,
  });
};

export const useGetFileStatus = (
  path: string,
  filePath: string,
  customOptions?: UseQueryOptions<
    FileStatus | null,
    CustomError,
    FileStatus | null
  >,
) => {
  return useQuery({
    queryKey: [QUERY_KEYS.GIT_STATUS, filePath],
    queryFn: async () => {
      return gitServices.getFileStatus(path, filePath);
    },
    ...customOptions,
  });
};

export const useGetFileDiff = (
  path: string,
  filePath: string,
  customOptions?: UseQueryOptions<DiffResponse, CustomError, DiffResponse>,
) => {
  return useQuery({
    queryKey: [QUERY_KEYS.GIT_DIFF, filePath],
    queryFn: async () => {
      return gitServices.getFileDiff(path, filePath);
    },
    ...customOptions,
  });
};

export const useGetLocalChanges = (
  path: string,
  customOptions?: UseQueryOptions<
    GitChangesRes | null,
    CustomError,
    GitChangesRes | null
  >,
) => {
  return useQuery({
    queryKey: [QUERY_KEYS.GIT_LOCAL_CHANGES],
    queryFn: async () => {
      return gitServices.getLocalChanges(path);
    },
    ...customOptions,
  });
};

export const useGetRepoInfo = (
  path: string,
  customOptions?: UseQueryOptions<
    RepoInfoRes | null,
    CustomError,
    RepoInfoRes | null
  >,
) => {
  return useQuery({
    queryKey: [QUERY_KEYS.GIT_REPO_INFO],
    queryFn: async () => {
      return gitServices.getRepoInfo(path);
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
    { path: string; message: string }
  >,
): UseMutationResult<void, CustomError, { path: string; message: string }> => {
  const { onSuccess: onCustomSuccess, onError: onCustomError } =
    customOptions || {};
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data) => {
      return gitServices.commit(data.path, data.message);
    },
    onSuccess: async (...args) => {
      // Only invalidate queries for this specific path - more targeted
      await queryClient.invalidateQueries([
        QUERY_KEYS.GIT_STATUSES,
        args[1].path,
      ]);
      await queryClient.invalidateQueries([
        QUERY_KEYS.GIT_AHEAD_BEHIND,
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

export const useGitStage = (
  customOptions?: UseMutationOptions<
    { success: boolean },
    CustomError,
    { path: string; files: string[] }
  >,
): UseMutationResult<
  { success: boolean },
  CustomError,
  { path: string; files: string[] }
> => {
  const { onSuccess: onCustomSuccess, onError: onCustomError } =
    customOptions || {};
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: { path: string; files: string[] }) => {
      return gitServices.add(data.path, data.files);
    },
    onMutate: async (variables) => {
      // Cancel any outgoing refetches to prevent overwriting optimistic update
      await queryClient.cancelQueries([
        QUERY_KEYS.GIT_STATUSES,
        variables.path,
      ]);

      // Snapshot the previous value for rollback
      const previousStatuses = queryClient.getQueryData<FileStatus[]>([
        QUERY_KEYS.GIT_STATUSES,
        variables.path,
      ]);

      // Optimistically update the cache
      queryClient.setQueryData<FileStatus[]>(
        [QUERY_KEYS.GIT_STATUSES, variables.path],
        (old = []) => {
          return old.map((file) => {
            // If this file is being staged, change its status to 'staged'
            if (variables.files.includes(file.path)) {
              return { ...file, status: 'staged' as const };
            }
            return file;
          });
        },
      );

      // Return context with snapshot for potential rollback
      return { previousStatuses };
    },
    onError: (error, variables, context) => {
      // Rollback to previous state on error
      if (context?.previousStatuses) {
        queryClient.setQueryData(
          [QUERY_KEYS.GIT_STATUSES, variables.path],
          context.previousStatuses,
        );
      }
      onCustomError?.(error, variables, context);
    },
    onSuccess: async (data, variables, context) => {
      // Invalidate to ensure we have latest data from server
      await queryClient.invalidateQueries([
        QUERY_KEYS.GIT_STATUSES,
        variables.path,
      ]);
      onCustomSuccess?.(data, variables, context);
    },
  });
};

export const useGitUnstage = (
  customOptions?: UseMutationOptions<
    { success: boolean },
    CustomError,
    { path: string; files: string[] }
  >,
): UseMutationResult<
  { success: boolean },
  CustomError,
  { path: string; files: string[] }
> => {
  const { onSuccess: onCustomSuccess, onError: onCustomError } =
    customOptions || {};
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data) => {
      return gitServices.unstage(data.path, data.files);
    },
    onMutate: async (variables) => {
      // Cancel any outgoing refetches
      await queryClient.cancelQueries([
        QUERY_KEYS.GIT_STATUSES,
        variables.path,
      ]);

      // Snapshot the previous value
      const previousStatuses = queryClient.getQueryData<FileStatus[]>([
        QUERY_KEYS.GIT_STATUSES,
        variables.path,
      ]);

      // Optimistically update - change 'staged' back to 'modified'
      queryClient.setQueryData<FileStatus[]>(
        [QUERY_KEYS.GIT_STATUSES, variables.path],
        (old = []) => {
          return old.map((file) => {
            if (
              variables.files.includes(file.path) &&
              file.status === 'staged'
            ) {
              return { ...file, status: 'modified' as const };
            }
            return file;
          });
        },
      );

      return { previousStatuses };
    },
    onError: (error, variables, context) => {
      // Rollback on error
      if (context?.previousStatuses) {
        queryClient.setQueryData(
          [QUERY_KEYS.GIT_STATUSES, variables.path],
          context.previousStatuses,
        );
      }
      onCustomError?.(error, variables, context);
    },
    onSuccess: async (data, variables, context) => {
      await queryClient.invalidateQueries([
        QUERY_KEYS.GIT_STATUSES,
        variables.path,
      ]);
      onCustomSuccess?.(data, variables, context);
    },
  });
};

export const useGitStageAll = (
  customOptions?: UseMutationOptions<
    { success: boolean },
    CustomError,
    { path: string }
  >,
): UseMutationResult<{ success: boolean }, CustomError, { path: string }> => {
  const { onSuccess: onCustomSuccess, onError: onCustomError } =
    customOptions || {};
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data) => {
      return gitServices.stageAll(data.path);
    },
    onMutate: async (variables) => {
      // Cancel any outgoing refetches
      await queryClient.cancelQueries([
        QUERY_KEYS.GIT_STATUSES,
        variables.path,
      ]);

      // Snapshot the previous value
      const previousStatuses = queryClient.getQueryData<FileStatus[]>([
        QUERY_KEYS.GIT_STATUSES,
        variables.path,
      ]);

      // Optimistically stage all unstaged files
      queryClient.setQueryData<FileStatus[]>(
        [QUERY_KEYS.GIT_STATUSES, variables.path],
        (old = []) => {
          return old.map((file) => {
            // Stage all files that aren't already staged
            if (file.status !== 'staged') {
              return { ...file, status: 'staged' as const };
            }
            return file;
          });
        },
      );

      return { previousStatuses };
    },
    onError: (error, variables, context) => {
      // Rollback on error
      if (context?.previousStatuses) {
        queryClient.setQueryData(
          [QUERY_KEYS.GIT_STATUSES, variables.path],
          context.previousStatuses,
        );
      }
      onCustomError?.(error, variables, context);
    },
    onSuccess: async (data, variables, context) => {
      await queryClient.invalidateQueries([
        QUERY_KEYS.GIT_STATUSES,
        variables.path,
      ]);
      onCustomSuccess?.(data, variables, context);
    },
  });
};

export const useGitUnstageAll = (
  customOptions?: UseMutationOptions<
    { success: boolean },
    CustomError,
    { path: string }
  >,
): UseMutationResult<{ success: boolean }, CustomError, { path: string }> => {
  const { onSuccess: onCustomSuccess, onError: onCustomError } =
    customOptions || {};
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data) => {
      return gitServices.unstageAll(data.path);
    },
    onMutate: async (variables) => {
      // Cancel any outgoing refetches
      await queryClient.cancelQueries([
        QUERY_KEYS.GIT_STATUSES,
        variables.path,
      ]);

      // Snapshot the previous value
      const previousStatuses = queryClient.getQueryData<FileStatus[]>([
        QUERY_KEYS.GIT_STATUSES,
        variables.path,
      ]);

      // Optimistically unstage all staged files
      queryClient.setQueryData<FileStatus[]>(
        [QUERY_KEYS.GIT_STATUSES, variables.path],
        (old = []) => {
          return old.map((file) => {
            // Unstage all staged files back to modified
            if (file.status === 'staged') {
              return { ...file, status: 'modified' as const };
            }
            return file;
          });
        },
      );

      return { previousStatuses };
    },
    onError: (error, variables, context) => {
      // Rollback on error
      if (context?.previousStatuses) {
        queryClient.setQueryData(
          [QUERY_KEYS.GIT_STATUSES, variables.path],
          context.previousStatuses,
        );
      }
      onCustomError?.(error, variables, context);
    },
    onSuccess: async (data, variables, context) => {
      await queryClient.invalidateQueries([
        QUERY_KEYS.GIT_STATUSES,
        variables.path,
      ]);
      onCustomSuccess?.(data, variables, context);
    },
  });
};

export const useGitDiscardChanges = (
  customOptions?: UseMutationOptions<
    { success: boolean },
    CustomError,
    { path: string; files: string[] }
  >,
): UseMutationResult<
  { success: boolean },
  CustomError,
  { path: string; files: string[] }
> => {
  const { onSuccess: onCustomSuccess, onError: onCustomError } =
    customOptions || {};
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data) => {
      return gitServices.discardChanges(data.path, data.files);
    },
    onMutate: async (variables) => {
      // Cancel any outgoing refetches
      await queryClient.cancelQueries([
        QUERY_KEYS.GIT_STATUSES,
        variables.path,
      ]);

      // Snapshot the previous value
      const previousStatuses = queryClient.getQueryData<FileStatus[]>([
        QUERY_KEYS.GIT_STATUSES,
        variables.path,
      ]);

      // Optimistically remove discarded files from the list
      queryClient.setQueryData<FileStatus[]>(
        [QUERY_KEYS.GIT_STATUSES, variables.path],
        (old = []) => {
          return old.filter((file) => !variables.files.includes(file.path));
        },
      );

      return { previousStatuses };
    },
    onError: (error, variables, context) => {
      // Rollback on error
      if (context?.previousStatuses) {
        queryClient.setQueryData(
          [QUERY_KEYS.GIT_STATUSES, variables.path],
          context.previousStatuses,
        );
      }
      onCustomError?.(error, variables, context);
    },
    onSuccess: async (data, variables, context) => {
      await queryClient.invalidateQueries([
        QUERY_KEYS.GIT_STATUSES,
        variables.path,
      ]);
      onCustomSuccess?.(data, variables, context);
    },
  });
};

export const useGetAheadBehindCount = (
  path?: string,
  customOptions?: UseQueryOptions<
    { ahead: number; behind: number } | null,
    CustomError,
    { ahead: number; behind: number } | null
  >,
) => {
  return useQuery({
    queryKey: [QUERY_KEYS.GIT_AHEAD_BEHIND, path],
    queryFn: async () => {
      if (!path) return null;
      return gitServices.getAheadBehindCount(path);
    },
    staleTime: 10000, // Ahead/behind changes with commits/pulls - 10 seconds
    cacheTime: 600000,
    ...customOptions,
  });
};

export const useGitCreateBranch = (
  customOptions?: UseMutationOptions<
    void,
    CustomError,
    { path: string; branchName: string }
  >,
): UseMutationResult<
  void,
  CustomError,
  { path: string; branchName: string }
> => {
  const { onSuccess: onCustomSuccess, onError: onCustomError } =
    customOptions || {};
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data) => {
      return gitServices.createBranch(data.path, data.branchName);
    },
    onSuccess: async (...args) => {
      await queryClient.invalidateQueries([
        QUERY_KEYS.GIT_BRANCHES,
        args[1].path,
      ]);
      onCustomSuccess?.(...args);
    },
    onError: (...args) => {
      onCustomError?.(...args);
    },
  });
};

export const useGitDeleteBranch = (
  customOptions?: UseMutationOptions<
    void,
    CustomError,
    { path: string; branchName: string; force?: boolean }
  >,
): UseMutationResult<
  void,
  CustomError,
  { path: string; branchName: string; force?: boolean }
> => {
  const { onSuccess: onCustomSuccess, onError: onCustomError } =
    customOptions || {};
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data) => {
      return gitServices.deleteBranch(data.path, data.branchName, data.force);
    },
    onSuccess: async (...args) => {
      await queryClient.invalidateQueries([
        QUERY_KEYS.GIT_BRANCHES,
        args[1].path,
      ]);
      onCustomSuccess?.(...args);
    },
    onError: (...args) => {
      onCustomError?.(...args);
    },
  });
};

export const useGitRenameBranch = (
  customOptions?: UseMutationOptions<
    void,
    CustomError,
    { path: string; oldName: string; newName: string }
  >,
): UseMutationResult<
  void,
  CustomError,
  { path: string; oldName: string; newName: string }
> => {
  const { onSuccess: onCustomSuccess, onError: onCustomError } =
    customOptions || {};
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data) => {
      return gitServices.renameBranch(data.path, data.oldName, data.newName);
    },
    onSuccess: async (...args) => {
      await queryClient.invalidateQueries([
        QUERY_KEYS.GIT_BRANCHES,
        args[1].path,
      ]);
      onCustomSuccess?.(...args);
    },
    onError: (...args) => {
      onCustomError?.(...args);
    },
  });
};
