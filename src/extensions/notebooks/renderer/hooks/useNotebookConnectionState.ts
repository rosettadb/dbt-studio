import { useState, useEffect } from 'react';

const STORAGE_KEY = 'dbt-studio:notebook-connection';

interface PersistedConnectionState {
  activeConnectionId: string | null;
}

export const useNotebookConnectionState = () => {
  const [activeConnectionId, setActiveConnectionId] = useState<string>('');
  const [isHydrated, setIsHydrated] = useState(false);

  // Hydrate from localStorage on mount
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<PersistedConnectionState>;
        if (typeof parsed.activeConnectionId === 'string') {
          setActiveConnectionId(parsed.activeConnectionId);
        }
      }
    } catch (error) {
      // eslint-disable-next-line no-console
      console.warn('Failed to read persisted connection state', error);
    }
    setIsHydrated(true);
  }, []);

  // Persist on changes
  useEffect(() => {
    if (!isHydrated) return;

    if (activeConnectionId) {
      const payload: PersistedConnectionState = { activeConnectionId };
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    } else {
      window.localStorage.removeItem(STORAGE_KEY);
    }
  }, [activeConnectionId, isHydrated]);

  return {
    activeConnectionId,
    setActiveConnectionId,
    isHydrated,
  };
};
