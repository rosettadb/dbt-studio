import { useState, useEffect } from 'react';

const STORAGE_KEY = 'dbt-studio:notebook-sidebar';

interface PersistedSidebarState {
  showArchived: boolean;
}

export const useNotebookSidebarState = () => {
  const [showArchived, setShowArchived] = useState(false);
  const [isHydrated, setIsHydrated] = useState(false);

  // Hydrate from localStorage on mount
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed: PersistedSidebarState = JSON.parse(raw);
        setShowArchived(parsed.showArchived ?? false);
      }
    } catch (error) {
      // eslint-disable-next-line no-console
      console.warn('Failed to read persisted sidebar state', error);
    }
    setIsHydrated(true);
  }, []);

  // Persist on changes
  useEffect(() => {
    if (!isHydrated) return;

    const payload: PersistedSidebarState = { showArchived };
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  }, [showArchived, isHydrated]);

  return {
    showArchived,
    setShowArchived,
    isHydrated,
  };
};
