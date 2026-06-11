import { ipcMain } from 'electron';
import AgentService from '../services/agent.service';
import { TerminalConfirmGate } from '../services/ai/tools/terminalConfirmGate';
import { AgentEditorBridgeService } from '../services/ai/agentEditorBridge.service';
import type { AgentRunRequest } from '../services/agent.service';
import type { GetQueryResultsRequest } from '../../types/backend';

export const registerAgentHandlers = () => {
  ipcMain.handle('agent:run', async (event, request: AgentRunRequest) =>
    AgentService.runAgent(event, request),
  );

  ipcMain.handle('agent:cancel', async (_event, { conversationId }) =>
    AgentService.cancelAgent(conversationId),
  );

  ipcMain.handle('agent:tools:list', async () => AgentService.listTools());

  ipcMain.handle('agent:terminal-resolve', async (_event, req) => {
    TerminalConfirmGate.resolve(req.requestId, req.allow);
  });

  ipcMain.handle(
    'agent:editor:read-response',
    async (
      _event,
      payload: {
        requestId: string;
        success: boolean;
        content?: string;
        error?: string;
      },
    ) => AgentService.resolveEditorReadResponse(payload),
  );

  ipcMain.handle(
    'agent:editor:update-response',
    async (
      _event,
      payload: {
        requestId: string;
        success: boolean;
        applied?: boolean;
        error?: string;
      },
    ) => AgentService.resolveEditorUpdateResponse(payload),
  );

  ipcMain.handle('agent:notebook:state-response', async (_event, payload) =>
    AgentService.resolveNotebookBridgeResponse(payload),
  );

  ipcMain.handle('agent:notebook:cell-read-response', async (_event, payload) =>
    AgentService.resolveNotebookBridgeResponse(payload),
  );

  ipcMain.handle('agent:notebook:cell-add-response', async (_event, payload) =>
    AgentService.resolveNotebookBridgeResponse(payload),
  );

  ipcMain.handle(
    'agent:notebook:cell-update-response',
    async (_event, payload) =>
      AgentService.resolveNotebookBridgeResponse(payload),
  );

  ipcMain.handle('agent:notebook:cell-run-response', async (_event, payload) =>
    AgentService.resolveNotebookBridgeResponse(payload),
  );

  ipcMain.handle(
    'agent:notebook:cell-result-response',
    async (_event, payload) =>
      AgentService.resolveNotebookBridgeResponse(payload),
  );

  // Thin wrapper — all logic in AgentEditorBridgeService (BE-01)
  ipcMain.handle(
    'agent:editor:get-query-results',
    (event, opts: GetQueryResultsRequest) =>
      AgentEditorBridgeService.getQueryResults(event, opts),
  );

  // Renderer replies here after reading QueryResultStore — resolves the pending promise
  ipcMain.handle(
    'agent:editor:query-results-response',
    (
      _event,
      payload: {
        requestId: string;
        snapshot: import('../../types/backend').QueryResultSnapshot;
      },
    ) => AgentEditorBridgeService.resolveQueryResultsResponse(payload),
  );

  // Renderer pushes the result here after an agent-triggered query completes.
  // Stores it so studio_sql_get_agent_run_result can read it synchronously.
  ipcMain.handle(
    'agent:editor:query-run-result',
    (
      _event,
      payload: {
        snapshot: import('../../types/backend').QueryResultSnapshot;
        pushedAt: number;
      },
    ) =>
      AgentEditorBridgeService.storeRunResult(
        payload.snapshot,
        payload.pushedAt,
      ),
  );
};
