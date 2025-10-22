# AI Chat Feature

## Overview

The AI Chat feature provides a comprehensive conversational AI system integrated into DBT Studio, supporting multiple AI providers with advanced context management, streaming responses, and intelligent conversation handling.

## Core Features

### 1. Multi-Provider AI Support

#### Supported Providers
- **OpenAI**: GPT-4, GPT-3.5-turbo with function calling support
- **Anthropic**: Claude models with advanced reasoning capabilities
- **Gemini**: Google's Gemini models with multimodal support
- **Ollama**: Local model support for privacy-focused deployments

#### Provider Management
- **Dynamic Configuration**: Runtime provider switching and configuration
- **Connection Testing**: Real-time provider validation and model discovery
- **Credential Security**: Secure API key storage using system keychain
- **Model Selection**: Automatic and manual model selection per provider

### 2. Advanced Chat System

#### Conversational Features
- **Real-Time Streaming**: Live response streaming with cancellation support
- **Context Awareness**: File, folder, and project context integration
- **Conversation History**: Persistent chat history with project association
- **Message Management**: Edit, regenerate, and delete message support

#### Context Integration
```typescript
// Context types supported
type ContextItemType = 'file' | 'folder' | 'url' | 'search' | 'codebase';

// File context example
const fileContext = await ChatService.resolveFileContext('/path/to/file.sql');
// Folder context example
const folderContext = await ChatService.resolveFolderContext('/path/to/models');
```

### 3. Intelligent Token Management

#### Token Budgeting
- **Configurable Budgets**: Customizable token allocation for different context types
- **Conversation Phases**: Adaptive limits based on conversation type (exploration, implementation, debugging, review)
- **Message Scoring**: Importance-based message selection for context optimization
- **Smart Truncation**: Intelligent content truncation when limits are exceeded

#### Budget Configuration
```typescript
interface TokenBudget {
  maxTotal: number;        // Total token limit (default: 6000)
  recentMessages: number;  // Recent messages allocation (60%)
  summary: number;         // Summary allocation (15%)
  relevantContext: number; // Context allocation (13%)
  buffer: number;          // Safety buffer (12%)
}
```

### 4. Context Management System

#### Context Providers
- **File Context**: Individual file content with syntax highlighting metadata
- **Folder Context**: Directory structure and file listings
- **Project Context**: dbt project structure and model relationships
- **Schema Context**: Database schema information and table relationships

#### Context Resolution
```typescript
// Automatic context resolution
const contextItems = [
  { type: 'file', path: 'models/staging/stg_users.sql' },
  { type: 'folder', path: 'models/marts' },
];

// Context is automatically resolved and included in AI requests
await ChatService.streamAssistantReply(conversationId, message, contextItems, onChunk);
```

### 5. Streaming & Real-Time Features

#### Streaming Architecture
- **Async Generators**: Efficient streaming using async generator patterns
- **Cancellation Support**: User-controlled response cancellation
- **Progress Tracking**: Real-time progress indication and token usage
- **Error Recovery**: Graceful handling of streaming errors

#### Streaming Implementation
```typescript
// Streaming with cancellation support
for await (const { content, done, metadata } of providerInstance.streamCompletion(request)) {
  if (ChatService.isStreamCancelled(conversationId)) {
    break; // Handle cancellation
  }
  onChunk(content, done);
}
```

### 6. Conversation Management

#### Conversation Features
- **Project Association**: Link conversations to specific dbt projects
- **Title Generation**: Automatic conversation title generation
- **Search & Filter**: Find conversations by content, project, or date
- **Export/Import**: Conversation backup and sharing capabilities

#### Database Schema
```sql
-- Core conversation tables
CREATE TABLE chat_conversations (
  id INTEGER PRIMARY KEY,
  title TEXT NOT NULL,
  project_id INTEGER,
  provider_id INTEGER,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE chat_messages (
  id INTEGER PRIMARY KEY,
  conversation_id INTEGER NOT NULL,
  role TEXT NOT NULL, -- 'user', 'assistant', 'system'
  content TEXT NOT NULL,
  metadata TEXT, -- JSON metadata
  context_items TEXT, -- JSON context items
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
```

## Implementation Architecture

### 1. Backend Services

#### Chat Service (`src/main/services/chat.service.ts`)
- **Conversation Management**: Create, update, delete conversations
- **Message Handling**: Store and retrieve messages with context
- **Streaming Coordination**: Manage real-time response streaming
- **Context Resolution**: Resolve file, folder, and project context

#### AI Provider Manager (`src/main/services/ai/providerManager.service.ts`)
- **Provider Lifecycle**: Initialize, test, and manage AI providers
- **Model Management**: Discover and select appropriate models
- **Credential Management**: Secure storage and retrieval of API keys
- **Usage Tracking**: Monitor AI usage and costs

#### Main Database Service (`src/main/services/mainDatabase.service.ts`)
- **Data Persistence**: Store conversations, messages, and metadata
- **Query Operations**: Complex queries with proper relations
- **Migration Support**: Database schema versioning and updates

### 2. Frontend Components

#### Chat Interface (`src/renderer/components/chat/`)
- **ChatWindow**: Main chat interface with message display
- **MessageInput**: Rich text input with context attachment
- **ContextPicker**: File and folder selection for context
- **ProviderSelector**: AI provider and model selection

#### AI Management (`src/renderer/components/ai/`)
- **ProviderConfig**: Provider configuration and testing
- **ModelSelector**: Model selection and availability display
- **UsageStats**: AI usage analytics and cost tracking

### 3. State Management

#### React Query Integration
```typescript
// Chat controllers using React Query
export const useChatConversations = (projectId?: number) => {
  return useQuery(['chat', 'conversations', projectId], () =>
    chatService.getConversations(projectId)
  );
};

export const useStreamMessage = () => {
  return useMutation(
    ({ conversationId, message, context }: StreamMessageParams) =>
      chatService.streamMessage(conversationId, message, context)
  );
};
```

#### Context Providers
- **AppProvider**: Global application state including AI provider status
- **ProcessProvider**: Background process tracking for AI operations
- **QueryClientContext**: React Query configuration for AI operations

## User Experience Features

### 1. Chat Interface

#### Message Display
- **Syntax Highlighting**: Code blocks with language-specific highlighting
- **Markdown Rendering**: Rich text rendering with GitHub-flavored markdown
- **Context Indicators**: Visual indicators for attached context items
- **Streaming Animation**: Real-time typing indicators during streaming

#### Input Features
- **Rich Text Editor**: Monaco-based editor for complex queries
- **Context Attachment**: Drag-and-drop file and folder attachment
- **Command Shortcuts**: Keyboard shortcuts for common operations
- **Auto-Save**: Automatic saving of draft messages

### 2. Context Management

#### Context Picker
- **File Browser**: Integrated file browser for context selection
- **Project Explorer**: dbt project structure navigation
- **Recent Items**: Quick access to recently used context items
- **Context Preview**: Preview of selected context before sending

#### Context Display
- **Context Cards**: Visual representation of attached context
- **Token Usage**: Real-time token count for context items
- **Context Filtering**: Filter and search within large context items

### 3. Provider Management

#### Provider Configuration
- **Setup Wizard**: Step-by-step provider configuration
- **Connection Testing**: Real-time provider validation
- **Model Discovery**: Automatic model availability checking
- **Usage Monitoring**: Real-time usage and cost tracking

#### Model Selection
- **Model Comparison**: Side-by-side model capability comparison
- **Performance Metrics**: Response time and quality indicators
- **Cost Estimation**: Estimated costs for different models

## Advanced Features

### 1. Structured Responses

#### Schema-Based Responses
```typescript
// Define response schema
const schema: JSONSchema = {
  type: 'object',
  properties: {
    query: { type: 'string' },
    explanation: { type: 'string' },
    tables: { type: 'array', items: { type: 'string' } }
  },
  required: ['query', 'explanation']
};

// Request structured response
const response = await AIProviderManager.generateTypedCompletion({
  prompt: 'Generate a SQL query to find top customers',
  schemaConfig: { schema }
});
```

#### Response Validation
- **Automatic Validation**: Schema validation for structured responses
- **Error Recovery**: Graceful handling of invalid responses
- **Type Safety**: Strongly typed responses with TypeScript generics

### 2. Usage Analytics

#### Tracking Features
- **Token Usage**: Detailed token consumption tracking
- **Cost Analysis**: Real-time cost calculation and budgeting
- **Performance Metrics**: Response time and success rate monitoring
- **Provider Comparison**: Comparative analysis across providers

#### Analytics Dashboard
- **Usage Graphs**: Visual representation of AI usage over time
- **Cost Breakdown**: Detailed cost analysis by provider and operation
- **Performance Trends**: Response time and quality trends
- **Budget Alerts**: Notifications for usage thresholds

### 3. Template System

#### Prompt Templates
- **Reusable Prompts**: Save and reuse common prompt patterns
- **Variable Substitution**: Dynamic prompt generation with variables
- **Category Organization**: Organize templates by use case
- **Sharing**: Export and import template collections

#### Template Categories
- **SQL Generation**: Templates for SQL query generation
- **Code Review**: Templates for code analysis and review
- **Documentation**: Templates for generating documentation
- **Debugging**: Templates for troubleshooting and debugging

## Security & Privacy

### 1. Credential Management

#### Secure Storage
- **Keytar Integration**: System keychain storage for API keys
- **Encryption**: Encrypted storage of sensitive configuration
- **Access Control**: Role-based access to different providers
- **Audit Logging**: Track credential access and usage

#### Multi-Tenant Security
- **Project Isolation**: Separate credentials per project
- **User Separation**: Individual credential storage per user
- **Permission Management**: Fine-grained access control

### 2. Data Privacy

#### Local Processing
- **Ollama Support**: Local model deployment for sensitive data
- **Data Retention**: Configurable conversation retention policies
- **Export Control**: User control over data export and sharing
- **Anonymization**: Optional data anonymization for analytics

#### Privacy Controls
- **Opt-Out Options**: Granular privacy control settings
- **Data Minimization**: Minimal data collection and storage
- **Consent Management**: Clear consent for data usage
- **Compliance**: GDPR and other privacy regulation compliance

## Performance Optimizations

### 1. Caching Strategies

#### Response Caching
- **Token Count Caching**: Cache token counts for performance
- **Model List Caching**: Cache available models per provider
- **Context Caching**: Reuse processed context items
- **Response Caching**: Cache similar responses for faster retrieval

#### Memory Management
- **Stream Cleanup**: Proper cleanup of streaming resources
- **Context Limits**: Bounded context to prevent memory issues
- **Cache Eviction**: LRU eviction for memory management

### 2. Network Optimization

#### Request Optimization
- **Request Batching**: Batch multiple requests when possible
- **Connection Pooling**: Reuse connections for better performance
- **Retry Logic**: Intelligent retry with exponential backoff
- **Timeout Management**: Configurable timeouts per provider

## Error Handling & Resilience

### 1. Error Recovery

#### Provider Errors
- **Authentication Errors**: Clear guidance for API key issues
- **Rate Limiting**: Graceful handling of quota exceeded
- **Network Errors**: Automatic retry with backoff
- **Model Unavailability**: Fallback to alternative models

#### User Experience
- **Error Messages**: User-friendly error descriptions
- **Recovery Actions**: Suggested actions for error resolution
- **Fallback Options**: Alternative providers or models
- **Progress Preservation**: Maintain conversation state during errors

### 2. Monitoring & Alerting

#### Health Monitoring
- **Provider Health**: Real-time provider status monitoring
- **Performance Tracking**: Response time and error rate tracking
- **Usage Monitoring**: Track usage against quotas and budgets
- **Alert System**: Notifications for issues and thresholds

## Integration Points

### 1. DBT Integration

#### Project Context
- **Model Relationships**: Understand dbt model dependencies
- **Schema Integration**: Access to database schema information
- **Configuration Context**: Include dbt configuration in conversations
- **Documentation**: Generate and update dbt documentation

#### Workflow Integration
- **Model Generation**: AI-assisted model creation
- **Query Optimization**: Optimize existing dbt models
- **Testing**: Generate and improve dbt tests
- **Documentation**: Automated documentation generation

### 2. Database Integration

#### Schema Awareness
- **Table Relationships**: Understand database schema relationships
- **Data Types**: Context-aware data type suggestions
- **Query Validation**: Validate generated queries against schema
- **Performance**: Query performance optimization suggestions

## Future Enhancements

### 1. Advanced AI Features

#### Planned Capabilities
- **Function Calling**: Tool integration for enhanced capabilities
- **Multimodal Support**: Image and document processing
- **Code Understanding**: Advanced code analysis and generation
- **Workflow Automation**: AI-driven workflow automation

#### Technical Improvements
- **Performance**: Optimized token counting and context management
- **Scalability**: Support for enterprise-scale deployments
- **Security**: Enhanced security measures and audit logging
- **Accessibility**: Improved accessibility for AI features

### 2. Collaboration Features

#### Team Features
- **Shared Conversations**: Team conversation sharing
- **Template Libraries**: Shared prompt template libraries
- **Usage Governance**: Team usage policies and controls
- **Knowledge Base**: Organizational knowledge integration

#### Enterprise Features
- **SSO Integration**: Single sign-on for enterprise deployments
- **Audit Logging**: Comprehensive audit trails
- **Compliance**: Enhanced compliance and governance features
- **Custom Models**: Support for organization-specific models