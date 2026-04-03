// useAgentMode - Hook to manage agent mode state

import { useCallback } from 'react';
import useLocalStorage from './useLocalStorage';

/**
 * Hook to manage agent mode state
 * Persists the agent mode preference in localStorage
 */
export const useAgentMode = (sessionId?: number) => {
  // Store agent mode preference per session, with a global default
  const [globalAgentMode, setGlobalAgentMode] = useLocalStorage<boolean>(
    'agentMode:global',
    'false',
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
