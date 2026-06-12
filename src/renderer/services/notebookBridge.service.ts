export interface NotebookStatePayload {
  requestId: string;
  conversationId: number;
}

export interface CellReadRequestPayload {
  requestId: string;
  conversationId: number;
  cellId: string;
}

export interface CellUpdateRequestPayload {
  requestId: string;
  conversationId: number;
  cellId: string;
  content: string;
}

export interface CellRunRequestPayload {
  requestId: string;
  conversationId: number;
  cellId: string;
}

export interface CellResultRequestPayload {
  requestId: string;
  conversationId: number;
  cellId: string;
}

export interface NotebookBridgeHandlers {
  /** Returns a list of cell summaries (ID, type, preview) */
  getNotebookState: () => {
    notebookId: string;
    notebookName: string;
    cells: Array<{
      id: string;
      type: string;
      order: number;
      contentPreview: string;
      hasOutput: boolean;
      outputRowCount?: number;
    }>;
  };
  getCellContent: (cellId: string) => string;
  /** Creates a new cell with the specified content and returns its generated cellId */
  addCell: (content: string) => string;
  /** Updates the content of a specific cell (Monaco editor) */
  setCellContent: (cellId: string, content: string) => void;
  /** Triggers execution of a cell */
  runCell: (cellId: string) => void;
  /** Returns the last execution result of a cell */
  getCellResult: (cellId: string) => any;
}

export const registerNotebookBridge = (
  handlers: NotebookBridgeHandlers,
): (() => void) => {
  const onStateRequest = async (...args: unknown[]) => {
    const payload = args[0] as NotebookStatePayload;
    try {
      const state = handlers.getNotebookState();
      await window.electron.ipcRenderer.invoke(
        'agent:notebook:state-response',
        {
          requestId: payload.requestId,
          success: true,
          ...state,
        },
      );
    } catch (error) {
      await window.electron.ipcRenderer.invoke(
        'agent:notebook:state-response',
        {
          requestId: payload.requestId,
          success: false,
          error: (error as Error).message,
        },
      );
    }
  };

  const onCellReadRequest = async (...args: unknown[]) => {
    const payload = args[0] as CellReadRequestPayload;
    try {
      const content = handlers.getCellContent(payload.cellId);
      await window.electron.ipcRenderer.invoke(
        'agent:notebook:cell-read-response',
        {
          requestId: payload.requestId,
          success: true,
          content,
        },
      );
    } catch (error) {
      await window.electron.ipcRenderer.invoke(
        'agent:notebook:cell-read-response',
        {
          requestId: payload.requestId,
          success: false,
          error: (error as Error).message,
        },
      );
    }
  };

  const onCellAddRequest = async (...args: unknown[]) => {
    const payload = args[0] as { requestId: string; content: string };
    try {
      const cellId = handlers.addCell(payload.content);
      await window.electron.ipcRenderer.invoke(
        'agent:notebook:cell-add-response',
        {
          requestId: payload.requestId,
          success: true,
          cellId,
        },
      );
    } catch (error) {
      await window.electron.ipcRenderer.invoke(
        'agent:notebook:cell-add-response',
        {
          requestId: payload.requestId,
          success: false,
          error: (error as Error).message,
        },
      );
    }
  };

  const onCellUpdateRequest = async (...args: unknown[]) => {
    const payload = args[0] as CellUpdateRequestPayload;
    try {
      handlers.setCellContent(payload.cellId, payload.content);
      await window.electron.ipcRenderer.invoke(
        'agent:notebook:cell-update-response',
        {
          requestId: payload.requestId,
          success: true,
          applied: true,
        },
      );
    } catch (error) {
      await window.electron.ipcRenderer.invoke(
        'agent:notebook:cell-update-response',
        {
          requestId: payload.requestId,
          success: false,
          applied: false,
          error: (error as Error).message,
        },
      );
    }
  };

  const onCellRunRequest = async (...args: unknown[]) => {
    const payload = args[0] as CellRunRequestPayload;
    try {
      handlers.runCell(payload.cellId);
      // Run request doesn't wait for completion, it just triggers it.
      // The agent can then poll for results or wait for a push event if we implement one.
      await window.electron.ipcRenderer.invoke(
        'agent:notebook:cell-run-response',
        {
          requestId: payload.requestId,
          success: true,
        },
      );
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('[NotebookBridge] Run request failed', error);
      await window.electron.ipcRenderer.invoke(
        'agent:notebook:cell-run-response',
        {
          requestId: payload.requestId,
          success: false,
          error: (error as Error).message,
        },
      );
    }
  };

  const onCellResultRequest = async (...args: unknown[]) => {
    const payload = args[0] as CellResultRequestPayload;
    try {
      const result = handlers.getCellResult(payload.cellId);
      await window.electron.ipcRenderer.invoke(
        'agent:notebook:cell-result-response',
        {
          requestId: payload.requestId,
          success: true,
          result,
        },
      );
    } catch (error) {
      await window.electron.ipcRenderer.invoke(
        'agent:notebook:cell-result-response',
        {
          requestId: payload.requestId,
          success: false,
          error: (error as Error).message,
        },
      );
    }
  };

  const unsubState = window.electron.ipcRenderer.on(
    'agent:notebook:state-request',
    onStateRequest,
  );
  const unsubRead = window.electron.ipcRenderer.on(
    'agent:notebook:cell-read-request',
    onCellReadRequest,
  );
  const unsubAdd = window.electron.ipcRenderer.on(
    'agent:notebook:cell-add-request',
    onCellAddRequest,
  );
  const unsubUpdate = window.electron.ipcRenderer.on(
    'agent:notebook:cell-update-request',
    onCellUpdateRequest,
  );
  const unsubRun = window.electron.ipcRenderer.on(
    'agent:notebook:cell-run-request',
    onCellRunRequest,
  );
  const unsubResult = window.electron.ipcRenderer.on(
    'agent:notebook:cell-result-request',
    onCellResultRequest,
  );

  return () => {
    if (typeof unsubState === 'function') unsubState();
    if (typeof unsubRead === 'function') unsubRead();
    if (typeof unsubAdd === 'function') unsubAdd();
    if (typeof unsubUpdate === 'function') unsubUpdate();
    if (typeof unsubRun === 'function') unsubRun();
    if (typeof unsubResult === 'function') unsubResult();
  };
};
