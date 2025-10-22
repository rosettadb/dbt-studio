# CLI Integration Patterns

## Overview
DBT Studio provides comprehensive CLI integration for dbt, Rosetta, and other tools with automated installation, real-time execution, and secure credential management.

## CLI Installation & Management Patterns

### Automated CLI Tool Installation Flow
DBT Studio provides automated installation of essential tools through UI-driven processes:

#### 1. Python Environment Setup
- Downloads standalone Python builds from GitHub releases
- Platform-specific binaries (macOS, Windows, Linux with x64/ARM64 support)
- Creates isolated virtual environment in Electron's userData directory
- Automatically configures `settings.pythonPath` and `settings.pythonVersion`
- Command Pattern: `cd "${userDataPath}" && "${binaryPath}" -m venv venv`

#### 2. Rosetta CLI Installation
- Downloads latest releases from `adaptivescale/rosetta` GitHub repository
- Platform/architecture detection: `darwin/mac`, `win32/win`, `linux` with `x64/aarch64`
- Extracts to user directories: `~/.rosetta` (Unix) or `C:/rosetta` (Windows)
- Sets executable permissions and updates `settings.rosettaPath`
- Version management with automatic cleanup of old installations

#### 3. dbt Core & Adapters
- UI-driven package selection (dbt-core, dbt-postgres, dbt-snowflake, etc.)
- Uses Python pip for installation: `"${pythonPath}" -m pip install ${package}`
- Real-time progress tracking and package verification
- Automatic dbt path discovery and configuration
- Uninstall capabilities with dependency management

## CLI Command Execution Patterns

### Real-time Command Execution
- **Environment Setup**: Secure credential injection via `setConnectionEnvVariable`
- **Command Construction**: Template-based command building with path resolution
- **Streaming Output**: Real-time CLI output via IPC events (`cli:output`, `cli:error`, `cli:done`)
- **Error Handling**: Timeout management, process cleanup, and user feedback

### dbt Commands
```typescript
// Command patterns:
`cd "${project.path}" && "${settings?.dbtPath}" run ${args}`
`cd "${project.path}" && "${settings?.dbtPath}" test ${args}`
`cd "${project.path}" && "${settings?.dbtPath}" docs generate`
```

### Rosetta Commands
```typescript
// Schema extraction:
`cd "${projectPath}" && "${settings?.rosettaPath}" extract -s ${connectionName}`
// dbt generation:
`cd "${projectPath}" && "${settings?.rosettaPath}" dbt ${incremental} -s ${connectionName}`
```

## UI-to-CLI Integration Architecture

### Settings UI Integration
- **Installation UI**: Version checking, update management
- **dbt Setup**: Package selection, installation progress, version validation
- **Rosetta Config**: Path configuration, version display
- **Real-time Feedback**: Progress bars, loading states, success/error notifications

### Project Execution Integration
- **Terminal Component**: Interactive CLI with real-time output streaming
- **Action Buttons**: UI buttons trigger complex CLI workflows (run, test, compile)
- **Background Processes**: Long-running commands with process management
- **Environment Variables**: Secure credential injection per project

## Security & Credential Management

### Project Isolation
- Credentials scoped by project name (`db-user-${projectName}`)
- Secure storage using keytar integration
- Runtime credential injection without file storage
- API key management via secure storage

### Environment Variable Injection
```typescript
// Secure credential injection for CLI operations
const setEnvVariables = useSetConnectionEnvVariable();
await setEnvVariables({
  key: 'DBT_DATABASE_USERNAME',
  value: await getDatabaseUsername(project.name),
});
```

## React Query Integration
For detailed React Query patterns and implementation, see:
- **[React Query Architecture](01-architecture/react-query-architecture.md)** - Complete state management patterns

## Service Client Pattern
Frontend services use a unified IPC client for backend communication:

```typescript
// src/renderer/config/client.ts - Unified IPC communication layer
import { ipcRenderer } from 'electron';

class Client {
  async get<T>(channel: string, data?: any): Promise<T> {
    return ipcRenderer.invoke(channel, data);
  }
  
  async post<ReqType, ResType>(channel: string, data: ReqType): Promise<ResType> {
    return ipcRenderer.invoke(channel, data);
  }
}
```

## IPC Communication Architecture

### Frontend Context Providers & State Management
- **AppProvider**: Global application state including projects, selected project, sidebar management, schema data, and AI provider status
- **ProcessProvider**: Manages long-running processes with real-time output/error streams via IPC
- **QueryClientProvider**: React Query configuration for server state management

### IPC Handler Categories (Main Process)
1. **CLI Handlers**: Terminal command execution with real-time output streaming
2. **Project Handlers**: Project CRUD operations, file management, schema extraction
3. **Settings Handlers**: Application configuration, file dialogs, CLI tool management
4. **Connector Handlers**: Database connection testing, configuration, query execution
5. **Git Handlers**: Version control operations (init, clone, commit, push, pull)
6. **Process Handlers**: Long-running process management with PID tracking
7. **Secure Storage Handlers**: Keytar-based credential management
8. **Update Handlers**: Application auto-updates and version management
9. **Cloud Explorer Handlers**: Cloud storage operations and data preview
10. **Utils Handlers**: External URL opening and utility functions

For detailed service architecture patterns, see:
- **[Project Overview](00-overview.md)** - Service layer architecture

### Real-time Communication Patterns
- **CLI Output Streaming**: Uses `cli:output`, `cli:error`, `cli:done` events for real-time command feedback
- **Process Management**: Uses `process:output`, `process:error` events for long-running process monitoring
- **Secure Storage Integration**: Project-specific credential storage with pattern `db-user-${projectName}`, `db-password-${projectName}`, `db-token-${projectName}`

## Error Handling Patterns

### Graceful Fallback for Keyring Issues
```typescript
// Graceful fallback for keyring issues
const getCredentialWithFallback = async (account: string): Promise<string | null> => {
  try {
    return await secureStorageService.get(account);
  } catch (error) {
    console.warn('Keyring access failed, prompting user');
    return null; // Trigger user credential input
  }
};
```

### Secure Error Messages
```typescript
// Secure error messages - no credential leakage
const handleAuthError = (error: any): string => {
  if (error.code === 'AUTH_FAILED') {
    return 'Authentication failed. Please check your credentials.';
  }
  
  if (error.code === 'NETWORK_ERROR') {
    return 'Network error. Please check your connection.';
  }
  
  // Generic message for unknown errors
  return 'An error occurred. Please try again.';
};
```

## Testing Patterns

### Mock Secure Storage
```typescript
// Test environment
const mockSecureStorage = {
  set: jest.fn(),
  get: jest.fn(),
  delete: jest.fn(),
};

// Component testing with mocked credentials
const renderWithMockCredentials = (component: React.ReactElement) => {
  return render(
    <SecureStorageProvider value={mockSecureStorage}>
      {component}
    </SecureStorageProvider>
  );
};
```

### Security Test Patterns
1. **Credential Isolation**: Verify project-specific storage
2. **Memory Leaks**: Ensure credentials don't persist in memory
3. **Error Handling**: Test secure error messages
4. **Input Validation**: Verify all inputs are sanitized

## Related Documentation
- [Project Overview](00-overview.md) - Complete project architecture
- [React Query Architecture](01-architecture/react-query-architecture.md) - State management patterns
- [Security & Credential Management](01-architecture/security-credential-management.md) - Security patterns
- [Development Workflow](02-features/development-workflow.md) - Development best practices 