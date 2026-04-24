// useAgentMode - Hook to manage agent mode state

import { useCallback } from 'react';
import useLocalStorage from './useLocalStorage';

/**
 * Hook to manage agent mode state
 * Persists the agent mode preference in localStorage
 * Default is Agent (Code) mode.
 */
export const useAgentMode = (sessionId?: number) => {
  // Migrate old 'false' default to 'true' (Code mode is now the default)
  if (
    typeof window !== 'undefined' &&
    localStorage.getItem('agentMode:global') === 'false'
  ) {
    localStorage.removeItem('agentMode:global');
  }

  const [globalAgentMode, setGlobalAgentMode] = useLocalStorage<boolean>(
    'agentMode:global',
    'true',
  );

  const [sessionAgentMode, setSessionAgentMode] = useLocalStorage<
    Record<number, boolean>
  >('agentMode:sessions', '{}');

  // Get agent mode for current session (falls back to global)
  const isAgentMode = sessionId
    ? (sessionAgentMode[sessionId] ?? globalAgentMode)
    : globalAgentMode;

  // Set agent mode for current session
  const setAgentMode = useCallback(
    (enabled: boolean) => {
      if (sessionId) {
        setSessionAgentMode((prev: Record<number, boolean>) => ({
          ...prev,
          [sessionId]: enabled,
        }));
      } else {
        setGlobalAgentMode(enabled);
      }
    },
    [sessionId, setSessionAgentMode, setGlobalAgentMode],
  );

  // Toggle agent mode
  const toggleAgentMode = useCallback(() => {
    setAgentMode(!isAgentMode);
  }, [isAgentMode, setAgentMode]);

  return {
    isAgentMode,
    setAgentMode,
    toggleAgentMode,
  };
};
