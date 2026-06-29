import { useQuery, useMutation, useQueryClient } from 'react-query';
import { StaticSiteService } from '../services/staticSite.service';
import type { StaticSiteBuildOptions } from '../../types/staticSite';

export const STATIC_SITE_KEYS = {
  all: ['staticSite'] as const,
  state: (connectionId: string) =>
    [...STATIC_SITE_KEYS.all, 'state', connectionId] as const,
};

/** Fetch the persisted last-build state for a connection */
export const useGetStaticSiteState = (connectionId?: string) => {
  return useQuery({
    queryKey: STATIC_SITE_KEYS.state(connectionId!),
    queryFn: () => StaticSiteService.getState(connectionId!),
    enabled: !!connectionId,
    // Poll occasionally so the button reappears if user builds from another window
    staleTime: 30_000,
  });
};

/** Trigger a site build */
export const useBuildStaticSite = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (opts: StaticSiteBuildOptions) => StaticSiteService.build(opts),
    onSuccess: (_, variables) => {
      // Invalidate state so the "Open Folder" button reflects the new build
      queryClient.invalidateQueries({
        queryKey: STATIC_SITE_KEYS.state(variables.connectionId),
      });
    },
  });
};

/** Pick an output folder via the native folder picker */
export const usePickSiteFolder = () => {
  return useMutation({
    mutationFn: (defaultPath: string) =>
      StaticSiteService.pickFolder(defaultPath),
  });
};
