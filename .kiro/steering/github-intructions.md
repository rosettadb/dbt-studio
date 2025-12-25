# GitHub Copilot Instructions for DBT Studio

You are a LLm , and you can only update .md ai conetext files i have created. 
You do not create ai context docs: plans. context, task, implemetations...

## TL;DR

- Always follow the 7-step Electron command flow (renderer service → controller → IPC handler → handler index → IPC setup → backend service → main integration).
- Keep IPC handlers thin (no logic, no try/catch). All business logic and error handling live in services.
- Use channels like `[feature]:[action]` and strong TypeScript types for request/response.
- Log errors only in services with `console.error(error)` and an ESLint-disable comment.
- Prefer small, focused PRs with clear commit messages and update docs when adding channels.

## Quick Reference

This is a DBT Studio Electron application that provides a comprehensive interface for managing dbt projects, database connections, cloud data exploration, and data analytics workflows with advanced AI integration.

## Architecture Overview

- **Frontend**: React + TypeScript with Material-UI
- **Backend**: Electron main process with Node.js
- **Database**: SQLite for application data, DuckDB (persistent `main.duckdb` + temporary fallbacks) for data processing
- **Cloud Storage**: AWS S3, Azure Blob Storage, Google Cloud Storage support
- **State Management**: React Query (v3) for server state management
- **Security**: Keytar-based secure credential storage
- **Git Integration**: Simple-git for version control operations
- **AI Integration**: Multi-provider AI system with OpenAI, Anthropic, Gemini, and Ollama support

## Core Services

1. **Database Connection Management** - Multi-database support with schema extraction (PostgreSQL, Snowflake, BigQuery, Redshift, Databricks, DuckDB)
2. **Cloud Explorer Service** - Cloud storage operations and data preview with DuckDB integration
3. **Project Management Service** - dbt project lifecycle management with template support
4. **Settings & Configuration Service** - CLI tool management, updates, and Python environment
5. **Git Version Control Service** - Repository operations, branch management, versioning, and local changes tracking
6. **Security & Storage Services** - Credential encryption and management with keytar
7. **AI Provider Management** - Multi-provider AI system with OpenAI, Anthropic, Gemini, and Ollama
8. **Chat Service** - Advanced conversational AI with context management and streaming
9. **Analytics & Usage Tracking** - AI usage analytics and application telemetry
10. **Update & Maintenance Services** - Auto-updates and version management
11. **Cloud Preview Service** - DuckDB-powered data preview for cloud storage files backed by the persistent `main.duckdb`

## Persistent DuckDB Infrastructure (Plan 06a)

- **DuckDBBootstrap (main process)**: Singleton that owns the `main.duckdb` file, handles startup, safe-mode fallbacks, graceful shutdown, and connection pooling with strict acquire/release semantics.
- **Settings Service hooks**: IPC channels under `settings:duckdb:*` expose metadata (`getDuckDbMetadata`), diagnostics, and reinitialization tools to the renderer so the UI can display path, size, status, and pool health.
- **DuckDB Workspace Card (renderer)**: Uses React Query hooks (`useGetDuckDbMetadata`, `useDiagnoseDuckDb`) to surface lock status, active connections, and management actions (refresh, diagnose, reinitialize) inside the Settings UI.
- **Cloud Explorer integration**: `CloudPreviewService` must first try to acquire a pooled connection from `DuckDBBootstrap` for previews; if the persistent DB is locked or timeouts, it spins up an ephemeral in-memory DuckDB instance to keep the UI responsive. `finally` blocks must always release persistent connections.
- **Extension hygiene**: Before issuing `INSTALL/LOAD` commands, check `installed_extensions` so the shared pool stays clean. Ensure core extensions (`httpfs`, `aws`, `azure`, `json`, `excel`) are available.
- **Secret management**: Use scoped `CREATE OR REPLACE SECRET` operations and session cleanup (drop/reset secrets) so provider credentials do not leak between previews in the persistent database.
- **Diagnostics & telemetry**: Track Cloud Explorer consumption inside DuckDB diagnostics (connection counts, fallback occurrences, average preview duration) to monitor contention and performance.
12. **Main Database Service** - SQLite-based application database with Drizzle ORM
13. **Cloud Integration Service** - Enhanced project deployment with environment variables and git integration

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

- Follow this exact 7-step pattern for every new feature
- Use proper TypeScript typing throughout the flow
- Register new handlers in ipcSetup.ts
- Test the complete flow from frontend to backend
- Keep IPC handlers lean - just parameter routing and service calls
- Let service layer handle all error handling and logging
- Implement business logic only in service layers
- Include `console.error(error)` in all try-catch blocks with `// eslint-disable-next-line no-console` comment
- Preserve error logging when fixing ESLint violations - ask for confirmation before removing catch error logs

## IPC Channel Reference (Patterns)

- `projects:create` — Create a project. Request: `{ name, path }`. Response: `{ id, name, path }`.
- `connectors:test` — Test DB connection. Request: `{ provider, config }`. Response: `{ ok, details }`.
- `ai:provider:list` — List AI providers. Request: `void`. Response: `Provider[]`.
- `chat:conversation:list` — List conversations for a project. Request: `projectId?`. Response: `Conversation[]`.
- `git:getLocalChanges` — Get local git changes. Request: `{ repoPath: string }`. Response: `GitChangesRes | null`.
- `rosettaCloud:push` — Deploy project to cloud. Request: `CloudDeploymentPayload`. Response: `void`.

Use these as patterns; define exact types in `src/types/backend.ts` or `src/types/frontend.ts`.

## End-to-End Example: Add "providers:refresh" Channel

Goal: Force-refresh AI providers from main DB and return the list.

1) Renderer service (`src/renderer/services/ai.service.ts`)
```ts
export const refreshProviders = () =>
  window.electron.ipcRenderer.invoke('providers:refresh');
```

2) Controller (`src/renderer/controllers/ai.controller.ts`)
```ts
import { useQueryClient, useMutation } from 'react-query';
import * as aiService from '../services/ai.service';

export const useRefreshProviders = () => {
  const qc = useQueryClient();
  return useMutation(aiService.refreshProviders, {
    onSuccess: () => qc.invalidateQueries(['ai', 'provider', 'list'])
  });
};
```

3) IPC handler (`src/main/ipcHandlers/ai.ipcHandlers.ts`)
```ts
import { ipcMain } from 'electron';
import { ProviderManager } from '../services/ai/providerManager.service';

export const registerAIHandlers = () => {
  ipcMain.handle('providers:refresh', async () => ProviderManager.refreshAndList());
};
```

4) Handler index (`src/main/ipcHandlers/index.ts`)
```ts
export { registerAIHandlers } from './ai.ipcHandlers';
```

5) IPC setup (`src/main/ipcSetup.ts`)
```ts
import { registerAIHandlers } from './ipcHandlers';
export const registerHandlers = () => {
  registerAIHandlers();
};
```

6) Service (`src/main/services/ai/providerManager.service.ts`)
```ts
export class ProviderManager {
  static async refreshAndList() {
    try {
      await this.syncFromDatabase();
      return this.listProviders();
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error(error);
      throw error;
    }
  }
}
```

7) Main integration (`src/main/main.ts`)
```ts
import { registerHandlers } from './ipcSetup';
app.whenReady().then(() => {
  // ...create window
  registerHandlers();
});
```

Checklist
- Channel named `providers:refresh` (feature:action)
- Handler is thin (no logic beyond delegation)
- Service handles errors with console.error + ESLint comment
- Controller invalidates React Query cache on success

## Detailed Documentation

For comprehensive implementation details, patterns, and architecture, see:

- **[AI Context Documentation](../docs/ai-context/README.md)** - Complete project documentation
- **[Project Overview](../docs/ai-context/00-overview.md)** - Detailed architecture and services
- **[Development Workflow](../docs/ai-context/02-features/development-workflow.md)** - Development best practices

## Development Guidelines

### Code Style

- Use TypeScript with strict typing
- Follow React functional component patterns with hooks
- Use Material-UI components for consistent UI
- Implement proper error handling and user feedback
- Use React Query for server state management
- Follow service-oriented architecture patterns

### Service Layer Architecture

- **Main Process Services**: Located in `src/main/services/`
- **Renderer Services**: Located in `src/renderer/services/`
- **Controllers**: Located in `src/renderer/controllers/` (React Query hooks)
- **IPC Handlers**: Located in `src/main/ipcHandlers/` (Electron IPC communication)

### React Query Implementation

For detailed React Query patterns and implementation, see:

- **[React Query Architecture](../docs/ai-context/01-architecture/react-query-architecture.md)** - Complete state management patterns

### Frontend Context Providers & State Management

For detailed architecture patterns, see:

- **[Project Overview](../docs/ai-context/00-overview.md)** - Complete service architecture and patterns
- **[React Query Architecture](../docs/ai-context/01-architecture/react-query-architecture.md)** - State management patterns

### Database Integration Patterns

For detailed database integration patterns, see:

- **[Database Integration](../docs/ai-context/01-architecture/database-integration.md)** - Multi-database support and schema extractors

### Cloud Storage Integration

For detailed cloud storage integration patterns, see:

- **[Cloud Explorer Feature](../docs/ai-context/02-features/cloud-explorer-feature.md)** - Cloud storage operations and data preview

### File Structure

For detailed file structure and organization, see:

- **[Project Overview](../docs/ai-context/00-overview.md)** - Complete file structure and service organization

## Coding Patterns

### Component Structure

- Use functional components with TypeScript interfaces
- Implement proper loading states and error handling
- Use Material-UI sx prop for styling
- Follow the established component hierarchy
- Implement proper form validation with react-hook-form

### State Management

- Use React Query for server state with proper cache invalidation
- Use React hooks for local component state
- Implement optimistic updates where appropriate
- Use React Context for global application state

### Error Handling

- Provide user-friendly error messages with actionable guidance
- Implement graceful fallbacks for service failures
- Log errors for debugging while protecting sensitive data
- Use provider-specific error handling for cloud services
- **Always console.error in try-catch blocks**: Include `console.error(error)` in all catch blocks with `// eslint-disable-next-line no-console` comment
- **Protect error logs**: When fixing ESLint console violations, always preserve error logging in catch blocks - ask for confirmation before removing

### Service Communication Patterns

- **IPC Channels**: Use typed channel definitions from `src/types/ipc.ts`
- **Frontend-Backend**: Communicate via Electron IPC with proper error handling
- **React Query**: Implement proper caching, invalidation, and mutation patterns
- **Security**: Never expose credentials in frontend, use secure storage service

### Database Connection Patterns

- Use connection abstraction layer for multi-database support
- Implement connection pooling and validation
- Use schema extractors for database-specific metadata retrieval
- Handle connection timeouts and retry logic gracefully

### Data Storage & Settings Patterns

- **Local Storage**: Uses `database.json` file in Electron's userData directory for application state
- **Database Schema**: Contains projects array, settings object, selectedProject, and saved queries
- **Settings Management**: SettingsType object stores CLI paths, Python environment, project directories, and setup status
- **Secure Storage**: Sensitive credentials stored separately using keytar, not in database.json
- **File Operations**: Managed through fileHelper utilities with proper error handling
- **Factory Reset**: Complete data cleanup with automatic app restart and credential cleanup

### Cloud Integration Patterns

- Implement provider-agnostic interfaces for cloud operations
- Use signed URLs for secure file access
- Implement proper authentication flow for each provider
- Use DuckDB extensions for data preview capabilities

### CLI Installation & Management Patterns

For detailed CLI integration patterns, see:

- **[CLI Integration](../docs/ai-context/03-patterns/cli-integration.md)** - CLI tool installation, command execution, and UI integration

## Context Documents

Refer to these documents for detailed implementation context:

- **[AI Context Documentation](../docs/ai-context/README.md)** - Complete project documentation
- **[Project Overview](../docs/ai-context/00-overview.md)** - Detailed architecture and services
- **[AI Integration Architecture](../docs/ai-context/01-architecture/ai-integration-architecture.md)** - Multi-provider AI system and chat architecture
- **[React Query Architecture](../docs/ai-context/01-architecture/react-query-architecture.md)** - State management patterns
- **[Database Integration](../docs/ai-context/01-architecture/database-integration.md)** - Database connections and schema extractors
- **[Security & Credential Management](../docs/ai-context/01-architecture/security-credential-management.md)** - Security patterns and credential storage
- **[AI Chat Feature](../docs/ai-context/02-features/ai-chat-feature.md)** - Multi-provider AI system and conversational interface
- **[Connections Feature](../docs/ai-context/02-features/connections-feature.md)** - Database connection management
- **[Cloud Explorer Feature](../docs/ai-context/02-features/cloud-explorer-feature.md)** - Cloud storage operations
- **[Development Workflow](../docs/ai-context/02-features/development-workflow.md)** - Development best practices
- **[SQL Editor Feature](../docs/ai-context/02-features/sql-editor-feature.md)** - SQL editor with Monaco integration
- **[CLI Integration](../docs/ai-context/03-patterns/cli-integration.md)** - CLI tool integration patterns

## Current Focus Areas

- **Advanced AI Integration**: Multi-provider AI system with streaming, context management, and structured responses
- **Cloud Storage & Data Preview**: DuckDB-powered preview for Parquet, CSV, JSON, Excel, and other formats
- **Multi-Database Support**: Full schema extraction for PostgreSQL, Snowflake, BigQuery, Redshift, Databricks, DuckDB
- **Conversational AI**: Context-aware chat with file/folder context, token management, and conversation history
- **dbt Project Management**: Complete project lifecycle with template support and connection auto-detection
- **Security & Credential Management**: Secure storage with keytar and multi-tenant credential isolation
- **Performance & UX**: React Query optimization, loading states, and error handling
- **Version Control Integration**: Git operations with branch management and file status tracking

## Development Workflow & Patterns

### Component Development

- **Material-UI Integration**: Use sx prop for styling, consistent theme usage, and styled components
- **Form Handling**: React Hook Form with Zod validation
- **Loading States**: Proper loading indicators and skeleton states
- **Error Boundaries**: Graceful error handling and user feedback
- **Accessibility**: ARIA labels, keyboard navigation, screen reader support

### State Management Patterns

- **Local State**: useState for component-specific data
- **Global State**: React Context for app-wide state (AppProvider, ProcessProvider)
- **Server State**: React Query for API data with proper caching
- **Form State**: React Hook Form for complex forms with validation
- **Persistence**: localStorage for user preferences, secure storage for credentials

### CLI Integration Patterns

- **Real-time Output**: IPC event streaming for command feedback
- **Process Management**: Background process tracking with PID management
- **Environment Injection**: Secure credential passing via environment variables
- **Command Composition**: Template-based command building with proper escaping
- **Error Handling**: Command-specific error parsing and user-friendly messages

### SQL Editor Patterns

For detailed SQL editor implementation patterns, see:

- **[New SQL Editor](../docs/ai-context/03-patterns/new-sql-editor.md)** - Modern SQL editor with Monaco integration, query block detection, and advanced result visualization

**Key SQL Editor Features**:

- **Multi-tab Management**: Sequential naming, drag & drop reordering, visual indicators
- **Monaco Editor Integration**: SQL syntax highlighting, autocompletion, custom keybindings
- **Query Block Detection**: Automatic SQL block identification and execution
- **Enhanced Result Viewer**: Pagination, filtering, export functionality (CSV, JSON, Excel, SQL)
- **Advanced UX**: Query formatting, minification, validation, history management
- **Performance**: Debounced updates, virtual scrolling, memory management
- **Security**: Input validation, credential isolation, error sanitization

### File System Operations

- **Project Structure**: Standardized dbt project layout
- **File Watching**: Real-time file change detection
- **Git Integration**: File status tracking and diff visualization
- **Path Resolution**: Cross-platform path handling
- **File Operations**: Create, read, update, delete with proper error handling

### Testing Strategy

**Current State**: Basic testing infrastructure is configured but minimal tests exist

- **Test Framework**: Jest with React Testing Library configured
- **Current Tests**: Only one simple App component test exists (`src/__tests__/App.test.tsx`)
- **Test Configuration**: Jest is configured in `package.json` with proper module mapping and mocks
- **AI Testing**: Provider testing with mock responses and streaming simulation
- **Database Testing**: SQLite in-memory testing with Drizzle ORM
- **Future Testing Plans**:
  - **Unit Tests**: Jest for utility functions and services
  - **Component Tests**: React Testing Library for UI components
  - **Integration Tests**: End-to-end testing with Electron
  - **AI Provider Tests**: Mock AI responses and streaming tests
  - **Database Tests**: Drizzle ORM schema and migration tests
  - **Mock Patterns**: IPC mocking, service mocking, credential mocking, AI provider mocking
  - **Test Data**: Factories for generating test data and AI responses

### Performance Optimization

- **Code Splitting**: Dynamic imports for large components
- **Memoization**: useMemo, useCallback for expensive operations
- **Virtualization**: Virtual scrolling for large data sets
- **Debouncing**: Input debouncing for search and API calls
- **Caching**: React Query caching, localStorage caching
