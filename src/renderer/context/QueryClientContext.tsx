import { QueryClient, QueryClientProvider } from 'react-query';
import React, { ReactNode, useMemo } from 'react';

type QueryClientContextProviderProps = {
  children?: ReactNode;
};

export const QueryClientContextProvider = ({
  children,
}: QueryClientContextProviderProps) => {
  const client = useMemo(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            refetchOnWindowFocus: false,
            retry: false,
          },
        },
      }),
    [],
  );
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
};
