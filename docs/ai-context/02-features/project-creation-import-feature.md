# Project Creation and Import Feature

## Overview

The DBT Studio application provides comprehensive project management capabilities for creating and importing dbt projects from various sources. This feature supports multiple import methods, template management, and connection configuration to streamline the dbt project lifecycle.

## Core Features

### 1. New Project Creation

**Location**: `src/renderer/components/newProject/index.tsx`

**Flow**:
1. **User Interface**: Users click "New" button in project selection screen
2. **Form Display**: Shows `NewProject` component with configuration options
3. **Project Configuration**:
   - Project name input with validation
   - Project path selection (with file picker)
   - Database connection selection
   - Template file setup

**Key Components**:
- **Project Name Validation**: Ensures unique, valid project names
- **Path Selection**: Native file dialog for project directory
- **Connection Integration**: Links project to existing database connections
- **Template Setup**: Automatically copies dbt and Rosetta templates

**Validation Rules**:
```typescript
// Project name validation
- Must be at least 3 characters
- Must start with a letter
- Only letters, numbers, and underscores allowed
- Must be unique among existing projects
```

### 2. Git Repository Import

**Location**: `src/main/services/git.service.ts`, `src/renderer/components/modals/cloneRepoModal/index.tsx`

**Flow**:
1. **Repository URL Input**: Users provide Git repository URL
2. **Authentication Handling**: Supports credentials for private repos
3. **Cloning Process**: Uses `simple-git` library for repository cloning
4. **Connection Auto-Detection**: Parses existing connection files
5. **Project Registration**: Creates project entry with extracted metadata

**Key Features**:
- **Authentication Support**: Username/password and token authentication
- **Error Handling**: Distinguishes auth errors from other failures
- **Connection Parsing**: Automatically detects `profiles.yml` and `rosetta/main.conf`
- **Template Integration**: Handles template projects with reserved names

**Authentication Error Detection**:
```typescript
// Detects various authentication failure patterns
- "authentication failed"
- "fatal: authentication"
- "403 forbidden"
- "401 unauthorized"
- "permission denied"
```

### 3. Folder Import

**Location**: `src/main/services/projects.service.ts` - `importProjectFromFolder()`

**Flow**:
1. **Directory Selection**: Native file dialog for folder selection
2. **Project Validation**: Checks for `dbt_project.yml` presence
3. **Name Extraction**: Reads project name from configuration
4. **Duplicate Prevention**: Ensures project hasn't been imported
5. **Configuration Setup**: Adds Rosetta configuration if missing

**Key Features**:
- **Non-Destructive**: Doesn't modify original project files
- **Validation**: Ensures valid dbt project structure
- **Rosetta Integration**: Automatically adds Rosetta configuration
- **Cross-Platform**: Uses Electron's native file dialogs

### 4. Getting Started Template

**Location**: `src/renderer/components/GetStartedModal/index.tsx`

**Flow**:
1. **Template Repository**: Clones from `https://github.com/rosettadb/dbtstudio_getting_started.git`
2. **Auto-Configuration**: Sets up DuckDB with sample data
3. **Example Models**: Includes ready-to-run transformations
4. **Best Practices**: Demonstrates recommended patterns

**Template Contents**:
- DuckDB database with sample data
- Sample dbt models and transformations
- Example analytics and visualizations
- Best practice code examples

## Technical Implementation

### Backend Services

#### ProjectsService (`src/main/services/projects.service.ts`)

**Core Methods**:
```typescript
// New project creation
static async addProject(projectPath: string, connectionId?: string)

// Git repository import
static async addProjectFromVCS({ path, name, connectionId })

// Folder import
static async importProjectFromFolder(): Promise<Project>

// Template file management
static async copyDbtTemplateFiles(projectPath: string, projectName: string)
static async copyRosettaMainConf(projectPath: string)
```

**Template File Management**:
```typescript
// Copies dbt sample files and updates project name
static async copyDbtTemplateFiles(projectPath: string, projectName: string) {
  const templatePath = (await SettingsService.loadSettings()).dbtSampleDirectory;
  fs.cpSync(templatePath, targetPath, { recursive: true });
  
  // Update dbt_project.yml with correct project name
  const updatedContent = dbtProjectContent.replace(/my_dbt_project/g, projectName);
  fs.writeFileSync(dbtProjectYmlPath, updatedContent, 'utf8');
}
```

#### GitService (`src/main/services/git.service.ts`)

**Repository Cloning**:
```typescript
async cloneRepo(remoteUrl: string, credentials?: GitCredentials) {
  const repoName = getRepoNameFromUrl(remoteUrl);
  const destinationPath = path.join(basePath, repoName);
  
  // Handle authentication
  let urlToUse = remoteUrl;
  if (credentials) {
    urlToUse = injectCredentialsIntoRemoteUrl(remoteUrl, credentials);
  }
  
  await git.clone(urlToUse, destinationPath);
  
  // Parse connection files
  const connections = await ConnectorsService.parseProjectConnectionFiles(destinationPath);
  
  return {
    path: destinationPath,
    name: repoName,
    connectionId: await ConnectorsService.configureConnection({
      connection: connections.connectionInput,
    })
  };
}
```

#### ConnectorsService (`src/main/services/connectors.service.ts`)

**Connection File Parsing**:
```typescript
static async parseProjectConnectionFiles(projectPath: string): Promise<{
  dbtConnection?: DBTConnection;
  rosettaConnection?: RosettaConnection;
  connectionInput?: ConnectionInput;
}> {
  // Parse profiles.yml for DBT connection
  const profilesPath = path.join(projectPath, 'profiles.yml');
  if (fs.existsSync(profilesPath)) {
    const dbtConnection = await this.parseProfilesYml(profilesPath);
    if (dbtConnection) {
      result.dbtConnection = dbtConnection;
      result.connectionInput = this.mapDBTConnectionToConnectionInput(dbtConnection);
    }
  }
  
  // Parse rosetta/main.conf for Rosetta connection
  const mainConfPath = path.join(projectPath, 'rosetta', 'main.conf');
  if (fs.existsSync(mainConfPath)) {
    const rosettaConnection = await this.parseMainConf(mainConfPath);
    if (rosettaConnection) {
      result.rosettaConnection = rosettaConnection;
    }
  }
  
  return result;
}
```

### Frontend Components

#### NewProject Component (`src/renderer/components/newProject/index.tsx`)

**Form Structure**:
- Project path selection with file picker
- Project name input with validation
- Connection selection dropdown
- Save/Cancel actions

**Key Features**:
- Real-time validation feedback
- Connection icon display
- File picker integration
- Form state management

#### CloneRepoModal Component (`src/renderer/components/modals/cloneRepoModal/index.tsx`)

**Modal Features**:
- Repository URL input
- Loading states during cloning
- Error handling and user feedback
- Success navigation

#### GetStartedModal Component (`src/renderer/components/GetStartedModal/index.tsx`)

**Template Features**:
- Pre-configured example project
- Feature list display
- One-click project creation
- Progress indication

### IPC Communication

#### Project Handlers (`src/main/ipcHandlers/projects.ipcHandlers.ts`)

```typescript
// New project creation
ipcMain.handle('project:add', async (_event, body: { name: string; connectionId?: string }) => {
  return ProjectsService.addProject(body.name, body.connectionId);
});

// Git repository import
ipcMain.handle('project:addFromVCS', async (_event, body: { path: string; name: string; connectionId?: string }) => {
  return ProjectsService.addProjectFromVCS(body);
});

// Folder import
ipcMain.handle('project:addFromFolder', async () => {
  return ProjectsService.importProjectFromFolder();
});
```

#### Git Handlers (`src/main/ipcHandlers/git.ipcHandlers.ts`)

```typescript
ipcMain.handle('git:clone', async (_event, { url, credentials }) => {
  try {
    const result = await gitService.cloneRepo(url, credentials);
    return {
      name: result.name,
      path: result.path,
      connectionId: result.connectionId,
    };
  } catch (err: any) {
    if (err instanceof AuthError) return { authRequired: true };
    return { error: err?.message };
  }
});
```

## Connection Management

### Auto-Detection Process

1. **File Parsing**: Scans for `profiles.yml` and `rosetta/main.conf`
2. **Connection Mapping**: Converts DBT format to internal format
3. **Validation**: Ensures connection configuration is valid
4. **Secure Storage**: Stores credentials securely using keytar
5. **Configuration Generation**: Creates necessary config files

### Supported Database Types

- **PostgreSQL**: Host, port, username, password, database, schema
- **Snowflake**: Account, username, password, warehouse, database, schema, role
- **BigQuery**: Project, keyfile, location, method
- **Redshift**: Host, port, username, password, database, schema, SSL
- **Databricks**: Host, token, path, catalog, schema
- **DuckDB**: Database path

### Security Features

- **Credential Encryption**: Uses keytar for secure storage
- **BigQuery Key Management**: Special handling for service account keys
- **Connection Validation**: Tests connections before saving
- **Error Handling**: Protects sensitive information in error messages

## Error Handling

### Validation Errors

- **Project Name**: Uniqueness and format validation
- **Connection Name**: Reserved name protection
- **File Structure**: Valid dbt project structure
- **Authentication**: Git credential validation

### User Feedback

- **Toast Notifications**: Success and error messages
- **Loading States**: Progress indication during operations
- **Form Validation**: Real-time input validation
- **Error Recovery**: Graceful handling of failures

## File Structure Management

### Template Files

**DBT Template**:
- `dbt_project.yml` with project name replacement
- Standard dbt project structure
- Model templates and examples

**Rosetta Template**:
- `rosetta/main.conf` configuration
- Connection setup templates
- Integration configuration

### Project Structure

```
project/
├── dbt_project.yml
├── profiles.yml
├── models/
├── rosetta/
│   └── main.conf
└── [other dbt files]
```

## Integration Points

### React Query Integration

- **Project List**: Cached project data with invalidation
- **Connection Management**: Real-time connection updates
- **State Management**: Optimistic updates for better UX

### Navigation Flow

1. **Project Selection**: `/select-project`
2. **New Project**: Form-based creation
3. **Git Import**: Modal-based cloning
4. **Folder Import**: File dialog selection
5. **Template Import**: One-click getting started
6. **Project Details**: `/app` after successful import

### Settings Integration

- **Project Directory**: Configurable base path
- **Template Paths**: DBT and Rosetta template locations
- **Default Connections**: Pre-configured connection options

## Best Practices

### Project Naming

- Use descriptive, unique names
- Follow dbt naming conventions
- Avoid special characters and spaces
- Consider organization structure

### Connection Management

- Use descriptive connection names
- Store credentials securely
- Test connections before saving
- Document connection purposes

### Template Usage

- Start with getting started template for new users
- Use templates for consistent project structure
- Customize templates for organization needs
- Maintain template documentation

## Future Enhancements

### Planned Features

- **Project Templates**: Custom template creation
- **Bulk Import**: Multiple project import
- **Project Migration**: Version upgrade support
- **Cloud Integration**: Direct cloud repository import
- **Project Backup**: Export/import project configurations

### Technical Improvements

- **Performance**: Optimize large project imports
- **Validation**: Enhanced project structure validation
- **Error Recovery**: Better failure recovery mechanisms
- **User Experience**: Improved progress indication 