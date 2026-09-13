import { useEffect } from 'react';
import {
  JupyterBridgeHandlers,
  NotebookBridgeHandlers,
  registerJupyterBridge,
  registerNotebookBridge,
} from '../services/notebookBridge.service';

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

/** Phase 10 — subscribes the Jupyter (Python) notebook agent bridge. */
export const useJupyterBridge = (
  handlers: JupyterBridgeHandlers,
  enabled: boolean = true,
) => {
  useEffect(() => {
    if (!enabled) return undefined;

    const unregister = registerJupyterBridge(handlers);
    return () => {
      unregister();
    };
  }, [handlers, enabled]);
};
