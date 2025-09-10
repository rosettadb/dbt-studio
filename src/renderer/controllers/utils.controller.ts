import {
  useMutation,
  UseMutationOptions,
  UseMutationResult,
} from 'react-query';
import { CustomError, FileNodeWithContent } from '../../types/backend';
import { utilsService } from '../services';

export const useGetFileContentList = (
  customOptions?: UseMutationOptions<
    FileNodeWithContent[],
    CustomError,
    string[]
  >,
): UseMutationResult<FileNodeWithContent[], CustomError, string[]> => {
  const { onError: onCustomError } = customOptions || {};
  return useMutation({
    mutationFn: async (data) => {
      return utilsService.getFileContentList(data);
    },
    onError: (...args) => {
      onCustomError?.(...args);
    },
  });
};
