import { ipcMain } from 'electron';
import AgentService from '../services/agent.service';
import { TerminalConfirmGate } from '../services/ai/tools/terminalConfirmGate';

export const registerAgentHandlers = () => {
  ipcMain.handle('agent:run', async (event, request) =>
    AgentService.runAgent(event, request),
  );

  ipcMain.handle('agent:cancel', async (_event, { conversationId }) =>
    AgentService.cancelAgent(conversationId),
  );

  ipcMain.handle('agent:tools:list', async () => AgentService.listTools());

  ipcMain.handle('agent:terminal-resolve', async (_event, req) => {
    TerminalConfirmGate.resolve(req.requestId, req.allow);
  });
};
