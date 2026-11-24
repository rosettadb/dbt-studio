import { useEffect } from 'react';
import {
  NotebookBridgeHandlers,
  registerNotebookBridge,
} from '../notebookBridge.service';

export const useNotebookBridge = (
  handlers: NotebookBridgeHandlers,
  enabled: boolean = true,
) => {
  useEffect(() => {
    if (!enabled) return undefined;

    const unregister = registerNotebookBridge(handlers);
    return () => {
      unregister();
    };
  }, [handlers, enabled]);
};
