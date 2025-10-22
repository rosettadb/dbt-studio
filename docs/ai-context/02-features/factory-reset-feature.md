# Factory Reset Feature

## Overview

The Factory Reset feature provides users with the ability to completely reset the application to its initial state, removing all user data, projects, connections, and settings. This feature is essential for troubleshooting, data privacy, and providing users with a clean slate.

## Key Components

### 1. User Interface

**Location**: `src/renderer/components/settings/AboutSettings.tsx`

- **Reset Button**: Located in the About settings section under "Advanced Options"
- **Confirmation Modal**: `src/renderer/components/modals/resetFactoryModal/index.tsx`
- **User Flow**: Settings → About → "Reset Factory Settings" button

### 2. Backend Implementation

**Main Service**: `src/main/services/settings.service.ts`

```typescript
static async resetFactorySettings(): Promise<void> {
  try {
    // 1. Load current database to get project paths
    const dataBase = await loadDatabaseFile();
    
    // 2. Delete all project directories
    for (const project of dataBase.projects) {
      if (project.path && fs.existsSync(project.path)) {
        try {
          deleteDirectory(project.path);
        } catch (error) {
          console.error(`Failed to delete project directory ${project.path}:`, error);
        }
      }
    }
    
    // 3. Clear all secure storage credentials
    await this.clearAllSecureCredentials();
    
    // 4. Delete database.json
    if (fs.existsSync(DB_FILE)) {
      await fs.remove(DB_FILE);
    }
    
    // 5. Reinitialize with default settings
    initializeDataStorage();
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    throw new Error(`Failed to reset factory settings: ${errorMessage}`);
  }
}
```

### 3. Secure Storage Cleanup

**Service**: `src/main/services/secureStorage.service.ts`

```typescript
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

### 4. IPC Communication

**Handler**: `src/main/ipcHandlers/settings.ipcHandlers.ts`

```typescript
ipcMain.handle('settings:reset-factory', async () => {
  return SettingsService.resetFactorySettings();
});

ipcMain.handle('settings:restart', async () => {
  app.relaunch();
  app.exit(0);
});
```

**Types**: `src/types/ipc.ts`

```typescript
export type SettingsChannels =
  | 'settings:load'
  | 'settings:save'
  | 'settings:dialog'
  | 'settings:checkCliUpdates'
  | 'settings:updateCli'
  | 'settings:getDbtPath'
  | 'settings:usePathJoin'
  | 'settings:reset-factory'
  | 'settings:restart';
```

### 5. Frontend Controller

**Controller**: `src/renderer/controllers/settings.controller.ts`

```typescript
export const useResetFactorySettings = (
  customOptions?: UseMutationOptions<void, CustomError, void>,
): UseMutationResult<void, CustomError, void> => {
  const { onSuccess: onCustomSuccess, onError: onCustomError } =
    customOptions || {};
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      return settingsServices.resetFactorySettings();
    },
    onSuccess: async (...args) => {
      // Invalidate all queries since we're resetting everything
      await queryClient.invalidateQueries();
      onCustomSuccess?.(...args);
    },
    onError: (...args) => {
      onCustomError?.(...args);
    },
  });
};
```

## Data Cleanup Process

### 1. Project Files
- **Action**: Delete all project directories from file system
- **Location**: User's projects directory
- **Error Handling**: Individual project deletion failures don't stop the process

### 2. Database State
- **Action**: Delete entire `database.json` file
- **Location**: Electron's userData directory
- **Reinitialization**: Fresh database with default settings

### 3. Secure Credentials
- **Action**: Clear all credentials from keytar
- **Types**: Database passwords, API keys, cloud credentials
- **Safety**: Only affects application-specific credentials

### 4. Application Restart
- **Action**: Automatic app restart after 2-second delay
- **Method**: `app.relaunch()` and `app.exit(0)`
- **User Feedback**: Success message before restart

## User Experience Flow

### 1. Initiation
- User navigates to Settings → About
- Clicks "Reset Factory Settings" button
- Confirmation modal appears with detailed warnings

### 2. Confirmation Modal
- **Warning**: Clear indication that all data will be permanently deleted
- **Details**: List of what will be deleted (projects, connections, settings, credentials)
- **Recommendation**: Suggests backing up projects to GitHub or file system
- **Actions**: Cancel or "Reset All Data" buttons

### 3. Reset Process
- **Loading State**: Modal shows "Resetting..." during operation
- **Backend Process**: Sequential cleanup of files, database, and credentials
- **Error Handling**: Graceful handling of partial failures

### 4. Completion
- **Success Message**: "Factory settings reset successfully. The app will restart automatically."
- **Automatic Restart**: 2-second delay then app restart
- **Fresh State**: App starts with factory default settings

## Security Considerations

### 1. Credential Cleanup
- **Scope**: Only application-specific credentials are cleared
- **Safety**: No interference with other applications' credentials in OS keychain
- **Completeness**: All stored credentials are removed

### 2. Data Privacy
- **File Deletion**: Complete removal of project files
- **Database Reset**: Fresh database with no user data
- **No Recovery**: Reset is permanent and irreversible

### 3. Error Handling
- **Partial Failures**: Individual cleanup failures don't stop the process
- **Logging**: Comprehensive error logging for debugging
- **User Feedback**: Clear error messages for users

## Integration with Other Features

### 1. Connection Management
- **Credential Cleanup**: Integrated with connection deletion cleanup
- **Consistency**: Both individual deletions and factory reset clean up credentials
- **Pattern**: Reusable credential cleanup utilities

### 2. Settings Management
- **Default Settings**: Factory reset reinitializes with default settings
- **Setup Flow**: Reset users are guided through setup process again
- **Configuration**: All CLI paths and environment settings are reset

### 3. Project Management
- **File Cleanup**: Complete removal of all project directories
- **Database Cleanup**: Removal of all project records
- **Fresh Start**: Users can re-import projects after reset

## Error Handling Patterns

### 1. File System Errors
```typescript
try {
  deleteDirectory(project.path);
} catch (error) {
  console.error(`Failed to delete project directory ${project.path}:`, error);
}
```

### 2. Credential Cleanup Errors
```typescript
try {
  await SecureStorageService.deleteCredential(account);
} catch (error) {
  console.error(`Failed to delete credential ${account}:`, error);
}
```

### 3. Database Errors
```typescript
try {
  await fs.remove(DB_FILE);
} catch (error) {
  throw new Error(`Failed to reset factory settings: ${error.message}`);
}
```

## Testing Considerations

### 1. Unit Tests
- **Service Methods**: Test `resetFactorySettings()` and `clearAllSecureCredentials()`
- **Error Scenarios**: Test partial failures and error handling
- **Mock Dependencies**: Mock file system and keytar operations

### 2. Integration Tests
- **End-to-End Flow**: Test complete reset process
- **UI Interactions**: Test modal interactions and user flow
- **Restart Process**: Test automatic restart functionality

### 3. Manual Testing
- **Data Verification**: Ensure all data is properly cleaned up
- **Credential Verification**: Verify keytar credentials are removed
- **Restart Verification**: Confirm app restarts with fresh state

## Future Enhancements

### 1. Backup Integration
- **Automatic Backup**: Create backup before reset
- **Recovery Options**: Allow users to restore from backup
- **Export Data**: Export user data before reset

### 2. Selective Reset
- **Partial Reset**: Reset only specific components (projects, connections, settings)
- **Custom Options**: Allow users to choose what to reset
- **Preserve Data**: Option to preserve certain data

### 3. Enhanced User Experience
- **Progress Indicators**: Show detailed progress during reset
- **Confirmation Steps**: Multiple confirmation steps for safety
- **Recovery Information**: Provide information about data recovery options 