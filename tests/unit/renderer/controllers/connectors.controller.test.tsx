import React from 'react';
import { act, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from 'react-query';

import { useConfigureConnection } from '../../../../src/renderer/controllers/connectors.controller';
import { connectorsServices } from '../../../../src/renderer/services';
import { QUERY_KEYS } from '../../../../src/renderer/config/constants';

type ConfigureConnectionBody = {
  id: string;
  connection: { type: string };
};

jest.mock('../../../../src/renderer/services', () => {
  return {
    connectorsServices: {
      configureConnection: jest.fn(),
    },
  };
});

describe('useConfigureConnection', () => {
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

  it('should call connectorsServices.configureConnection and invalidate GET_SELECTED_PROJECT', async () => {
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: {
          retry: false,
        },
      },
    });

    const invalidateSpy = jest.spyOn(queryClient, 'invalidateQueries');

    const configureConnectionMock =
      connectorsServices.configureConnection as unknown as jest.MockedFunction<
        typeof connectorsServices.configureConnection
      >;

    configureConnectionMock.mockResolvedValue({
      id: 'p1',
      name: 'Project',
    } as any);

    const { result } = renderHook(() => useConfigureConnection(), {
      wrapper: createWrapper(queryClient),
    });

    const body: ConfigureConnectionBody = {
      id: 'p1',
      connection: { type: 'postgres' },
    };

    await act(async () => {
      await (result.current as any).mutateAsync(body);
    });

    await waitFor(() => {
      expect(configureConnectionMock).toHaveBeenCalledTimes(1);
    });

    expect(configureConnectionMock).toHaveBeenCalledWith(body);
    expect(invalidateSpy).toHaveBeenCalledWith([
      QUERY_KEYS.GET_SELECTED_PROJECT,
    ]);
  });
});
