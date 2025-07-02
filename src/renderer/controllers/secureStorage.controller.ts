// Fixed formatting issues in secure storage controller
import {
  useMutation,
  UseMutationOptions,
  UseMutationResult,
  useQuery,
  UseQueryOptions,
} from 'react-query';
import { secureStorageService } from '../services/secureStorage.service';

export const useSecureStorageGet = (
  key: string,
  customOptions?: UseQueryOptions<string | null, Error, string | null>,
) => {
  return useQuery({
    queryKey: ['secure-storage:get', key],
    queryFn: async () => secureStorageService.get(key),
    ...customOptions,
  });
};

export const useSecureStorageSet = (
  customOptions?: UseMutationOptions<
    void,
    Error,
    { key: string; value: string }
  >,
): UseMutationResult<void, Error, { key: string; value: string }> => {
  return useMutation({
    mutationFn: async ({ key, value }) => secureStorageService.set(key, value),
    ...customOptions,
  });
};

export const useSecureStorageDelete = (
  customOptions?: UseMutationOptions<void, Error, string>,
): UseMutationResult<void, Error, string> => {
  return useMutation({
    mutationFn: async (key) => secureStorageService.delete(key),
    ...customOptions,
  });
};
