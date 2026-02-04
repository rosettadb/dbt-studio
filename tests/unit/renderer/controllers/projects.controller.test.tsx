import React from 'react';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from 'react-query';

import { useGetProjects } from '../../../../src/renderer/controllers/projects.controller';
import { projectsServices } from '../../../../src/renderer/services';

type Project = {
  id: string;
  name: string;
};

jest.mock('../../../../src/renderer/services', () => {
  return {
    projectsServices: {
      getProjects: jest.fn(),
    },
  };
});

describe('useGetProjects', () => {
  const createWrapper = () => {
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: {
          retry: false,
        },
      },
    });

    const Wrapper: React.FC<{ children: React.ReactNode }> = ({ children }) => {
      return (
        <QueryClientProvider client={queryClient}>
          {children}
        </QueryClientProvider>
      );
    };

    return Wrapper;
  };

  it('should call projectsServices.getProjects and expose data', async () => {
    const projects: Project[] = [
      { id: '1', name: 'Project One' },
      { id: '2', name: 'Project Two' },
    ];

    const getProjectsMock =
      projectsServices.getProjects as unknown as jest.MockedFunction<
        typeof projectsServices.getProjects
      >;
    getProjectsMock.mockResolvedValue(projects as any);

    const { result } = renderHook(() => useGetProjects(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(projectsServices.getProjects).toHaveBeenCalledTimes(1);
    expect(result.current.data).toEqual(projects);
  });
});
