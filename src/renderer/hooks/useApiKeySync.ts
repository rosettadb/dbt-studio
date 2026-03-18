import { useCallback } from 'react';
import { useQueryClient } from 'react-query';
import { useAuthSubscription } from '../controllers';
import { QUERY_KEYS } from '../config/constants';

/**
 * Simplified hook for refreshing authentication state
 * Handles OAuth login events and provides a way to refresh auth queries
 */
export const useApiKeySync = () => {
  const queryClient = useQueryClient();

  // Subscribe to auth events (OAuth login/logout)
  useAuthSubscription();

  // Function to refresh global auth state
  const refreshAuthState = useCallback(async () => {
    await queryClient.invalidateQueries([QUERY_KEYS.API_KEY]);
    await queryClient.invalidateQueries([QUERY_KEYS.USER_PROFILE]);
  }, [queryClient]);

  return {
    refreshAuthState,
  };
};
