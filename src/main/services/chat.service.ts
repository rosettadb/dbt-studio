import MainDatabaseService from './mainDatabase.service';
import type {
  NewContextItem,
  ChatMessage,
} from '../schemas/mainDatabase.schema';
import { AIProviderManager } from './ai/providerManager.service';
import type { CompletionRequest } from './ai/types/completion.types';

class ChatService {
  // Track active streaming requests by conversationId
  private static activeStreams: Map<number, { aborted: boolean }> = new Map();

  static cancelAssistantStream(conversationId: number) {
    const entry = ChatService.activeStreams.get(conversationId);
    if (entry) {
      entry.aborted = true;
      ChatService.activeStreams.set(conversationId, entry);
    }
  }

  // Enhanced method that uses hybrid approach for chat history
  static async streamAssistantReply(
    conversationId: number,
    content: string,
    contextItems: Omit<NewContextItem, 'messageId'>[] | undefined,
    onChunk: (chunk: string, done: boolean) => void,
  ) {
    // 1) Persist USER message
    await MainDatabaseService.addMessageWithContext(
      conversationId,
      { role: 'user', content },
      contextItems,
    );

    // 2) Get conversation context using hybrid approach
    const conversationContext =
      await this.buildConversationContext(conversationId);

    // 3) Initialize active provider and model
    const { providerInstance, selectedModel } =
      await AIProviderManager.getInitializedActiveProviderAndModel();

    // 4) Prepare enhanced completion request with optimized context
    const enhancedPrompt = this.formatOptimizedConversationPrompt(
      conversationContext,
      content,
    );

    // 5) Stream from provider with enhanced context
    let fullContent = '';
    try {
      const request: CompletionRequest = {
        prompt: enhancedPrompt,
        model: selectedModel,
        stream: true,
        type: 'chat',
        context: {
          conversationId,
          // Include conversation metadata for future context providers
          files:
            contextItems
              ?.filter((item) => item.type === 'file')
              .map((item) => item.name) || [],
        },
      };

      // mark this conversation as actively streaming
      ChatService.activeStreams.set(conversationId, { aborted: false });

      /* eslint-disable no-restricted-syntax */
      for await (const {
        content: chunk,
        done,
      } of providerInstance.streamCompletion(request)) {
        const state = ChatService.activeStreams.get(conversationId);
        if (state?.aborted) {
          // emit final done and stop streaming
          onChunk('', true);
          throw new Error('aborted');
        }
        if (chunk) {
          fullContent += chunk;
          onChunk(chunk, !!done);
        }
      }
      /* eslint-enable no-restricted-syntax */
    } catch (err) {
      // If aborted, we've already emitted a final done signal above.
      if (!(err instanceof Error && err.message === 'aborted')) {
        // For other errors, ensure the stream is closed for the renderer
        onChunk('', true);
      }
      throw err;
    } finally {
      // cleanup active stream entry whether success or error
      ChatService.activeStreams.delete(conversationId);
    }

    // 6) Persist ASSISTANT message
    const assistantMessage = await MainDatabaseService.addMessageWithContext(
      conversationId,
      { role: 'assistant', content: fullContent },
      undefined,
    );

    return assistantMessage;
  }

  // New method: Hybrid context building with adaptive strategy
  private static async buildConversationContext(conversationId: number) {
    try {
      // Get all messages for analysis
      const allMessages = await MainDatabaseService.getMessages(conversationId);

      if (allMessages.length === 0) {
        return { recentMessages: [], summary: null, relevantContext: [] };
      }

      // Filter out system messages and sort chronologically
      const userMessages = allMessages
        .filter((message) => message.role !== 'system')
        .sort(
          (a, b) =>
            new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
        );

      // Adaptive strategy: Token budget + conversation phase + message importance
      const CONTEXT_TOKEN_BUDGET = 6000; // Adjust based on model context window
      const MIN_RECENT_MESSAGES = 4; // Always include at least recent 4
      const MAX_RECENT_MESSAGES = 20; // Upper bound for performance

      // 1. Detect conversation phase and adjust strategy
      const conversationPhase = this.detectConversationPhase(userMessages);
      const targetMessageCount = Math.min(
        conversationPhase.recommendedLimit,
        MAX_RECENT_MESSAGES,
      );

      // 2. Score all messages by importance
      const scoredMessages = userMessages.map((message, index) => ({
        message,
        index,
        score: this.scoreMessageImportance(message),
        isRecent: index >= userMessages.length - MIN_RECENT_MESSAGES,
      }));

      // 3. Select messages using hybrid approach
      let selectedMessages: ChatMessage[] = [];
      let currentTokens = 0;

      // Always include most recent messages (up to MIN_RECENT_MESSAGES)
      const guaranteedRecent = scoredMessages
        .filter((item) => item.isRecent)
        .map((item) => item.message);

      selectedMessages = [...guaranteedRecent];
      currentTokens = selectedMessages.reduce(
        (sum, msg) => sum + this.estimateTokenCount(msg.content),
        0,
      );

      // Add additional important messages if token budget allows
      const remainingMessages = scoredMessages
        .filter((item) => !item.isRecent)
        .sort((a, b) => b.score - a.score); // Sort by importance descending

      for (const item of remainingMessages) {
        const messageTokens = this.estimateTokenCount(item.message.content);

        if (
          currentTokens + messageTokens <= CONTEXT_TOKEN_BUDGET &&
          selectedMessages.length < targetMessageCount
        ) {
          selectedMessages.push(item.message);
          currentTokens += messageTokens;
        }
      }

      // Re-sort selected messages chronologically
      const recentMessages = selectedMessages.sort(
        (a, b) =>
          new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
      );

      // 4. Handle older messages for summary and relevant context
      const selectedIds = new Set(selectedMessages.map((m) => m.id));
      const olderMessages = userMessages.filter((m) => !selectedIds.has(m.id));

      // Summarize older messages if they exist
      const summary =
        olderMessages.length > 0
          ? await this.summarizeConversationHistory(olderMessages)
          : null;

      // Extract relevant context from older messages based on current topic
      const relevantContext =
        olderMessages.length > 0
          ? await this.extractRelevantContext(
              olderMessages,
              userMessages[userMessages.length - 1]?.content,
            )
          : [];

      return {
        recentMessages,
        summary,
        relevantContext,
        totalMessages: userMessages.length,
        strategy: {
          phase: conversationPhase.phase,
          tokensUsed: currentTokens,
          tokenBudget: CONTEXT_TOKEN_BUDGET,
          messagesSelected: selectedMessages.length,
          messagesAvailable: userMessages.length,
        },
      };
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('Failed to build conversation context:', error);

      // Fallback to simple recent messages
      const messages = await MainDatabaseService.getMessages(
        conversationId,
        10,
      );
      return {
        recentMessages: messages.filter((message) => message.role !== 'system'),
        summary: null,
        relevantContext: [],
      };
    }
  }

  // Helper: Detect conversation phase for adaptive context
  private static detectConversationPhase(messages: ChatMessage[]): {
    phase: 'exploration' | 'implementation' | 'debugging' | 'review';
    recommendedLimit: number;
  } {
    const lastFewMessages = messages.slice(-5);
    const content = lastFewMessages
      .map((m) => m.content.toLowerCase())
      .join(' ');

    if (
      content.includes('error') ||
      content.includes('debug') ||
      content.includes('fix') ||
      content.includes('issue')
    ) {
      return { phase: 'debugging', recommendedLimit: 15 }; // More context for debugging
    }

    if (
      content.includes('implement') ||
      content.includes('code') ||
      content.includes('function') ||
      content.includes('class')
    ) {
      return { phase: 'implementation', recommendedLimit: 10 }; // Standard context for implementation
    }

    if (
      content.includes('review') ||
      content.includes('summary') ||
      content.includes('overall') ||
      content.includes('complete')
    ) {
      return { phase: 'review', recommendedLimit: 18 }; // Broader context for review
    }

    return { phase: 'exploration', recommendedLimit: 8 }; // Default for exploration/questions
  }

  // Helper: Score message importance for context selection
  private static scoreMessageImportance(message: ChatMessage): number {
    let score = 1; // Base score
    const content = message.content.toLowerCase();

    // Content-based scoring
    if (
      content.includes('error') ||
      content.includes('problem') ||
      content.includes('issue')
    )
      score += 3;
    if (
      content.includes('solution') ||
      content.includes('fixed') ||
      content.includes('resolved')
    )
      score += 3;
    if (
      content.includes('important') ||
      content.includes('key') ||
      content.includes('critical')
    )
      score += 2;
    if (
      content.includes('```') ||
      content.includes('code') ||
      content.includes('function')
    )
      score += 2; // Code blocks
    if (message.contextItems && message.contextItems.length > 0) score += 2; // Messages with file/context
    if (
      content.includes('decision') ||
      content.includes('approach') ||
      content.includes('strategy')
    )
      score += 2;

    // Length consideration (very short or very long messages might be less important)
    const contentLength = content.length;
    if (contentLength > 500 && contentLength < 2000) score += 1; // Sweet spot for detailed explanations
    if (contentLength < 50) score -= 1; // Very short messages might be less informative

    // Role consideration
    if (message.role === 'assistant' && contentLength > 200) score += 1; // Detailed assistant responses

    // Recency bonus (more recent messages get higher scores)
    const ageInHours =
      (Date.now() - new Date(message.createdAt).getTime()) / (1000 * 60 * 60);
    const recencyBonus = Math.max(0, 3 - ageInHours / 12); // Bonus decreases over 36 hours
    score += recencyBonus;

    return score;
  }

  // Helper: Estimate token count for messages
  private static estimateTokenCount(text: string): number {
    // Rough approximation: ~4 characters per token for English text
    // This is a simplified estimate - for production, consider using tiktoken or similar
    return Math.ceil(text.length / 4);
  }

  // New method: Create conversation summary from older messages
  private static async summarizeConversationHistory(
    olderMessages: any[],
  ): Promise<string | null> {
    if (olderMessages.length === 0) return null;

    try {
      // Create a concise summary of key topics and decisions
      const keyPoints: string[] = [];

      // Extract key information patterns
      const topics = new Set<string>();
      const decisions: string[] = [];
      const codeElements: string[] = [];

      olderMessages.forEach((message) => {
        const content = message.content.toLowerCase();

        // Detect technical topics
        if (content.includes('database') || content.includes('sql'))
          topics.add('database work');
        if (content.includes('react') || content.includes('component'))
          topics.add('React development');
        if (content.includes('dbt') || content.includes('model'))
          topics.add('dbt modeling');
        if (content.includes('error') || content.includes('debug'))
          topics.add('troubleshooting');

        // Detect decisions or preferences
        if (
          content.includes('decided') ||
          content.includes('choose') ||
          content.includes('prefer')
        ) {
          decisions.push(message.content.substring(0, 100) + '...');
        }

        // Detect code/technical elements
        if (
          content.includes('```') ||
          content.includes('function') ||
          content.includes('class')
        ) {
          codeElements.push(`${message.role}: discussed code implementation`);
        }
      });

      // Build summary
      if (topics.size > 0) {
        keyPoints.push(`Previous topics: ${Array.from(topics).join(', ')}`);
      }

      if (decisions.length > 0) {
        keyPoints.push(`Key decisions: ${decisions.slice(0, 2).join('; ')}`);
      }

      if (codeElements.length > 0) {
        keyPoints.push(
          `Technical work: ${codeElements.length} code discussions`,
        );
      }

      keyPoints.push(
        `Conversation span: ${olderMessages.length} earlier messages`,
      );

      return keyPoints.length > 0 ? keyPoints.join('. ') : null;
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('Failed to summarize conversation history:', error);
      return `Earlier conversation with ${olderMessages.length} messages`;
    }
  }

  // New method: Extract relevant context from older messages
  private static async extractRelevantContext(
    olderMessages: any[],
    currentContent: string,
  ): Promise<string[]> {
    if (!currentContent || olderMessages.length === 0) return [];

    try {
      const relevantSnippets: string[] = [];
      const currentTopics = this.extractTopicsFromContent(currentContent);

      // Look for messages that share topics with current message
      olderMessages.forEach((message) => {
        const messageTopics = this.extractTopicsFromContent(message.content);
        const hasOverlap = currentTopics.some((topic) =>
          messageTopics.includes(topic),
        );

        if (hasOverlap && message.content.length < 200) {
          relevantSnippets.push(`${message.role}: ${message.content}`);
        } else if (hasOverlap) {
          // For longer messages, extract key sentence
          const sentences = message.content.split(/[.!?]+/);
          const relevantSentence = sentences.find((s: string) =>
            currentTopics.some((topic) => s.toLowerCase().includes(topic)),
          );
          if (relevantSentence) {
            relevantSnippets.push(
              `${message.role}: ${relevantSentence.trim()}...`,
            );
          }
        }
      });

      return relevantSnippets.slice(0, 3); // Limit to top 3 relevant snippets
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('Failed to extract relevant context:', error);
      return [];
    }
  }

  // Helper method: Extract topics from message content
  private static extractTopicsFromContent(content: string): string[] {
    const topics: string[] = [];
    const lowerContent = content.toLowerCase();

    // Technical keywords that indicate topics
    const topicKeywords = [
      'database',
      'sql',
      'query',
      'table',
      'schema',
      'react',
      'component',
      'hook',
      'state',
      'props',
      'dbt',
      'model',
      'transformation',
      'analytics',
      'error',
      'debug',
      'fix',
      'issue',
      'problem',
      'api',
      'endpoint',
      'request',
      'response',
      'typescript',
      'javascript',
      'function',
      'class',
    ];

    topicKeywords.forEach((keyword) => {
      if (lowerContent.includes(keyword)) {
        topics.push(keyword);
      }
    });

    return topics;
  }

  // Enhanced method: Format optimized conversation prompt
  private static formatOptimizedConversationPrompt(
    conversationContext: any,
    currentMessage: string,
  ): string {
    const { recentMessages, summary, relevantContext, totalMessages } =
      conversationContext;

    const contextLines = [];

    // Add conversation overview if there's history
    if (totalMessages > 0) {
      contextLines.push('=== CONVERSATION CONTEXT ===');

      // Add summary of older messages if available
      if (summary) {
        contextLines.push('');
        contextLines.push('📋 Previous conversation summary:');
        contextLines.push(summary);
      }

      // Add relevant context from older messages
      if (relevantContext.length > 0) {
        contextLines.push('');
        contextLines.push('🔗 Relevant earlier context:');
        relevantContext.forEach((context: string) => {
          contextLines.push(`• ${context}`);
        });
      }

      // Add recent conversation history
      if (recentMessages.length > 0) {
        contextLines.push('');
        contextLines.push('💬 Recent conversation:');
        recentMessages.forEach((message: ChatMessage, index: number) => {
          const roleLabel = message.role === 'user' ? 'Human' : 'Assistant';
          const messageContent = message.content.trim();

          contextLines.push(`${roleLabel}: ${messageContent}`);

          // Add separator between messages for clarity
          if (index < recentMessages.length - 1) {
            contextLines.push('---');
          }
        });
      }

      contextLines.push('');
      contextLines.push('=== CURRENT MESSAGE ===');
    }

    // Add current message
    contextLines.push(`Human: ${currentMessage}`);
    contextLines.push('');
    contextLines.push(
      'Please provide a helpful response based on the conversation context above:',
    );

    return contextLines.join('\n');
  }

  // Resolve a file path into a context item
  static async resolveFileContext(filePath: string) {
    const fs = await import('fs-extra');
    try {
      const content = await fs.readFile(filePath, 'utf-8');
      const stats = await fs.stat(filePath);

      return {
        id: `file:${filePath}`,
        type: 'file' as const,
        name: filePath.split('/').pop() || filePath,
        description: `File: ${filePath}`,
        content,
        metadata: {
          path: filePath,
          size: stats.size,
          language: filePath.split('.').pop() || 'text',
        },
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);

      throw new Error(`Failed to read file: ${errorMessage}`);
    }
  }

  // Resolve a folder path into a context item
  static async resolveFolderContext(folderPath: string) {
    const fs = await import('fs-extra');
    try {
      const files = await fs.readdir(folderPath);
      const stats = await fs.stat(folderPath);

      return {
        id: `folder:${folderPath}`,
        type: 'folder' as const,
        name: folderPath.split('/').pop() || folderPath,
        description: `Folder: ${folderPath}`,
        content: `Folder contains ${files.length} items: ${files
          .slice(0, 10)
          .join(', ')}${files.length > 10 ? '...' : ''}`,
        metadata: {
          path: folderPath,
          fileCount: files.length,
          totalSize: stats.size,
        },
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);

      throw new Error(`Failed to read folder: ${errorMessage}`);
    }
  }

  // Resolve a URL into a context item (placeholder)
  static async resolveUrl(url: string) {
    return {
      id: `url:${url}`,
      type: 'url' as const,
      name: url,
      description: `URL: ${url}`,
      content: 'URL content fetching - implementation pending',
      metadata: {
        url,
        contentType: 'text/html',
        fetchedAt: new Date().toISOString(),
      },
    };
  }

  // Search the codebase (placeholder)
  static async searchCodebase(query: string) {
    return [
      {
        id: `search:${query}`,
        type: 'search' as const,
        name: `Search: ${query}`,
        description: `Codebase search for "${query}"`,
        content: `Search results for "${query}" - implementation pending`,
        metadata: {
          query,
          resultCount: 0,
          searchType: 'content' as const,
        },
      },
    ];
  }

  // Tool execution (placeholder)
  static async executeToolCall(toolCallId: number) {
    await MainDatabaseService.updateToolCall(toolCallId, {
      status: 'completed',
      completedAt: new Date().toISOString(),
      toolOutput: JSON.stringify({
        result: 'Tool execution - implementation pending',
      }),
    });

    return { success: true, message: 'Tool execution started' };
  }

  // Tool cancel (placeholder)
  static async cancelToolCall(toolCallId: number) {
    await MainDatabaseService.updateToolCall(toolCallId, {
      status: 'cancelled',
      completedAt: new Date().toISOString(),
    });

    return { success: true, message: 'Tool execution cancelled' };
  }
}

export default ChatService;
