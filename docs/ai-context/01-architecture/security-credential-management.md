# Security & Credential Management

## Overview
DBT Studio implements a comprehensive security model using keytar-based credential encryption, project-specific isolation, and secure IPC communication patterns. This document details the security architecture, credential storage, and authentication patterns.

## Core Security Architecture

### Keytar Integration
The application uses keytar for OS-level secure credential storage:

```typescript
// src/main/services/secureStorage.service.ts
class SecureStorageService {
  private serviceName: string;

  constructor(serviceName: string) {
    this.serviceName = serviceName;
  }

  async setCredential(account: string, password: string): Promise<void> {
    await keytar.setPassword(this.serviceName, account, password);
  }

  async getCredential(account: string): Promise<string | null> {
    return keytar.getPassword(this.serviceName, account);
  }

  async deleteCredential(account: string): Promise<void> {
    await keytar.deletePassword(this.serviceName, account);
  }

  async findCredentials(): Promise<string[]> {
    const credentials = await keytar.findCredentials(this.serviceName);
    return credentials.map((cred) => cred.account);
  }

  /**
   * Clean up all credentials associated with a specific connection
   */
  async cleanupConnectionCredentials(connectionName: string): Promise<void> {
    const credentialTypes = [
      `cloud-gcs-${connectionName}`,
      `cloud-aws-${connectionName}`,
      `cloud-azure-${connectionName}`,
    ];

    await Promise.all(
      credentialTypes.map(async (credentialType) => {
        try {
          await this.deleteCredential(credentialType);
        } catch (error) {
          console.error(
            `Failed to delete credential ${credentialType}:`,
            error,
          );
        }
      }),
    );
  }
}
```

### Operating System Integration
- **macOS**: Uses Keychain Access
- **Windows**: Uses Windows Credential Manager
- **Linux**: Uses libsecret/Secret Service API

## Project-Specific Credential Isolation

### Credential Namespacing
All credentials are scoped by project name to ensure multi-tenant security:

```typescript
export type SecureStorageAccount =
  | 'openai-api-key'
  | `db-user-${string}`
  | `db-password-${string}`
  | `db-token-${string}`;

// Usage patterns
const usernameKey = `db-user-${projectName}`;
const passwordKey = `db-password-${projectName}`;
const tokenKey = `db-token-${projectName}`;
```

### Project Isolation Benefits
1. **Security**: Credentials cannot leak between projects
2. **Multi-tenancy**: Support multiple environments
3. **Team Collaboration**: Safe sharing of project configurations
4. **Compliance**: Audit trail per project

## Secure Storage Service Implementation

### Frontend Hook Interface
```typescript
// src/renderer/hooks/useSecureStorage.ts
const useSecureStorage = () => {
  const setDatabaseUsername = async (userName: string, projectName: string): Promise<void> => {
    await secureStorageService.set(`db-user-${projectName}`, userName);
  };

  const getDatabaseUsername = async (projectName: string): Promise<string | null> => {
    return secureStorageService.get(`db-user-${projectName}`);
  };

  const deleteDatabaseUsername = async (projectName: string): Promise<void> => {
    await secureStorageService.delete(`db-user-${projectName}`);
  };

  // Similar patterns for password, token management
  return {
    setDatabaseUsername,
    getDatabaseUsername,
    deleteDatabaseUsername,
    setDatabasePassword,
    getDatabasePassword,
    deleteDatabasePassword,
    setDatabaseToken,
    getDatabaseToken,
    deleteDatabaseToken,
    setOpenAIKey,
    getOpenAIKey,
    deleteOpenAIKey,
  };
};
```

### IPC Security Layer
Secure communication between renderer and main processes:

```typescript
// src/main/ipcHandlers/secureStorage.ipcHandlers.ts
const registerSecureStorageHandlers = (ipcMain: Electron.IpcMain) => {
  ipcMain.handle('secureStorage:set', async (_, account: string, password: string) => {
    return SecureStorageService.set(account, password);
  });

  ipcMain.handle('secureStorage:get', async (_, account: string) => {
    return SecureStorageService.get(account);
  });

  ipcMain.handle('secureStorage:delete', async (_, account: string) => {
    return SecureStorageService.delete(account);
  });
};
```

## Environment Variable Security

### Runtime Credential Injection
Credentials are injected as environment variables only when needed:

```typescript
// src/renderer/controllers/connectors.controller.ts
export const useSetConnectionEnvVariable = () => {
  return useMutation({
    mutationFn: async ({ key, value }) => {
      return connectorsServices.setConnectionEnvVariable(key, value);
    },
  });
};

// Usage in CLI operations
const setEnvVariables = useSetConnectionEnvVariable();
await setEnvVariables({
  key: 'DBT_DATABASE_USERNAME',
  value: await getDatabaseUsername(project.name),
});
```

### No Persistent Environment Storage
- Environment variables are set only for the duration of CLI operations
- No credentials stored in configuration files
- Automatic cleanup after command execution

## Authentication Patterns

### Database Connections
```typescript
// Connection configuration without credentials
export type ConnectionInput =
  | PostgresConnection
  | SnowflakeConnection
  | BigQueryConnection
  | RedshiftConnection
  | DatabricksConnection
  | DuckDBConnection;

// Credentials retrieved at runtime
const configureConnection = async (connection: ConnectionInput, project: Project) => {
  const username = await getDatabaseUsername(project.name);
  const password = await getDatabasePassword(project.name);
  
  // Use credentials for connection without storing
  return establishConnection({ ...connection, username, password });
};
```

### API Key Management
```typescript
// OpenAI API key storage
const { setOpenAIKey, getOpenAIKey, deleteOpenAIKey } = useSecureStorage();

// Component usage
const handleSave = async () => {
  if (!apiKey) {
    toast.error('Please enter an API Key');
    return;
  }
  
  try {
    await setOpenAIKey(apiKey);
    setIsAiProviderSet(true);
    toast.success('API Key saved successfully');
  } catch (error) {
    toast.error('Failed to save API Key');
  }
};
```

## Cloud Storage Security

### Provider-Specific Authentication
Each cloud provider uses secure credential patterns:

```typescript
// AWS S3
interface S3Config {
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
}

// Azure Blob Storage
interface AzureConfig {
  accountName: string;
  accountKey: string;
  connectionString?: string;
}

// Google Cloud Storage
interface GCSConfig {
  projectId: string;
  credentials?: any; // Service account JSON
}
```

### Secure URL Generation
- Temporary signed URLs for file access
- No long-lived credentials in frontend
- Automatic expiration of access tokens

## Security Best Practices

### Data Flow Security
1. **Frontend**: Never stores credentials in state
2. **IPC**: Encrypted communication between processes  
3. **Backend**: Credentials retrieved just-in-time
4. **CLI**: Environment variables injected per command
5. **Storage**: OS-level encryption via keytar

### Input Validation
```typescript
// Validate credential inputs
const validateCredentials = (credentials: any): boolean => {
  if (!credentials.username || credentials.username.trim() === '') {
    throw new Error('Username is required');
  }
  
  if (!credentials.password || credentials.password.length < 1) {
    throw new Error('Password is required');
  }
  
  return true;
};
```

### Error Handling
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

## Credential Cleanup & Factory Reset

### Connection Deletion Cleanup
When connections are deleted, their associated credentials are automatically cleaned up:

```typescript
// Database connection deletion
static async deleteConnection(connectionId: string): Promise<void> {
  // ... validation logic ...
  
  // Clean up connection-specific credentials from secure storage
  try {
    await SecureStorageService.cleanupConnectionCredentials(
      connectionToDelete.connection.name,
    );
  } catch (error) {
    console.error(
      `Failed to cleanup credentials for connection ${connectionToDelete.connection.name}:`,
      error,
    );
  }
  
  // Remove the connection from the database
  const updatedConnections = connections.filter(
    (connection) => connection.id !== connectionId,
  );
  await updateDatabase<'connections'>('connections', updatedConnections);
}

// Cloud connection deletion
static async deleteCloudConnection(id: string): Promise<void> {
  const connectionToDelete = sources.find((c) => c.id === id);
  if (connectionToDelete) {
    // Clean up cloud connection-specific credentials from secure storage
    try {
      await SecureStorageService.cleanupConnectionCredentials(
        connectionToDelete.name,
      );
    } catch (error) {
      console.error(
        `Failed to cleanup credentials for cloud connection ${connectionToDelete.name}:`,
        error,
      );
    }
  }
  
  const filteredSources = sources.filter((c) => c.id !== id);
  await updateDatabase<'sources'>('sources', filteredSources);
}
```

### Factory Reset Cleanup
The factory reset feature provides complete credential cleanup:

```typescript
// Factory reset credential cleanup
private static async clearAllSecureCredentials(): Promise<void> {
  try {
    // Get all stored credentials from keytar
    const accounts = await SecureStorageService.findCredentials();
    
    // Delete all found credentials
    await Promise.all(
      accounts.map(async (account) => {
        try {
          await SecureStorageService.deleteCredential(account);
        } catch (error) {
          console.error(`Failed to delete credential ${account}:`, error);
        }
      }),
    );
  } catch (error) {
    console.error('Failed to clear secure credentials:', error);
  }
}
```

### Cleanup Patterns
1. **Connection-Specific**: Only credentials for the deleted connection are removed
2. **Factory Reset**: All application credentials are cleared
3. **Error Handling**: Partial failures don't stop the cleanup process
4. **Safety**: Only application-specific credentials are affected

## Audit & Compliance

### Credential Lifecycle
1. **Creation**: User inputs credentials via secure form
2. **Storage**: Encrypted storage via OS keyring
3. **Retrieval**: Just-in-time access for operations
4. **Usage**: Environment variable injection
5. **Cleanup**: Automatic cleanup after operations
6. **Deletion**: Secure deletion on connection removal
7. **Factory Reset**: Complete credential cleanup on application reset

### Security Events
- Connection attempts (success/failure)
- Credential modifications
- Project access patterns
- CLI command executions

## Testing Security

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

## Future Security Enhancements

### Planned Features
1. **Multi-Factor Authentication**: Additional security layers
2. **Certificate Management**: SSL/TLS certificate handling
3. **Role-Based Access**: Team permission management
4. **Audit Logging**: Comprehensive security event logging
5. **Credential Rotation**: Automatic credential updates

### Advanced Security
1. **Hardware Security Modules**: Enterprise HSM integration
2. **OAuth2 Integration**: Modern authentication flows
3. **SAML/SSO**: Enterprise identity integration
4. **Zero-Trust Architecture**: Enhanced security model

## Troubleshooting

### Common Issues
1. **Keyring Access**: OS permission issues
2. **Credential Corruption**: Invalid stored credentials
3. **Memory Errors**: Credential cleanup failures
4. **Network Security**: Firewall/proxy issues

### Resolution Patterns
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

This security architecture ensures that sensitive credentials are protected at every layer while maintaining usability and performance for legitimate operations.
