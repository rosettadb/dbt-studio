import MainDatabaseService from './mainDatabase.service';
import type { NewContextItem } from '../schemas/mainDatabase.schema';
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

  // Streams an assistant reply based on user content. Emits chunks via onChunk.
  // Returns the final persisted assistant message.
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

    // 2) Initialize active provider and model
    const { providerInstance, selectedModel } =
      await AIProviderManager.getInitializedActiveProviderAndModel();

    // 3) Stream from provider
    let fullContent = '';
    try {
      const request: CompletionRequest = {
        prompt: content,
        model: selectedModel,
        stream: true,
        type: 'chat',
        context: { conversationId },
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

    // 4) Persist ASSISTANT message
    const assistantMessage = await MainDatabaseService.addMessageWithContext(
      conversationId,
      { role: 'assistant', content: fullContent },
      undefined,
    );

    return assistantMessage;
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
