import React from 'react';
import { act, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from 'react-query';

import { useGitStage } from '../../../../src/renderer/controllers/git.controller';
import { gitServices } from '../../../../src/renderer/services';
import { QUERY_KEYS } from '../../../../src/renderer/config/constants';

type FileStatus = {
  path: string;
  status: 'modified' | 'staged' | string;
};

jest.mock('../../../../src/renderer/services', () => {
  return {
    gitServices: {
      add: jest.fn(),
    },
  };
});

describe('useGitStage', () => {
  const createWrapper = (queryClient: QueryClient) => {
    const Wrapper: React.FC<{ children: React.ReactNode }> = ({ children }) => {
      return (
        <QueryClientProvider client={queryClient}>
          {children}
        </QueryClientProvider>
      );
    };

    return Wrapper;
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should optimistically update GIT_STATUSES and invalidate after success', async () => {
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: {
          retry: false,
        },
      },
    });

    const repoPath = '/repo';
    const targetFile = 'models/a.sql';

    const initialStatuses: FileStatus[] = [
      { path: targetFile, status: 'modified' },
      { path: 'models/b.sql', status: 'modified' },
    ];

    queryClient.setQueryData(
      [QUERY_KEYS.GIT_STATUSES, repoPath],
      initialStatuses,
    );

    let resolveAdd: ((val: { success: boolean }) => void) | undefined;
    const addPromise = new Promise<{ success: boolean }>((resolve) => {
      resolveAdd = resolve;
    });

    const addMock = gitServices.add as unknown as jest.MockedFunction<
      typeof gitServices.add
    >;
    addMock.mockReturnValue(addPromise as any);

    const invalidateSpy = jest.spyOn(queryClient, 'invalidateQueries');

    const { result } = renderHook(() => useGitStage(), {
      wrapper: createWrapper(queryClient),
    });

    const variables = { path: repoPath, files: [targetFile] };

    let mutatePromise: Promise<any> | undefined;

    await act(async () => {
      mutatePromise = (result.current as any).mutateAsync(variables);
    });

    // Optimistic update should have run immediately
    const optimisticStatuses = queryClient.getQueryData<FileStatus[]>([
      QUERY_KEYS.GIT_STATUSES,
      repoPath,
    ]);

    expect(optimisticStatuses).toEqual([
      { path: targetFile, status: 'staged' },
      { path: 'models/b.sql', status: 'modified' },
    ]);

    // Resolve mutation
    resolveAdd?.({ success: true });

    await act(async () => {
      await mutatePromise;
    });

    await waitFor(() => {
      expect(addMock).toHaveBeenCalledTimes(1);
    });

    expect(addMock).toHaveBeenCalledWith(repoPath, [targetFile]);
    expect(invalidateSpy).toHaveBeenCalledWith([
      QUERY_KEYS.GIT_STATUSES,
      repoPath,
    ]);
  });
});
