import { ToolLoopAgent, stepCountIs, ModelMessage } from 'ai';
import { getVercelModel } from './ai/agentAdapter';
import MainDatabaseService from './mainDatabase.service';
import ActiveMemoryService from './activeMemory.service';
import AgentMemoryService from './agentMemory.service';
import { createMemoryTools } from './ai/tools/memory.tools';
import { loadAISettings } from './agent.service';
import type {
  ActiveMemoryRecallRequest,
  ActiveMemoryRecallResult,
} from '../../types/agentMemory';
import type { AgentMemoryScope } from '../../types/backend';

// In-memory circuit breaker state
let consecutiveFailures = 0;
let circuitOpenUntil = 0;

export default class ActiveMemoryAgentService {
  /**
   * Execute proactive recall with bounded latency and safe failure behavior.
   */
  static async recall(
    req: ActiveMemoryRecallRequest,
  ): Promise<ActiveMemoryRecallResult> {
    const now = Date.now();

    if (now < circuitOpenUntil) {
      return {
        status: 'circuit_open',
        summary: '',
        sourceMemoryIds: [],
        elapsedMs: 0,
      };
    }

    try {
      const settings = await loadAISettings();
      const activeMemorySettings = settings.memory?.activeMemory;

      if (!activeMemorySettings || !activeMemorySettings.enabled) {
        return {
          status: 'skipped',
          summary: '',
          sourceMemoryIds: [],
          elapsedMs: 0,
        };
      }

      // Build mode-specific context
      const messages = await MainDatabaseService.getMessages(
        req.conversationId,
      );
      if (!messages || messages.length === 0) {
        return {
          status: 'skipped',
          summary: '',
          sourceMemoryIds: [],
          elapsedMs: 0,
        };
      }

      const coreMessages: ModelMessage[] = [];
      const mode = activeMemorySettings.mode ?? 'recent';

      if (mode === 'message') {
        const lastMsg = messages[messages.length - 1];
        coreMessages.push({ role: 'user', content: lastMsg.content });
      } else if (mode === 'recent') {
        // Last 2 user turns and 1 assistant turn = last 3 messages at most
        const recent = messages.slice(-3);
        recent.forEach((m) => {
          coreMessages.push({
            role: m.role === 'user' ? 'user' : 'assistant',
            content: m.content,
          });
        });
      } else if (mode === 'full') {
        const maxChars = (activeMemorySettings.maxInputTokens ?? 2000) * 4;
        let charCount = 0;

        for (let i = messages.length - 1; i >= 0; i -= 1) {
          const msg = messages[i];
          if (charCount + msg.content.length > maxChars) {
            break;
          }
          coreMessages.unshift({
            role: msg.role === 'user' ? 'user' : 'assistant',
            content: msg.content,
          });
          charCount += msg.content.length;
        }
      }

      const redactedMessages = coreMessages.map((m) => ({
        ...m,
        content: AgentMemoryService.redactSensitiveText(m.content as string),
      }));

      const scope: AgentMemoryScope = {
        screenKey: req.scopeKey as any,
        projectId: req.projectId,
        connectionId: req.connectionId,
        notebookId: req.notebookId,
      };

      const allMemoryTools = createMemoryTools(scope);
      const allowedTools = {
        memory_search: allMemoryTools.memory_search,
        memory_status: allMemoryTools.memory_status,
      };

      const systemPrompt = `You are a proactive memory retrieval agent. 
Your ONLY job is to search the memory graph using the provided tools to find relevant context for the user's latest message.
Analyze the user's message, extract key entities or concepts, search for them, and summarize what you found.
DO NOT answer the user's question directly.
Instead, summarize ANY relevant memories you found. If you find nothing useful, say "No relevant memory found."`;

      // Enforce timeout Ms with fail-open behavior
      const timeoutMs = Math.max(
        1000,
        Math.min(60000, activeMemorySettings.timeoutMs ?? 5000),
      );

      const abortController = new AbortController();
      const timeoutId = setTimeout(() => abortController.abort(), timeoutMs);

      const model = await getVercelModel();

      const agent = new ToolLoopAgent({
        model: model as any,
        instructions: systemPrompt,
        tools: allowedTools,
        stopWhen: stepCountIs(3),
      });

      const result = await agent.stream({
        messages: redactedMessages as any,
        abortSignal: abortController.signal,
      });

      let finalSummary = '';
      let promptTokens = 0;
      let completionTokens = 0;
      const sourceMemoryIds = new Set<number>();

      const streamIterator = result.fullStream[Symbol.asyncIterator]();
      let streamResult = await streamIterator.next();
      while (!streamResult.done) {
        const chunk = streamResult.value;
        if (chunk.type === 'text-delta') {
          finalSummary += (chunk as any).textDelta || '';
        } else if (
          chunk.type === 'tool-result' &&
          chunk.toolName === 'memory_search'
        ) {
          const output = (chunk as any).output ?? (chunk as any).result;
          if (output?.memories) {
            output.memories.forEach((m: any) => sourceMemoryIds.add(m.id));
          }
        } else if (chunk.type === 'finish') {
          promptTokens = chunk.totalUsage?.inputTokens ?? 0;
          completionTokens = chunk.totalUsage?.outputTokens ?? 0;
        } else if (chunk.type === 'error') {
          const errorObj = (chunk as any).error;
          throw errorObj instanceof Error
            ? errorObj
            : new Error(String(errorObj));
        }
        // eslint-disable-next-line no-await-in-loop
        streamResult = await streamIterator.next();
      }

      clearTimeout(timeoutId);

      // On success, reset circuit
      consecutiveFailures = 0;

      const elapsedMs = Date.now() - now;

      let diagnosticId: undefined | number;

      if (activeMemorySettings.persistTranscripts) {
        diagnosticId = await ActiveMemoryService.recordDiagnostic({
          conversationId: req.conversationId,
          messageId: req.messageId,
          providerId: 'active_memory',
          modelId: 'active_memory_model',
          executionMs: elapsedMs,
          promptTokens,
          completionTokens,
          promptPayload: JSON.stringify(redactedMessages),
          completionPayload: JSON.stringify(finalSummary),
          recallKeysFound:
            sourceMemoryIds.size > 0
              ? Array.from(sourceMemoryIds).join(',')
              : null,
        });
      }

      return {
        status: 'success',
        summary: finalSummary,
        sourceMemoryIds: Array.from(sourceMemoryIds),
        elapsedMs,
        diagnosticId,
      };
    } catch (error: any) {
      const elapsedMs = Date.now() - now;
      consecutiveFailures += 1;

      if (consecutiveFailures >= 3) {
        circuitOpenUntil = Date.now() + 60000; // Open for 60s
      }

      if (error.name === 'AbortError') {
        return {
          status: 'timeout',
          summary: '',
          sourceMemoryIds: [],
          elapsedMs,
        };
      }

      // eslint-disable-next-line no-console
      console.error(
        '[ActiveMemoryAgent] Error during proactive recall:',
        error,
      );
      return { status: 'error', summary: '', sourceMemoryIds: [], elapsedMs };
    }
  }
}
