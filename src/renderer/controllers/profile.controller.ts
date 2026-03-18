import React from 'react';
import {
  useMutation,
  UseMutationOptions,
  UseMutationResult,
  useQuery,
  UseQueryOptions,
  useQueryClient,
} from 'react-query';
import { toast } from 'react-toastify';
import type { CustomError } from '../../types/backend';
import { UserProfile } from '../../types/profile';
import { profileService } from '../services/profile.service';

export const PROFILE_QUERY_KEY = 'USER_PROFILE';

export const useProfile = (
  options?: UseQueryOptions<
    UserProfile | null,
    CustomError,
    UserProfile | null
  >,
) => {
  return useQuery({
    queryKey: [PROFILE_QUERY_KEY],
    queryFn: () => profileService.getProfile(),
    staleTime: 5 * 60 * 1000, // 5 minutes
    retry: (failureCount, error) => {
      // Don't retry on auth errors
      if (error?.message?.includes('401')) return false;
      return failureCount < 3;
    },
    ...options,
  });
};

export const useRefreshProfile = (
  options?: UseMutationOptions<UserProfile | null, CustomError, void>,
): UseMutationResult<UserProfile | null, CustomError, void> => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => profileService.refreshProfile(),
    onSuccess: (profile) => {
      queryClient.setQueryData([PROFILE_QUERY_KEY], profile);
      if (profile) {
        toast.success('Profile refreshed successfully');
      }
    },
    onError: (error) => {
      toast.error(`Failed to refresh profile: ${error.message}`);
    },
    ...options,
  });
};

export const useProfileSubscription = () => {
  const queryClient = useQueryClient();

  // Listen for auth events to manage profile state
  React.useEffect(() => {
    const handleAuthSuccess = () => {
      // Refresh profile when user logs in
      queryClient.invalidateQueries({ queryKey: [PROFILE_QUERY_KEY] });
    };

    const handleAuthError = () => {
      // Clear profile on auth error
      queryClient.setQueryData([PROFILE_QUERY_KEY], null);
    };

    const handleApiKeyUpdate = () => {
      // Refresh profile when API key updates
      queryClient.invalidateQueries({ queryKey: [PROFILE_QUERY_KEY] });
    };

    const handleLogout = () => {
      queryClient.setQueryData([PROFILE_QUERY_KEY], null);
    };

    // Subscribe to auth events
    const unsubscribeAuthSuccess = window.electron.ipcRenderer.on(
      'rosettaCloud:authSuccess',
      handleAuthSuccess,
    );
    const unsubscribeAuthError = window.electron.ipcRenderer.on(
      'rosettaCloud:authError',
      handleAuthError,
    );
    const unsubscribeApiKeyUpdated = window.electron.ipcRenderer.on(
      'rosettaCloud:apiKeyUpdated',
      handleApiKeyUpdate,
    );
    const unsubscribeLogout = window.electron.ipcRenderer.on(
      'rosettaCloud:logout',
      handleLogout,
    );

    return () => {
      unsubscribeAuthSuccess();
      unsubscribeAuthError();
      unsubscribeApiKeyUpdated();
      unsubscribeLogout();
    };
  }, [queryClient]);
};
