// Agent IPC Handlers - ToolLoopAgent integration for dbt Studio
// Thin wrappers that delegate to AgentService

import { ipcMain } from 'electron';
import AgentService from '../services/agent.service';

/**
 * Register all agent-related IPC handlers
 */
export const registerAgentHandlers = () => {
  // eslint-disable-next-line no-console
  console.log('[AgentIPC] Registering agent IPC handlers...');

  /**
   * Run the agent with streaming
   */
  ipcMain.handle('agent:run', async (event, request) => {
    // eslint-disable-next-line no-console
    console.log('[AgentIPC] agent:run called:', {
      conversationId: request.conversationId,
      contentLength: request.content?.length || 0,
    });

    try {
      const result = await AgentService.runAgent(event, request);
      // eslint-disable-next-line no-console
      console.log('[AgentIPC] agent:run completed successfully');
      return result;
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('[AgentIPC] agent:run error:', error);
      throw error;
    }
  });

  /**
   * Cancel an active agent execution
   */
  ipcMain.handle('agent:cancel', async (_event, { conversationId }) => {
    // eslint-disable-next-line no-console
    console.log('[AgentIPC] agent:cancel called:', { conversationId });

    try {
      const result = await AgentService.cancelAgent(conversationId);
      // eslint-disable-next-line no-console
      console.log('[AgentIPC] agent:cancel completed:', result);
      return result;
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('[AgentIPC] agent:cancel error:', error);
      throw error;
    }
  });

  /**
   * List available tools
   */
  ipcMain.handle('agent:tools:list', async () => {
    // eslint-disable-next-line no-console
    console.log('[AgentIPC] agent:tools:list called');

    try {
      const result = await AgentService.listTools();
      // eslint-disable-next-line no-console
      console.log('[AgentIPC] agent:tools:list completed:', {
        success: result.success,
        toolCount: result.tools.length,
      });
      return result;
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('[AgentIPC] agent:tools:list error:', error);
      throw error;
    }
  });

  // eslint-disable-next-line no-console
  console.log('[AgentIPC] Agent IPC handlers registered successfully');
};
