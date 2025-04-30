import type { StorageManager } from '@mui/material/styles';

// A logger function that can be disabled in production
const logError = (message: string, error: unknown) => {
  // In production, this could be conditionally disabled or use a proper logging service
  if (process.env.NODE_ENV !== 'production') {
    // eslint-disable-next-line no-console
    console.error(message, error);
  }
};

/**
 * Custom theme storage manager for Electron
 * This handles theme preference persistence between app sessions
 */
export const themeStorageManager: StorageManager = (options) => {
  const { key } = options;

  // Collection of handlers to notify when the value changes
  const subscribers = new Set<(value: any) => void>();

  return {
    get: (defaultValue: any) => {
      try {
        // Try to get value from localStorage
        const storedValue = localStorage.getItem(key);
        return storedValue !== null ? JSON.parse(storedValue) : defaultValue;
      } catch (error) {
        // Fallback to default if there's an error
        logError('Failed to retrieve theme from storage:', error);
        return defaultValue;
      }
    },

    set: (value: any) => {
      try {
        // Store in localStorage
        localStorage.setItem(key, JSON.stringify(value));

        // Notify all subscribers about the change
        subscribers.forEach((subscriber) => subscriber(value));
      } catch (error) {
        logError('Failed to store theme in storage:', error);
      }
    },

    subscribe: (handler: (value: any) => void) => {
      subscribers.add(handler);

      // Return unsubscribe function
      return () => {
        subscribers.delete(handler);
      };
    },
  };
};

/**
 * Gets the current theme mode from storage
 * Used for initial app load to avoid flickering
 */
export const getStoredThemeMode = (): 'light' | 'dark' | 'system' => {
  try {
    const storedMode = localStorage.getItem('dbt-studio-theme-mode');
    if (storedMode) {
      const parsed = JSON.parse(storedMode);
      if (parsed === 'light' || parsed === 'dark' || parsed === 'system') {
        return parsed;
      }
    }
    return 'light'; // Default mode
  } catch (e) {
    return 'light'; // Fallback to light if there's an error
  }
};
