// useToolMode - Hook to manage tool mode state

import { useCallback, useEffect } from 'react';
import useLocalStorage from './useLocalStorage';

/**
 * Hook to manage tool mode state
 * Persists the tool mode preference in localStorage
 * Modes: 'chat' (read-only tools) vs 'agent' (all tools)
 */
export const useToolMode = (sessionId?: number) => {
  // Migrate old key names on first load
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const oldGlobal = localStorage.getItem('agentMode:global');
      const oldSessions = localStorage.getItem('agentMode:sessions');

      if (oldGlobal !== null) {
        // Map boolean "isAgentMode" string to toolMode enum
        const mode = oldGlobal === 'true' ? 'agent' : 'chat';
        localStorage.setItem('toolMode:global', JSON.stringify(mode));
        localStorage.removeItem('agentMode:global');
      }

      if (oldSessions !== null) {
        try {
          const sessionsObj = JSON.parse(oldSessions);
          const newSessionsObj: Record<string, string> = {};
          Object.keys(sessionsObj).forEach((key) => {
            newSessionsObj[key] = sessionsObj[key] ? 'agent' : 'chat';
          });
          localStorage.setItem(
            'toolMode:sessions',
            JSON.stringify(newSessionsObj),
          );
          localStorage.removeItem('agentMode:sessions');
        } catch (e) {
          // ignore parsing error
        }
      }
    }
  }, []);

  const [globalToolMode, setGlobalToolMode] = useLocalStorage<'chat' | 'agent'>(
    'toolMode:global',
    '"agent"',
  );

  const [sessionToolMode, setSessionToolMode] = useLocalStorage<
    Record<number, 'chat' | 'agent'>
  >('toolMode:sessions', '{}');

  // Get tool mode for current session (falls back to global)
  const currentMode = sessionId
    ? (sessionToolMode[sessionId] ?? globalToolMode)
    : globalToolMode;

  const isCodeMode = currentMode === 'agent';

  // Set tool mode for current session
  const setToolMode = useCallback(
    (mode: 'chat' | 'agent') => {
      if (sessionId) {
        setSessionToolMode((prev: Record<number, 'chat' | 'agent'>) => ({
          ...prev,
          [sessionId]: mode,
        }));
      } else {
        setGlobalToolMode(mode);
      }
    },
    [sessionId, setSessionToolMode, setGlobalToolMode],
  );

  // Toggle tool mode
  const toggleToolMode = useCallback(() => {
    setToolMode(currentMode === 'agent' ? 'chat' : 'agent');
  }, [currentMode, setToolMode]);

  return {
    isCodeMode,
    currentMode,
    setToolMode,
    toggleToolMode,
  };
};
