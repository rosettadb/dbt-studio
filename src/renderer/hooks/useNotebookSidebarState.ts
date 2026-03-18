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
        const parsed: unknown = JSON.parse(raw);
        const nextShowArchived =
          typeof parsed === 'object' &&
          parsed !== null &&
          typeof (parsed as PersistedSidebarState).showArchived === 'boolean'
            ? (parsed as PersistedSidebarState).showArchived
            : false;
        setShowArchived(nextShowArchived);
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

    try {
      const payload: PersistedSidebarState = { showArchived };
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    } catch (error) {
      // eslint-disable-next-line no-console
      console.warn('Failed to persist sidebar state', error);
    }
  }, [showArchived, isHydrated]);

  return {
    showArchived,
    setShowArchived,
    isHydrated,
  };
};
