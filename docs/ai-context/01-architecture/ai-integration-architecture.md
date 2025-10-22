# AI Integration Architecture

## Overview

DBT Studio features a comprehensive AI integration system that supports multiple AI providers with advanced conversational capabilities, context management, and structured responses. The system is designed to be provider-agnostic while leveraging the unique capabilities of each AI service.

## Architecture Components

### 1. AI Provider Management System

#### Provider Manager Service (`src/main/services/ai/providerManager.service.ts`)
- **Multi-Provider Support**: OpenAI, Anthropic, Gemini, and Ollama
- **Dynamic Configuration**: Runtime provider switching and configuration
- **Provider Testing**: Connection validation and model availability checking
- **Credential Management**: Secure API key storage using keytar
- **Model Management**: Dynamic model discovery and selection

#### Base Provider Class (`src/main/services/ai/providers/base.provider.ts`)
- **Abstract Interface**: Common interface for all AI providers
- **Generic Type Support**: Strongly typed responses with schema validation
- **Streaming Support**: Async generator-based streaming for real-time responses
- **Error Handling**: Consistent error handling across providers
- **Schema Validation**: JSON schema validation for structured responses

#### Provider Implementations
- **OpenAI Provider**: GPT-4, GPT-3.5-turbo with function calling support
- **Anthropic Provider**: Claude models with advanced reasoning capabilities
- **Gemini Provider**: Google's Gemini models with multimodal support
- **Ollama Provider**: Local model support for privacy-focused deployments

### 2. Chat Service System

#### Chat Service (`src/main/services/chat.service.ts`)
- **Conversational AI**: Advanced chat system with context awareness
- **Token Management**: Intelligent token budgeting and conversation optimization
- **Context Providers**: File, folder, URL, search, and codebase context integration
- **Streaming Support**: Real-time response streaming with cancellation
- **Conversation History**: Hybrid approach for managing long conversations

#### Key Features
- **Token-Aware Context Building**: Intelligent context selection within token limits
- **Conversation Phase Detection**: Adaptive context based on conversation type
- **Message Importance Scoring**: Relevance-based message selection
- **Context Item Resolution**: File and folder content integration
- **Streaming Cancellation**: User-controlled response cancellation

### 3. Database Schema (SQLite with Drizzle ORM)

#### Core Tables
- **ai_providers**: Provider configurations and settings
- **chat_conversations**: Conversation metadata and project associations
- **chat_messages**: Messages with role, content, and metadata
- **context_items**: File, folder, and other context attachments
- **tool_calls**: Tool execution tracking and results
- **ai_usage_logs**: Usage analytics and cost tracking
- **prompt_templates**: Reusable prompt templates

#### Advanced Features
- **Message Relations**: Parent-child relationships for editing/regeneration
- **Context Metadata**: Rich metadata for different context types
- **Usage Analytics**: Comprehensive tracking of AI usage and costs
- **Session Management**: Conversation-specific metadata storage

## Provider-Specific Configurations

### OpenAI Configuration
```typescript
interface OpenAIConfig {
  type: 'openai';
  settings: {
    apiKey: string;        // Stored in keytar
    model: string;         // 'gpt-4o', 'gpt-3.5-turbo', etc.
    temperature: number;
    maxTokens: number;
    organization?: string;
  };
}
```

### Anthropic Configuration
```typescript
interface AnthropicConfig {
  type: 'anthropic';
  settings: {
    apiKey: string;        // Stored in keytar
    model: string;         // 'claude-3-opus', 'claude-3-sonnet', etc.
    temperature: number;
    maxTokens: number;
    systemPrompt?: string;
  };
}
```

### Gemini Configuration
```typescript
interface GeminiConfig {
  type: 'gemini';
  settings: {
    apiKey: string;        // Stored in keytar
    model: string;         // 'gemini-pro', 'gemini-pro-vision'
    temperature: number;
    maxTokens: number;
    projectId?: string;
    location?: string;
  };
}
```

### Ollama Configuration
```typescript
interface OllamaConfig {
  type: 'ollama';
  settings: {
    baseUrl: string;       // Default: 'http://localhost:11434'
    model: string;         // 'llama2', 'codellama', etc.
    temperature: number;
    timeout: number;
    keepAlive?: string;    // '5m', '10m', etc.
  };
}
```

## Context Management System

### Context Types
- **File Context**: Individual file content with metadata
- **Folder Context**: Directory structure and file listings
- **URL Context**: Web content fetching (placeholder)
- **Search Context**: Codebase search results (placeholder)
- **Codebase Context**: Semantic code search (placeholder)

### Context Resolution
```typescript
// File context resolution
static async resolveFileContext(filePath: string) {
  const content = await fs.readFile(filePath, 'utf-8');
  return {
    type: 'file',
    name: path.basename(filePath),
    content,
    metadata: {
      path: filePath,
      language: path.extname(filePath),
      tokenCount: this.countTokens(content),
    },
  };
}
```

### Token Management
- **Budget Allocation**: Configurable token budgets for different context types
- **Conversation Phases**: Adaptive limits based on conversation type
- **Message Scoring**: Importance-based message selection
- **Context Truncation**: Intelligent truncation when limits are exceeded

## Streaming Architecture

### Real-Time Responses
```typescript
async *streamCompletion<T>(request: CompletionRequest<T>): AsyncGenerator<CompletionChunk<T>> {
  const { providerInstance } = await this.getInitializedActiveProviderAndModel(request.model);
  yield* providerInstance.streamCompletion<T>(request);
}
```

### Cancellation Support
- **Active Stream Tracking**: Map-based tracking of active streams
- **User-Controlled Cancellation**: UI-triggered stream cancellation
- **Cleanup Management**: Proper resource cleanup on cancellation

## Structured Response System

### JSON Schema Support
```typescript
interface CompletionRequest<T> {
  prompt: string;
  model?: string;
  schemaConfig?: SchemaConfig<T>;  // For structured responses
}

interface SchemaConfig<T> {
  schema: JSONSchema;
  name?: string;
  description?: string;
  strict?: boolean;
}
```

### Response Validation
- **Schema Validation**: Automatic validation against provided schemas
- **Error Recovery**: Graceful handling of invalid responses
- **Type Safety**: Strongly typed responses with TypeScript generics

## Security & Privacy

### Credential Management
- **Keytar Integration**: Secure credential storage in system keychain
- **Multi-Tenant Isolation**: Project-specific credential isolation
- **API Key Rotation**: Support for credential updates and rotation

### Data Privacy
- **Local Processing**: Ollama support for local model deployment
- **Credential Isolation**: Secure separation of different provider credentials
- **Usage Tracking**: Optional analytics with privacy controls

## Performance Optimizations

### Caching Strategies
- **Token Count Caching**: Performance optimization for token counting
- **Model List Caching**: Cached model availability for faster UI
- **Context Caching**: Reuse of processed context items

### Memory Management
- **Stream Cleanup**: Proper cleanup of streaming resources
- **Context Truncation**: Intelligent context size management
- **Cache Size Limits**: Bounded caches to prevent memory leaks

## Error Handling & Resilience

### Provider-Specific Error Handling
- **Authentication Errors**: Clear messaging for API key issues
- **Rate Limiting**: Graceful handling of quota exceeded errors
- **Network Errors**: Retry logic and timeout handling
- **Model Availability**: Fallback to available models

### User Experience
- **Error Messages**: User-friendly error descriptions with actionable guidance
- **Fallback Strategies**: Automatic fallback to alternative providers
- **Progress Indication**: Clear loading states and progress feedback

## Integration Points

### Frontend Integration
- **React Query Controllers**: Typed hooks for AI operations
- **Chat Components**: Real-time chat interface with streaming
- **Provider Management UI**: Configuration and testing interfaces
- **Context Selection**: File and folder picker integration

### Backend Integration
- **IPC Handlers**: Typed channel handlers for AI operations
- **Service Layer**: Clean separation between AI logic and application logic
- **Database Integration**: Persistent storage of conversations and usage data

## Future Enhancements

### Planned Features
- **Function Calling**: Tool integration for enhanced capabilities
- **Multimodal Support**: Image and document processing
- **Advanced Context**: Semantic search and code understanding
- **Team Collaboration**: Shared conversations and templates
- **Custom Models**: Support for fine-tuned and custom models

### Technical Improvements
- **Performance**: Optimized token counting and context management
- **Scalability**: Support for enterprise-scale deployments
- **Security**: Enhanced security measures and audit logging
- **Accessibility**: Improved accessibility for AI features