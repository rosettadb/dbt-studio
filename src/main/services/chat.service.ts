import MainDatabaseService from './mainDatabase.service';
import type {
  NewContextItem,
  ChatMessage,
} from '../schemas/mainDatabase.schema';
import { AIProviderManager } from './ai/providerManager.service';
import type { CompletionRequest } from './ai/types/completion.types';

// Token management interfaces
interface TokenBudget {
  maxTotal: number;
  recentMessages: number;
  summary: number;
  relevantContext: number;
  buffer: number;
}

interface ConversationPhase {
  phase: 'exploration' | 'implementation' | 'debugging' | 'review';
  recommendedLimit: number;
}

interface ScoredMessage {
  message: ChatMessage;
  index: number;
  score: number;
  isRecent: boolean;
  tokenCount: number;
}

interface ConversationContext {
  recentMessages: ChatMessage[];
  summary: string | null;
  relevantContext: string[];
  totalMessages: number;
  strategy?: {
    phase: string;
    tokensUsed: number;
    tokenBudget: number;
    messagesSelected: number;
    messagesAvailable: number;
  };
}

class ChatService {
  // Track active streaming requests by conversationId
  private static activeStreams: Map<number, { aborted: boolean }> = new Map();

  // Token budget configuration
  private static readonly DEFAULT_BUDGET: TokenBudget = {
    maxTotal: 6000, // Conservative limit for 8k models
    recentMessages: 3500, // 60% for recent messages
    summary: 1000, // 15% for summary
    relevantContext: 800, // 13% for context
    buffer: 700, // 12% buffer for safety
  };

  // Token counting cache for performance
  private static tokenCache = new Map<string, number>();

  static cancelAssistantStream(conversationId: number) {
    const entry = ChatService.activeStreams.get(conversationId);
    if (entry) {
      entry.aborted = true;
      ChatService.activeStreams.set(conversationId, entry);
    }
  }

  // Enhanced method that uses hybrid approach for chat history with token management
  static async streamAssistantReply(
    conversationId: number,
    content: string,
    contextItems: Omit<NewContextItem, 'messageId'>[] | undefined,
    onChunk: (chunk: string, done: boolean) => void,
    customBudget?: Partial<TokenBudget>,
  ) {
    // 1) Persist USER message
    await MainDatabaseService.addMessageWithContext(
      conversationId,
      { role: 'user', content },
      contextItems,
    );

    // 2) Get conversation context using hybrid approach with token management
    const budget = { ...this.DEFAULT_BUDGET, ...customBudget };
    const conversationContext = await this.buildConversationContext(
      conversationId,
      budget,
    );

    // 3) Initialize active provider and model
    const { providerInstance, selectedModel } =
      await AIProviderManager.getInitializedActiveProviderAndModel();

    // 4) Prepare enhanced completion request with optimized context
    const enhancedPrompt = this.formatOptimizedConversationPrompt(
      conversationContext,
      content,
      budget,
    );

    // 5) Validate token count before sending
    const totalTokens = this.countTokens(enhancedPrompt);
    if (totalTokens > budget.maxTotal) {
      console.warn(
        `Prompt exceeds token budget: ${totalTokens}/${budget.maxTotal}. Attempting fallback.`,
      );

      // Fallback: reduce context and try again
      const fallbackContext = await this.buildFallbackContext(
        conversationId,
        budget,
      );
      const fallbackPrompt = this.formatOptimizedConversationPrompt(
        fallbackContext,
        content,
        budget,
      );

      const fallbackTokens = this.countTokens(fallbackPrompt);
      if (fallbackTokens > budget.maxTotal) {
        throw new Error(
          `Unable to fit conversation within token limit. Required: ${fallbackTokens}, Available: ${budget.maxTotal}`,
        );
      }
    }

    // 6) Stream from provider with enhanced context
    let fullContent = '';
    try {
      const request: CompletionRequest = {
        prompt: enhancedPrompt,
        model: selectedModel,
        stream: true,
        type: 'chat',
        context: {
          conversationId,
          tokenCount: totalTokens,
          budget,
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

    // 7) Persist ASSISTANT message
    const assistantMessage = await MainDatabaseService.addMessageWithContext(
      conversationId,
      { role: 'assistant', content: fullContent },
      undefined,
    );

    return assistantMessage;
  }

  // Enhanced method: Token-aware conversation context building
  private static async buildConversationContext(
    conversationId: number,
    budget: TokenBudget,
  ): Promise<ConversationContext> {
    try {
      // Get all messages for analysis
      const allMessages = await MainDatabaseService.getMessages(conversationId);

      if (allMessages.length === 0) {
        return {
          recentMessages: [],
          summary: null,
          relevantContext: [],
          totalMessages: 0,
        };
      }

      // Filter out system messages and sort chronologically
      const userMessages = allMessages
        .filter((message) => message.role !== 'system')
        .sort(
          (a, b) =>
            new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
        );

      // 1. Detect conversation phase and adjust strategy
      const conversationPhase = this.detectConversationPhase(userMessages);
      const MIN_RECENT_MESSAGES = 4;
      const MAX_RECENT_MESSAGES = Math.min(
        100,
        conversationPhase.recommendedLimit,
      );

      // 2. Score all messages by importance and calculate token counts
      const scoredMessages: ScoredMessage[] = userMessages.map(
        (message, index) => ({
          message,
          index,
          score: this.scoreMessageImportance(message),
          isRecent: index >= userMessages.length - MIN_RECENT_MESSAGES,
          tokenCount: this.countTokens(message.content),
        }),
      );

      // 3. Select messages using token-aware hybrid approach
      const selectedMessages = this.selectMessagesWithinBudget(
        scoredMessages,
        budget.recentMessages,
        MIN_RECENT_MESSAGES,
        MAX_RECENT_MESSAGES,
      );

      // Re-sort selected messages chronologically
      const recentMessages = selectedMessages
        .map((sm) => sm.message)
        .sort(
          (a, b) =>
            new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
        );

      // 4. Handle older messages for summary and relevant context
      const selectedIds = new Set(selectedMessages.map((sm) => sm.message.id));
      const olderMessages = userMessages.filter((m) => !selectedIds.has(m.id));

      // Create summary within token budget
      const summary =
        olderMessages.length > 0
          ? await this.createBudgetedSummary(olderMessages, budget.summary)
          : null;

      // Extract relevant context within token budget
      const relevantContext =
        olderMessages.length > 0
          ? await this.extractBudgetedRelevantContext(
              olderMessages,
              userMessages[userMessages.length - 1]?.content,
              budget.relevantContext,
            )
          : [];

      const totalTokensUsed =
        selectedMessages.reduce((sum, sm) => sum + sm.tokenCount, 0) +
        this.countTokens(summary || '') +
        relevantContext.reduce((sum, ctx) => sum + this.countTokens(ctx), 0);

      return {
        recentMessages,
        summary,
        relevantContext,
        totalMessages: userMessages.length,
        strategy: {
          phase: conversationPhase.phase,
          tokensUsed: totalTokensUsed,
          tokenBudget: budget.maxTotal,
          messagesSelected: selectedMessages.length,
          messagesAvailable: userMessages.length,
        },
      };
    } catch (error) {
      console.error('Failed to build conversation context:', error);
      return this.buildFallbackContext(conversationId, budget);
    }
  }

  // New method: Build minimal fallback context when token limits are exceeded
  private static async buildFallbackContext(
    conversationId: number,
    budget: TokenBudget,
  ): Promise<ConversationContext> {
    try {
      // Get minimal recent messages
      const messages = await MainDatabaseService.getMessages(conversationId, 3);
      const recentMessages = messages
        .filter((message) => message.role !== 'system')
        .slice(0, 2); // Only keep last 2 messages

      return {
        recentMessages,
        summary: null,
        relevantContext: [],
        totalMessages: messages.length,
        strategy: {
          phase: 'fallback',
          tokensUsed: recentMessages.reduce(
            (sum, msg) => sum + this.countTokens(msg.content),
            0,
          ),
          tokenBudget: budget.maxTotal,
          messagesSelected: recentMessages.length,
          messagesAvailable: messages.length,
        },
      };
    } catch (error) {
      return {
        recentMessages: [],
        summary: null,
        relevantContext: [],
        totalMessages: 0,
      };
    }
  }

  // Enhanced method: Select messages within token budget
  private static selectMessagesWithinBudget(
    scoredMessages: ScoredMessage[],
    tokenBudget: number,
    minMessages: number,
    maxMessages: number,
  ): ScoredMessage[] {
    const selected: ScoredMessage[] = [];
    let usedTokens = 0;

    // 1. Always include most recent messages (up to minMessages)
    const guaranteedRecent = scoredMessages
      .filter((item) => item.isRecent)
      .slice(-minMessages);

    // eslint-disable-next-line no-restricted-syntax
    for (const item of guaranteedRecent) {
      if (usedTokens + item.tokenCount <= tokenBudget) {
        selected.push(item);
        usedTokens += item.tokenCount;
      } else if (selected.length === 0) {
        // If we can't fit even one message, truncate it
        const truncated = this.truncateMessage(item, tokenBudget);
        selected.push(truncated);
        usedTokens = tokenBudget;
        break;
      }
    }

    // 2. Add additional important messages if token budget allows
    const remainingMessages = scoredMessages
      .filter((item) => !item.isRecent)
      .sort((a, b) => b.score - a.score); // Sort by importance descending

    // eslint-disable-next-line no-restricted-syntax
    for (const item of remainingMessages) {
      if (
        usedTokens + item.tokenCount <= tokenBudget &&
        selected.length < maxMessages
      ) {
        selected.push(item);
        usedTokens += item.tokenCount;
      }
    }

    return selected;
  }

  // New method: Truncate message to fit within token limit
  private static truncateMessage(
    scoredMessage: ScoredMessage,
    maxTokens: number,
  ): ScoredMessage {
    const originalContent = scoredMessage.message.content;
    const truncatedContent = this.truncateText(originalContent, maxTokens - 20); // Reserve tokens for truncation indicator

    return {
      ...scoredMessage,
      message: {
        ...scoredMessage.message,
        content: `${truncatedContent}... [truncated]`,
      },
      tokenCount: maxTokens,
    };
  }

  // New method: Truncate text to specific token count
  private static truncateText(text: string, maxTokens: number): string {
    if (this.countTokens(text) <= maxTokens) {
      return text;
    }

    // Binary search for optimal truncation point
    let left = 0;
    let right = text.length;
    let bestLength = 0;

    while (left <= right) {
      const mid = Math.floor((left + right) / 2);
      const substring = text.substring(0, mid);
      const tokenCount = this.countTokens(substring);

      if (tokenCount <= maxTokens) {
        bestLength = mid;
        left = mid + 1;
      } else {
        right = mid - 1;
      }
    }

    return text.substring(0, bestLength);
  }

  // New method: Create summary within token budget
  private static async createBudgetedSummary(
    olderMessages: ChatMessage[],
    tokenBudget: number,
  ): Promise<string | null> {
    if (olderMessages.length === 0 || tokenBudget <= 0) return null;

    try {
      const summary = await this.summarizeConversationHistory(olderMessages);
      if (!summary) return null;

      // Truncate summary if it exceeds budget
      if (this.countTokens(summary) > tokenBudget) {
        return this.truncateText(summary, tokenBudget);
      }

      return summary;
    } catch (error) {
      return `Earlier conversation with ${olderMessages.length} messages`;
    }
  }

  // New method: Extract relevant context within token budget
  private static async extractBudgetedRelevantContext(
    olderMessages: ChatMessage[],
    currentContent: string,
    tokenBudget: number,
  ): Promise<string[]> {
    if (!currentContent || olderMessages.length === 0 || tokenBudget <= 0) {
      return [];
    }

    try {
      const allRelevantContext = await this.extractRelevantContext(
        olderMessages,
        currentContent,
      );
      const budgetedContext: string[] = [];
      let usedTokens = 0;

      // eslint-disable-next-line no-restricted-syntax
      for (const context of allRelevantContext) {
        const contextTokens = this.countTokens(context);
        if (usedTokens + contextTokens <= tokenBudget) {
          budgetedContext.push(context);
          usedTokens += contextTokens;
        } else {
          // Try to fit a truncated version
          const remainingBudget = tokenBudget - usedTokens;
          if (remainingBudget > 50) {
            // Only if meaningful space remains
            const truncated = this.truncateText(context, remainingBudget);
            budgetedContext.push(`${truncated}... [truncated]`);
          }
          break;
        }
      }

      return budgetedContext;
    } catch (error) {
      return [];
    }
  }

  // Enhanced method: Count tokens with caching
  private static countTokens(text: string): number {
    if (!text) return 0;

    // Check cache first
    if (this.tokenCache.has(text)) {
      return this.tokenCache.get(text)!;
    }

    // Rough approximation: ~4 characters per token for English text
    // For production, consider using tiktoken or similar
    const tokenCount = Math.ceil(text.length / 4);

    // Cache the result (with size limit)
    if (this.tokenCache.size > 1000) {
      // Clear cache when it gets too large
      this.tokenCache.clear();
    }
    this.tokenCache.set(text, tokenCount);

    return tokenCount;
  }

  // Enhanced method: Format optimized conversation prompt with token validation
  private static formatOptimizedConversationPrompt(
    conversationContext: ConversationContext,
    currentMessage: string,
    budget: TokenBudget,
  ): string {
    const { recentMessages, summary, relevantContext, totalMessages } =
      conversationContext;
    const contextLines: string[] = [];

    // Calculate current message tokens
    const currentMsgTokens = this.countTokens(currentMessage);
    const structureTokens = 100; // Estimate for formatting
    const availableTokens =
      budget.maxTotal - currentMsgTokens - structureTokens;

    if (availableTokens <= 0) {
      // Minimal prompt if no room for context
      return `Human: ${currentMessage}\n\nPlease provide a helpful response:`;
    }

    // Add conversation overview if there's history
    if (totalMessages > 0) {
      contextLines.push('=== CONVERSATION CONTEXT ===');

      // Track tokens used in context
      let contextTokensUsed = 0;

      // Add summary if it fits
      if (summary) {
        const summaryTokens = this.countTokens(summary);
        if (contextTokensUsed + summaryTokens <= availableTokens) {
          contextLines.push('');
          contextLines.push('📋 Previous conversation summary:');
          contextLines.push(summary);
          contextTokensUsed += summaryTokens;
        }
      }

      // Add relevant context if it fits
      if (relevantContext.length > 0) {
        const contextText = relevantContext.map((ctx) => `• ${ctx}`).join('\n');
        const contextTokens = this.countTokens(contextText);

        if (contextTokensUsed + contextTokens <= availableTokens) {
          contextLines.push('');
          contextLines.push('🔗 Relevant earlier context:');
          relevantContext.forEach((context: string) => {
            contextLines.push(`• ${context}`);
          });
          contextTokensUsed += contextTokens;
        }
      }

      // Add recent messages (prioritize these)
      if (recentMessages.length > 0) {
        const remainingTokens = availableTokens - contextTokensUsed;
        const fittingMessages = this.fitMessagesInTokenBudget(
          recentMessages,
          remainingTokens,
        );

        if (fittingMessages.length > 0) {
          contextLines.push('');
          contextLines.push('💬 Recent conversation:');
          fittingMessages.forEach((message: ChatMessage, index: number) => {
            const roleLabel = message.role === 'user' ? 'Human' : 'Assistant';
            const messageContent = message.content.trim();

            contextLines.push(`${roleLabel}: ${messageContent}`);

            // Add separator between messages for clarity
            if (index < fittingMessages.length - 1) {
              contextLines.push('---');
            }
          });
        }
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

  // New method: Fit messages within token budget
  private static fitMessagesInTokenBudget(
    messages: ChatMessage[],
    tokenBudget: number,
  ): ChatMessage[] {
    const fitting: ChatMessage[] = [];
    let usedTokens = 0;

    // Start from most recent and work backwards
    // eslint-disable-next-line no-plusplus
    for (let i = messages.length - 1; i >= 0; i--) {
      const message = messages[i];
      const messageTokens = this.countTokens(message.content);

      if (usedTokens + messageTokens <= tokenBudget) {
        fitting.unshift(message);
        usedTokens += messageTokens;
      } else {
        // Try to fit a truncated version of this message
        const remainingTokens = tokenBudget - usedTokens;
        if (remainingTokens > 100) {
          // Only if meaningful space remains
          const truncatedContent = this.truncateText(
            message.content,
            remainingTokens - 20,
          );
          fitting.unshift({
            ...message,
            content: `${truncatedContent}... [truncated]`,
          });
        }
        break;
      }
    }

    return fitting;
  }

  // Helper: Detect conversation phase for adaptive context
  private static detectConversationPhase(
    messages: ChatMessage[],
  ): ConversationPhase {
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

  // New method: Create conversation summary from older messages
  private static async summarizeConversationHistory(
    olderMessages: ChatMessage[],
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
          decisions.push(`${message.content.substring(0, 100)}...`);
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
      console.error('Failed to summarize conversation history:', error);
      return `Earlier conversation with ${olderMessages.length} messages`;
    }
  }

  // New method: Extract relevant context from older messages
  private static async extractRelevantContext(
    olderMessages: ChatMessage[],
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

  // Static method to configure token budget
  static setTokenBudget(budget: Partial<TokenBudget>): void {
    Object.assign(this.DEFAULT_BUDGET, budget);
  }

  // Static method to clear token cache
  static clearTokenCache(): void {
    this.tokenCache.clear();
  }

  // Static method to get token statistics
  static getTokenStats(): Promise<{
    totalMessages: number;
    totalTokens: number;
    averageTokensPerMessage: number;
    cacheSize: number;
  }> {
    // Implementation would calculate token statistics for the conversation
    return Promise.resolve({
      totalMessages: 0,
      totalTokens: 0,
      averageTokensPerMessage: 0,
      cacheSize: this.tokenCache.size,
    });
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
          tokenCount: this.countTokens(content),
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
      const content = `Folder contains ${files.length} items: ${files
        .slice(0, 10)
        .join(', ')}${files.length > 10 ? '...' : ''}`;

      return {
        id: `folder:${folderPath}`,
        type: 'folder' as const,
        name: folderPath.split('/').pop() || folderPath,
        description: `Folder: ${folderPath}`,
        content,
        metadata: {
          path: folderPath,
          fileCount: files.length,
          totalSize: stats.size,
          tokenCount: this.countTokens(content),
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
    const content = 'URL content fetching - implementation pending';
    return {
      id: `url:${url}`,
      type: 'url' as const,
      name: url,
      description: `URL: ${url}`,
      content,
      metadata: {
        url,
        contentType: 'text/html',
        fetchedAt: new Date().toISOString(),
        tokenCount: this.countTokens(content),
      },
    };
  }

  // Search the codebase (placeholder)`
  static async searchCodebase(query: string) {
    const content = `Search results for "${query}" - implementation pending`;
    return [
      {
        id: `search:${query}`,
        type: 'search' as const,
        name: `Search: ${query}`,
        description: `Codebase search for "${query}"`,
        content,
        metadata: {
          query,
          resultCount: 0,
          searchType: 'content' as const,
          tokenCount: this.countTokens(content),
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
