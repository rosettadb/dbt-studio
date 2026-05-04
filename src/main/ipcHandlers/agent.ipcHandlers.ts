import { ipcMain } from 'electron';
import AgentService from '../services/agent.service';
import { TerminalConfirmGate } from '../services/ai/tools/terminalConfirmGate';

import type { AgentRunRequest } from '../services/agent.service';

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
};
