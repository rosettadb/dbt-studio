# DBT Studio - Project Overview

## Quickstart

- Install deps and start dev per repo README.
- Keep credentials in keytar (never in renderer or git). Use provider-specific envs for cloud auth.
- Add new features via the 7-step flow (see GitHub Copilot Instructions). Create channel, types, service, controller/hook, and UI.
- Run type checks before PR. Keep handlers thin and errors in services.

## Project Overview
This is a DBT Studio Electron application that provides a comprehensive interface for managing dbt projects, database connections, cloud data exploration, and data analytics workflows.

## Architecture
- **Frontend**: React + TypeScript with Material-UI
- **Backend**: Electron main process with Node.js
- **Database**: SQLite for application data (with Drizzle ORM), DuckDB for in-memory data processing
- **Cloud Storage**: AWS S3, Azure Blob Storage, Google Cloud Storage support
- **State Management**: React Query (v3) for server state management
- **Security**: Keytar-based secure credential storage
- **Git Integration**: Simple-git for version control operations
- **AI Integration**: Multi-provider AI system with OpenAI, Anthropic, Gemini, and Ollama support

## Core Services & Features

### 1. Database Connection Management
- **Supported Databases**: PostgreSQL, Snowflake, BigQuery, Redshift, Databricks, DuckDB
- **Implemented Schema Extractors**: PostgreSQL, Snowflake, BigQuery, Redshift, Databricks, DuckDB
- **Connection Testing**: Real-time connection validation with provider-specific testing
- **Secure Storage**: Encrypted credential management using keytar with multi-tenant isolation
- **Schema Extraction**: Automatic database schema discovery and caching for all supported databases
- **Profile Generation**: Automatic dbt profiles.yml and Rosetta main.conf generation
- **Connection Validation**: Comprehensive validation with reserved name handling for templates

### 2. Cloud Explorer Service
- **Cloud Providers**: AWS S3, Azure Blob Storage, Google Cloud Storage
- **Features**: Bucket browsing, file preview, hierarchical navigation
- **Data Preview**: DuckDB-powered in-memory data preview for multiple file formats
- **Supported Formats**: Parquet, CSV, JSON, Excel, Avro, Arrow, Delta Lake, SQLite
- **Authentication**: Secure cloud credential management with provider-specific auth methods

### 3. Project Management Service
- **DBT Integration**: Full dbt project lifecycle management
- **File Operations**: Create, read, update, delete project files and folders
- **Version Control**: Git integration for project versioning
- **Query Management**: SQL query editor with execution capabilities
- **Schema Integration**: Automatic schema extraction and model generation

### 4. Settings & Configuration Service
- **CLI Management**: Automatic rosetta and dbt CLI installation and updates
- **Python Environment**: Integrated Python environment management
- **Path Configuration**: Dynamic path resolution and configuration
- **Update Management**: Automatic application and CLI tool updates

### 5. Git Version Control Service
- **Repository Operations**: Init, clone, pull, push, commit, checkout
- **Branch Management**: List, create, switch branches
- **Remote Management**: Add and manage remote repositories
- **File Tracking**: Git status, diff, and staging operations

### 6. Security & Storage Services
- **Secure Storage**: Keytar-based credential encryption
- **Multi-tenant**: Project-specific credential isolation
- **API Key Management**: OpenAI and other service API key storage
- **Database Credentials**: Secure database connection credential storage

### 7. AI Provider Management & Chat Service
- **Multi-Provider Support**: OpenAI, Anthropic, Gemini, and Ollama integration
- **Provider Management**: Dynamic provider configuration, testing, and switching
- **Conversational AI**: Advanced chat system with context management and streaming
- **Streaming**: Use provider streaming when available; surface partial tokens to UI components.
- **Context Providers**: File, folder, URL, search, and codebase context integration
- **Token Management**: Intelligent token budgeting and conversation optimization
- **Structured Responses**: JSON schema-based structured AI responses
- **Usage Analytics**: Comprehensive AI usage tracking and cost estimation

### 8. Analytics & Usage Tracking
- **AI Usage Analytics**: Token usage, cost tracking, and performance metrics
- **Application Telemetry**: Usage patterns and feature adoption tracking
- **Provider Performance**: Response time and success rate monitoring

### 9. Update & Maintenance Services
- **Auto-Updates**: Electron auto-updater integration
- **CLI Updates**: Automatic Rosetta and dbt CLI version management
- **Release Management**: Version checking and update notifications
- **Factory Reset**: Complete application reset with credential cleanup

### 10. Cloud Preview Service
- **DuckDB Integration**: In-memory data preview for cloud storage files
- **Multi-Format Support**: Parquet, CSV, JSON, Excel, Avro, Arrow, Delta Lake, SQLite
- **Performance Optimization**: Efficient preview with sampling and pagination
- **Security**: Sign URLs where supported; never expose raw long-lived credentials to renderer.

### 11. Main Database Service
- **SQLite Database**: Application data storage with Drizzle ORM
- **Schema Management**: AI providers, conversations, messages, context items
- **Relationship Management**: Complex queries with proper relations
- **Migration Support**: Database schema versioning and updates

## Development Guidelines

### Code Style
- Use TypeScript with strict typing
- Follow React functional component patterns with hooks
- Use Material-UI components for consistent UI
- Implement proper error handling and user feedback
- Use React Query for server state management
- Follow service-oriented architecture patterns

### Frontend Architecture with Services and React Query

The frontend follows a service-oriented architecture with React Query for state management:

#### Frontend Services (`src/renderer/services/[feature].service.ts`)
- **Client-side service layer**: Contains functions that invoke IPC channels to communicate with backend
- **IPC Communication**: Uses `window.electron.ipcRenderer.invoke()` for backend communication
- **Type Safety**: Strongly typed interfaces for all service calls
- **Examples**: `chatService.getConversations()`, `connectorsService.testConnection()`

#### React Query Controllers (`src/renderer/controllers/[feature].controller.ts`)
- **Custom React Hooks**: Wrap service calls with React Query for state management
- **Caching & Invalidation**: Automatic caching, background updates, and cache invalidation
- **Loading & Error States**: Built-in loading, error, and success state management
- **Optimistic Updates**: Support for optimistic UI updates
- **Examples**: `useChatConversations()`, `useTestConnection()`, `useAIProviders()`

#### Service Layer Architecture
- **Main Process Services**: Located in `src/main/services/` - Backend business logic
- **Renderer Services**: Located in `src/renderer/services/` - Frontend IPC communication layer
- **Controllers**: Located in `src/renderer/controllers/` - React Query hooks wrapping services
- **IPC Handlers**: Located in `src/main/ipcHandlers/` - Electron IPC communication handlers

#### Frontend Data Flow
```
React Component → React Query Hook (Controller) → Frontend Service → IPC Channel → Backend Service
```

Example:
```typescript
// 1. React Component uses hook
const { data: conversations, isLoading } = useChatConversations(projectId);

// 2. Hook wraps service call with React Query
export const useChatConversations = (projectId?: number) => {
  return useQuery(['chat', 'conversations', projectId], () =>
    chatService.getConversations(projectId)
  );
};

// 3. Service makes IPC call
export const getConversations = (projectId?: number) => {
  return window.electron.ipcRenderer.invoke('chat:conversation:list', projectId);
};

// 4. IPC handler delegates to backend service
ipcMain.handle('chat:conversation:list', async (_e, projectId) => 
  ChatService.getSessions(projectId)
);
```

### File Structure
```
src/
├── main/                    # Electron main process
│   ├── services/           # Backend services (12+ services)
│   │   ├── projects.service.ts       # Project management
│   │   ├── connectors.service.ts     # Database connections
│   │   ├── cloudExplorer.service.ts  # Cloud storage operations
│   │   ├── cloudPreview.service.ts   # DuckDB data preview
│   │   ├── settings.service.ts       # Configuration management
│   │   ├── git.service.ts            # Version control
│   │   ├── secureStorage.service.ts  # Credential management
│   │   ├── chat.service.ts           # Conversational AI
│   │   ├── analytics.service.ts      # Usage tracking
│   │   ├── update.service.ts         # Auto-updates
│   │   ├── mainDatabase.service.ts   # SQLite database operations
│   │   └── ai/                       # AI provider system
│   │       ├── providerManager.service.ts  # AI provider management
│   │       ├── providers/            # AI provider implementations
│   │       │   ├── base.provider.ts  # Base provider class
│   │       │   ├── openai.provider.ts
│   │       │   ├── anthropic.provider.ts
│   │       │   ├── gemini.provider.ts
│   │       │   └── ollama.provider.ts
│   │       └── types/               # AI type definitions
│   ├── helpers/            # Utility functions
│   ├── ipcHandlers/        # IPC communication handlers
│   ├── extractor/          # Database schema extractors
│   ├── schemas/            # Drizzle ORM schemas
│   └── utils/              # Utility functions
├── renderer/               # React frontend
│   ├── components/         # React components
│   │   ├── ai/             # AI-related components
│   │   ├── chat/           # Chat interface components
│   │   ├── cloudExplorer/  # Cloud storage components
│   │   ├── connections/    # Database connection components
│   │   ├── editor/         # Code editor components
│   │   └── sqlEditor/      # SQL editor components
│   ├── screens/            # Page components
│   ├── services/           # Frontend service clients
│   ├── controllers/        # React Query hooks
│   ├── context/            # React context providers
│   └── hooks/              # Custom React hooks
└── types/                  # TypeScript type definitions
    ├── backend.ts          # Backend type definitions
    └── frontend.ts         # Frontend type definitions
```

## 🔥 CRITICAL: Electron Command Flow Architecture

**THIS IS THE MOST IMPORTANT RULE - ALWAYS FOLLOW THIS PATTERN**

When implementing ANY new feature or command in this Electron application, you MUST follow this exact 7-step flow:

### 1. Frontend Service (`src/renderer/services/[feature].service.ts`)

- Contains client-side functions that invoke IPC channels
- Uses `window.electron.ipcRenderer.invoke('channel:name', data)`
- Example: `updateService.checkForUpdates()` → `window.electron.ipcRenderer.invoke('updates:check')`

### 2. Frontend Controller (`src/renderer/controllers/[feature].controller.ts`)

- Contains React hooks that wrap service calls
- Integrates with React Query for state management
- Example: `useCheckForUpdates()` → calls `updateService.checkForUpdates()`

### 3. IPC Handler Registration (`src/main/ipcHandlers/[feature].ipcHandlers.ts`)

- Registers IPC channel handlers with `ipcMain.handle()`
- Calls corresponding backend service methods
- **MUST be lean and minimal** - only handle IPC parameter routing
- **NO try-catch blocks** - error handling is done in service layer
- **NO business logic** - pure delegation to services
- Example: `ipcMain.handle('updates:check', () => UpdateManager.checkForUpdates())`

#### IPC Handler Rule (Must Follow)

- IPC handler functions must be thin wrappers that just call a single service method with routed params.
- Do not add logic, branching, or side-effects in handlers. Keep handlers idempotent and declarative.
- **NO try-catch blocks** - error handling is done in service layer
- **NO business logic** - pure delegation to services
- **NO console.log or console.error** - logging is done in services
- Example from `src/main/ipcHandlers/secureStorage.ipcHandlers.ts` (correct pattern):
  ```ts
  ipcMain.handle('secure-storage:set', async (_event, { account, password }) => {
    await SecureStorageService.setCredential(account, password);
  });
  ipcMain.handle('secure-storage:get', async (_event, { account }) => {
    return SecureStorageService.getCredential(account);
  });
  ```
- More examples:
  - `ipcMain.handle('ai:provider:list', async () => ProviderManager.listProviders())`
  - `ipcMain.handle('chat:conversation:list', async (_e, projectId) => ChatService.getSessions(projectId))`

### 4. IPC Handler Index (`src/main/ipcHandlers/index.ts`)

- Exports all handler registration functions
- Centralized location for all IPC handler imports

### 5. IPC Setup (`src/main/ipcSetup.ts`)

- Imports and calls all handler registration functions
- Called from main.ts to set up all IPC channels
- Example: `registerUpdateHandlers()` sets up all update-related channels

### 6. Backend Service (`src/main/services/[feature].service.ts`)

- Contains the actual business logic and implementation
- No direct IPC handling - pure business logic
- Example: `UpdateService.checkForUpdates()` contains actual update checking logic

### 7. Main Process Integration (`src/main/main.ts`)

- Calls `registerHandlers(mainWindow)` to set up all IPC communication

### Channel Naming Convention

- Use format: `[feature]:[action]`
- Examples: `updates:check`, `ai:provider:list`, `projects:create`

### Type Safety

- Use proper TypeScript interfaces for request/response types
- Use client generics: `client.post<RequestType, ResponseType>(channel, data)`
- Define interfaces in `src/types/backend.ts` or `src/types/frontend.ts`

**⚠️ NEVER:**

- Skip any step in this flow
- Create direct IPC calls without proper service layers
- Mix business logic in IPC handlers
- Create channels without following naming convention
- Add try-catch blocks in IPC handlers (error handling is done in services)
- Include console.log or console.error in IPC handlers (logging is done in services)
- Implement business logic in IPC handlers (business logic belongs in services)

**✅ ALWAYS:**

## Security & Credentials Checklist

- Store sensitive credentials only with keytar via main services.
- Do not pass secrets to renderer; use short-lived tokens or signed URLs.
- Validate and sanitize all IPC inputs in services; never trust renderer inputs.
- Redact secrets in logs; keep `console.error(error)` in catch blocks.

## Testing & QA Checklist

- Unit test services where feasible (mock providers, IPC, filesystem).
- Provide smoke tests for critical flows (connections, chat send/receive, file preview).
- Validate React Query cache invalidation on mutations. Avoid stale UI.
- Run type checks (no TS errors) and lint before PR.

- Follow this exact 7-step pattern for every new feature
- Use proper TypeScript typing throughout the flow
- Register new handlers in ipcSetup.ts
- Test the complete flow from frontend to backend
- Keep IPC handlers lean - just parameter routing and service calls
- Let service layer handle all error handling and logging
- Implement business logic only in service layers
- Include `console.error(error)` in all try-catch blocks with `// eslint-disable-next-line no-console` comment
- Preserve error logging when fixing ESLint violations - ask for confirmation before removing catch error logs

## Current Focus Areas

- **Advanced AI Integration**: Multi-provider AI system with streaming, context management, and structured responses
- **Cloud Storage & Data Preview**: DuckDB-powered preview for Parquet, CSV, JSON, Excel, and other formats
- **Multi-Database Support**: Full schema extraction for PostgreSQL, Snowflake, BigQuery, Redshift, Databricks, DuckDB
- **Conversational AI**: Context-aware chat with file/folder context, token management, and conversation history
- **dbt Project Management**: Complete project lifecycle with template support and connection auto-detection
- **Security & Credential Management**: Secure storage with keytar and multi-tenant credential isolation
- **Performance & UX**: React Query optimization, loading states, and error handling
- **Version Control Integration**: Git operations with branch management and file status tracking

## Development Patterns

### Error Handling

- Provide user-friendly error messages with actionable guidance
- Implement graceful fallbacks for service failures
- Log errors for debugging while protecting sensitive data
- Use provider-specific error handling for cloud services
- **Always console.error in try-catch blocks**: Include `console.error(error)` in all catch blocks with `// eslint-disable-next-line no-console` comment
- **Protect error logs**: When fixing ESLint console violations, always preserve error logging in catch blocks - ask for confirmation before removing

### State Management Patterns

- **Local State**: useState for component-specific data
- **Global State**: React Context for app-wide state (AppProvider, ProcessProvider)
- **Server State**: React Query for API data with proper caching
- **Form State**: React Hook Form for complex forms with validation
- **Persistence**: localStorage for user preferences, secure storage for credentials

### Component Development

- **Material-UI Integration**: Use sx prop for styling, consistent theme usage, and styled components
- **Form Handling**: React Hook Form with Zod validation
- **Loading States**: Proper loading indicators and skeleton states
- **Error Boundaries**: Graceful error handling and user feedback
- **Accessibility**: ARIA labels, keyboard navigation, screen reader support

## Related Documentation

- **[AI Integration Architecture](01-architecture/ai-integration-architecture.md)** - Multi-provider AI system and chat architecture
- **[React Query Architecture](01-architecture/react-query-architecture.md)** - State management patterns
- **[Database Integration](01-architecture/database-integration.md)** - Database connections and schema extractors
- **[Security & Credential Management](01-architecture/security-credential-management.md)** - Security patterns and credential storage
- **[AI Chat Feature](02-features/ai-chat-feature.md)** - Multi-provider AI system and conversational interface
- **[Connections Feature](02-features/connections-feature.md)** - Database connection management
- **[Cloud Explorer Feature](02-features/cloud-explorer-feature.md)** - Cloud storage operations
- **[Development Workflow](02-features/development-workflow.md)** - Development best practices
- **[CLI Integration](03-patterns/cli-integration.md)** - CLI tool integration patterns
