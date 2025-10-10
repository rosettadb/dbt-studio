import React from 'react';
import { toast } from 'react-toastify';

const STORAGE_KEY = 'terminalHistory:global';
const HISTORY_LIMIT = 100;

const isBrowserEnvironment = () => typeof window !== 'undefined';

const getSafeHistory = (): string[] => {
  if (!isBrowserEnvironment()) {
    return [];
  }

  try {
    const storedValue = window.localStorage.getItem(STORAGE_KEY);
    if (!storedValue) {
      return [];
    }

    const parsed = JSON.parse(storedValue);
    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed.filter((item): item is string => typeof item === 'string');
  } catch (error) {
    toast.error('Unable to load terminal command history.');
    return [];
  }
};

type UseCommandHistoryReturn = {
  history: string[];
  record: (command: string) => void;
  getPrev: (currentInput: string) => string;
  getNext: (currentInput: string) => string;
  resetPointer: () => void;
  clearHistory: () => void;
};

const useCommandHistory = (): UseCommandHistoryReturn => {
  const [history, setHistory] = React.useState<string[]>(() =>
    getSafeHistory(),
  );
  const [pointer, setPointer] = React.useState<number | null>(null);
  const draftRef = React.useRef<string>('');
  const saveErrorNotifiedRef = React.useRef<boolean>(false);

  React.useEffect(() => {
    if (!isBrowserEnvironment()) {
      return;
    }

    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(history));
      saveErrorNotifiedRef.current = false;
    } catch (error) {
      if (!saveErrorNotifiedRef.current) {
        toast.error('Unable to persist terminal command history.');
        saveErrorNotifiedRef.current = true;
      }
    }
  }, [history]);

  const record = React.useCallback((command: string) => {
    const trimmed = command.trim();
    if (!trimmed) {
      return;
    }

    setHistory((prev) => {
      if (prev[prev.length - 1] === trimmed) {
        return prev;
      }

      const next = [...prev, trimmed];
      if (next.length > HISTORY_LIMIT) {
        return next.slice(next.length - HISTORY_LIMIT);
      }

      return next;
    });

    draftRef.current = '';
    setPointer(null);
  }, []);

  const getPrev = React.useCallback(
    (currentInput: string) => {
      if (!history.length) {
        return currentInput;
      }

      if (pointer === null) {
        draftRef.current = currentInput;
      }

      const nextPointer =
        pointer === null ? history.length - 1 : Math.max(pointer - 1, 0);
      setPointer(nextPointer);
      return history[nextPointer];
    },
    [history, pointer],
  );

  const getNext = React.useCallback(
    (currentInput: string) => {
      if (pointer === null) {
        return currentInput;
      }

      const nextPointer = pointer + 1;
      if (nextPointer >= history.length) {
        setPointer(null);
        const draft = draftRef.current;
        draftRef.current = '';
        return draft;
      }

      setPointer(nextPointer);
      return history[nextPointer];
    },
    [history, pointer],
  );

  const resetPointer = React.useCallback(() => {
    draftRef.current = '';
    setPointer(null);
  }, []);

  const clearHistory = React.useCallback(() => {
    setHistory([]);
    resetPointer();
  }, [resetPointer]);

  return React.useMemo(
    () => ({
      history,
      record,
      getPrev,
      getNext,
      resetPointer,
      clearHistory,
    }),
    [getNext, getPrev, history, record, resetPointer, clearHistory],
  );
};

export default useCommandHistory;
