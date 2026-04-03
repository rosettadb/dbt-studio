/* eslint-disable no-console */
// Agent Service - Business logic for AI Agent operations
// Handles agent execution, cancellation, and tool listing

import { IpcMainInvokeEvent } from 'electron';
import { createDbtAgent } from './ai/dbtAgent';
import MainDatabaseService from './mainDatabase.service';
import type { NewContextItem } from '../schemas/mainDatabase.schema';

// Track active agent executions by conversationId
const activeAgents = new Map<number, AbortController>();

/**
 * Request payload for agent execution
 */
export interface AgentRunRequest {
  conversationId: number;
  content: string;
  contextItems?: Omit<NewContextItem, 'messageId'>[];
  requestedModel?: string;
  projectPath?: string;
}

/**
 * Tool information
 */
export interface AgentTool {
  name: string;
  description: string;
  category: string;
}

/**
 * Agent Service - handles all agent-related business logic
 */
class AgentService {
  /**
   * Run the agent with streaming
   */
  static async runAgent(
    event: IpcMainInvokeEvent,
    request: AgentRunRequest,
  ): Promise<{ success: boolean }> {
    const {
      conversationId,
      content,
      contextItems,
      requestedModel,
      projectPath,
    } = request;

    console.log('[AgentService.runAgent] Starting agent execution:', {
      conversationId,
      contentLength: content.length,
      contextItemsCount: contextItems?.length || 0,
      requestedModel,
      projectPath,
    });

    try {
      // 1. Persist user message
      console.log('[AgentService.runAgent] Persisting user message...');
      await MainDatabaseService.addMessageWithContext(
        conversationId,
        { role: 'user', content },
        contextItems,
      );
      console.log('[AgentService.runAgent] User message persisted');

      // 2. Load conversation history as messages array
      console.log('[AgentService.runAgent] Loading conversation history...');
      const history = await MainDatabaseService.getMessages(conversationId, 20);
      const messages = history
        .filter((m) => m.role !== 'system')
        .map((m) => ({
          role: m.role as 'user' | 'assistant',
          content: m.content,
        }));
      console.log('[AgentService.runAgent] Loaded history:', {
        totalMessages: history.length,
        filteredMessages: messages.length,
      });

      // 3. Create agent with current provider model
      console.log('[AgentService.runAgent] Creating dbt agent...');
      const agent = await createDbtAgent({
        requestedModel,
        projectPath,
      });
      console.log('[AgentService.runAgent] Agent created successfully');

      // 4. Stream — agent.stream() is the v6 API
      const abortController = new AbortController();
      activeAgents.set(conversationId, abortController);
      console.log(
        '[AgentService.runAgent] Agent registered, starting stream...',
      );

      let fullContent = '';
      let chunkCount = 0;
      let toolCallCount = 0;

      try {
        const result = await agent.stream({
          messages,
          abortSignal: abortController.signal,
          onStepFinish: async ({ stepNumber, toolCalls }) => {
            // Notify renderer of tool activity
            if (toolCalls) {
              toolCallCount += toolCalls.length;
              console.log('[AgentService.runAgent] Step finished:', {
                stepNumber,
                toolCallsCount: toolCalls.length,
                totalToolCalls: toolCallCount,
              });

              toolCalls.forEach((tc) => {
                console.log('[AgentService.runAgent] Tool call:', {
                  toolName: tc.toolName,
                  stepNumber,
                });

                event.sender.send('agent:tool-call', {
                  conversationId,
                  toolName: tc.toolName,
                  args: 'args' in tc ? tc.args : {},
                  stepNumber,
                  status: 'done',
                });
              });
            }
          },
        });

        console.log('[AgentService.runAgent] Streaming text chunks...');

        // Stream chunks to renderer via SAME channel as chat
        /* eslint-disable no-restricted-syntax */
        for await (const chunk of result.textStream) {
          if (abortController.signal.aborted) {
            console.log('[AgentService.runAgent] Stream aborted by user');
            break;
          }
          fullContent += chunk;
          chunkCount += 1;

          event.sender.send('chat:message:stream-chunk', {
            conversationId,
            chunk,
            done: false,
          });
        }
        /* eslint-enable no-restricted-syntax */

        console.log('[AgentService.runAgent] Streaming complete:', {
          totalChunks: chunkCount,
          totalToolCalls: toolCallCount,
          contentLength: fullContent.length,
        });

        event.sender.send('chat:message:stream-chunk', {
          conversationId,
          chunk: '',
          done: true,
        });
      } finally {
        activeAgents.delete(conversationId);
        console.log('[AgentService.runAgent] Agent unregistered');
      }

      // 5. Persist assistant response
      console.log('[AgentService.runAgent] Persisting assistant response...');
      await MainDatabaseService.addMessageWithContext(
        conversationId,
        { role: 'assistant', content: fullContent },
        undefined,
      );
      console.log('[AgentService.runAgent] Assistant response persisted');

      console.log(
        '[AgentService.runAgent] Agent execution completed successfully',
      );
      return { success: true };
    } catch (error) {
      console.error('[AgentService.runAgent] Error:', error);
      console.error('[AgentService.runAgent] Error details:', {
        conversationId,
        errorMessage: error instanceof Error ? error.message : 'Unknown error',
        errorStack: error instanceof Error ? error.stack : undefined,
      });
      throw error;
    }
  }

  /**
   * Cancel an active agent execution
   */
  static async cancelAgent(conversationId: number): Promise<{
    success: boolean;
    message: string;
  }> {
    console.log('[AgentService.cancelAgent] Attempting to cancel agent:', {
      conversationId,
    });

    const controller = activeAgents.get(conversationId);
    if (controller) {
      controller.abort();
      activeAgents.delete(conversationId);
      console.log('[AgentService.cancelAgent] Agent cancelled successfully');
      return { success: true, message: 'Agent execution cancelled' };
    }

    console.log('[AgentService.cancelAgent] No active agent found');
    return { success: false, message: 'No active agent execution found' };
  }

  /**
   * List available agent tools
   */
  static async listTools(): Promise<{
    success: boolean;
    tools: AgentTool[];
    error?: string;
  }> {
    console.log('[AgentService.listTools] Listing available tools...');

    try {
      // Return static list of available tools
      // Note: ToolLoopAgent doesn't expose tools directly
      const tools: AgentTool[] = [
        {
          name: 'readDbtModel',
          description: 'Read a dbt model, macro, schema, or config file',
          category: 'dbt',
        },
        {
          name: 'writeDbtModel',
          description: 'Write or update a dbt model SQL or YAML file',
          category: 'dbt',
        },
        {
          name: 'runDbtCommand',
          description: 'Execute a dbt CLI command',
          category: 'dbt',
        },
        {
          name: 'listDbtModels',
          description: 'List all dbt models in the project',
          category: 'dbt',
        },
        {
          name: 'getDbtLogs',
          description: 'Read recent dbt run logs',
          category: 'dbt',
        },
        {
          name: 'listDirectory',
          description: 'List files and directories',
          category: 'filesystem',
        },
        {
          name: 'readFile',
          description: 'Read a text file',
          category: 'filesystem',
        },
        {
          name: 'writeFile',
          description: 'Write a text file',
          category: 'filesystem',
        },
        {
          name: 'pathExists',
          description: 'Check if a file or directory exists',
          category: 'filesystem',
        },
      ];

      console.log('[AgentService.listTools] Tools listed:', {
        totalTools: tools.length,
        categories: [...new Set(tools.map((t) => t.category))],
      });

      return { success: true, tools };
    } catch (error) {
      console.error('[AgentService.listTools] Error:', error);
      return { success: false, tools: [], error: 'Failed to list tools' };
    }
  }
}

export default AgentService;
