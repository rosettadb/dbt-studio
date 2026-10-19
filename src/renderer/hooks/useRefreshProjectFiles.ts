import React from 'react';
import { useQueryClient } from 'react-query';
import { QUERY_KEYS } from '../config/constants';

// Anything that changes files on disk (agent writes, dbt generation, git
// discard, sidebar copy/rename) calls this instead of holding a refetch
// function from whoever happens to render the file tree. The tree and the
// git status badges are react-query subscribers of these keys.
export const useRefreshProjectFiles = () => {
  const queryClient = useQueryClient();
  return React.useCallback(async () => {
    await Promise.all([
      queryClient.invalidateQueries([QUERY_KEYS.GET_FILE_STRUCTURE]),
      queryClient.invalidateQueries([QUERY_KEYS.GIT_STATUSES]),
    ]);
  }, [queryClient]);
};

export default useRefreshProjectFiles;
