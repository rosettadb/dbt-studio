# Database Connections Feature

## Overview

The Database Connections feature provides a comprehensive connection management system for DBT Studio, enabling users to manage, configure, test, and reuse database connections across multiple dbt projects. This feature implements a centralized connection repository with full CRUD operations and seamless integration with the project lifecycle.

## Key Features

### 1. Connection Management
- **Centralized Repository**: Store and manage database connections in a centralized location
- **Connection Reusability**: Share connections across multiple dbt projects
- **CRUD Operations**: Create, Read, Update, and Delete connections
- **Connection Testing**: Validate connection configurations before saving
- **Secure Storage**: Encrypted credential management using keytar integration

### 2. Supported Database Types
The feature supports the following database types with their respective configuration parameters:

#### PostgreSQL
- Host, Port, Username, Password, Database, Schema
- Keep-alive settings for connection persistence

#### Snowflake
- Account, Username, Password, Database, Warehouse, Schema, Role
- Client session keep-alive configuration

#### BigQuery
- Project ID, Service Account Key File, Dataset, Location
- Interactive/Batch priority settings

#### Redshift
- Host, Port, Username, Password, Database, Schema
- SSL configuration support

#### Databricks
- Host, Port, HTTP Path, Token, Database, Schema
- Token-based authentication

#### DuckDB
- Database file path, Schema
- Local file-based database support

### 3. UI Components

#### Connection Cards
- Visual representation of each database type with icons
- Connection status indicators
- Quick access to connection details and actions

#### Connection Forms
- Type-specific configuration forms
- Real-time validation and testing
- Secure credential handling with masked password fields
- File picker integration for service account keys (BigQuery)

#### Connection List Management
- Tabular view of all connections
- Connection usage tracking (which projects use each connection)
- Inline actions: Edit, Delete, Test
- Filter and search capabilities

## Architecture Changes

### Backend Services

#### ConnectorsService Enhancements
- **loadConnections()**: Retrieve all stored connections
- **getConnectionById()**: Get specific connection by ID
- **saveNewConnection()**: Store new connection configurations
- **updateConnection()**: Modify existing connections
- **deleteConnection()**: Remove connections (with usage validation)
- **testConnection()**: Validate connection parameters
- **configureConnection()**: Associate connections with projects

#### IPC Handler Updates
New IPC channels added:
- `connector:list` - List all connections
- `connector:get` - Get connection by ID
- `connector:update` - Update existing connection
- `connector:delete` - Delete connection
- Enhanced existing handlers with connection ID support

### Frontend Integration

#### React Query Controllers
New controller hooks:
- `useGetConnections()` - Fetch all connections with caching
- `useGetConnectionById()` - Fetch specific connection
- `useUpdateConnection()` - Update connection with optimistic updates
- `useDeleteConnection()` - Delete connection with cache invalidation
- `useConfigureConnection()` - Associate connection with project

#### Connection Components
- **Connection Forms**: Type-specific forms for each database
- **Connection Header**: Reusable component for connection configuration UI
- **Connection List**: Management interface for all connections
- **Connection Cards**: Visual selection interface

### Project Integration

#### Enhanced Project Creation
Projects can now be created with:
- Pre-selected database connections
- Automatic profile generation based on connection
- Connection inheritance from VCS projects

#### Connection Association
- Projects maintain references to connection IDs
- Multiple projects can share the same connection
- Connection usage tracking prevents accidental deletion

## Security Implementation

### Credential Management
- **Secure Storage**: Database passwords and tokens stored using keytar
- **Project Scoping**: Credentials scoped by project name for multi-tenant security
- **Environment Isolation**: Runtime credential injection without file persistence
- **Masked UI Fields**: Sensitive data never exposed in plain text

### Storage Patterns
- Connection metadata stored in `database.json`
- Sensitive credentials stored separately in system keychain
- Project-specific credential keys: `db-user-${projectName}`, `db-password-${projectName}`, `db-token-${projectName}`

## User Workflow

### Creating a New Connection
1. Navigate to Connections management screen
2. Select database type from available options
3. Fill in connection parameters
4. Test connection to validate configuration
5. Save connection for future use

### Using Existing Connections
1. When creating a new project, view existing connections
2. Select appropriate connection from the list
3. System automatically configures project with selected connection
4. Generate dbt profiles.yml and Rosetta main.conf files

### Managing Connections
1. View all connections with usage information
2. Edit connection parameters as needed
3. Test connections to verify functionality
4. Delete unused connections (with usage validation)

## Technical Details

### Connection Data Models

#### ConnectionInput Types
Each database type has specific input parameters:
```typescript
type PostgresConnection = {
  type: 'postgres';
  host: string;
  port: number;
  username: string;
  password: string;
  database: string;
  schema: string;
};

type DatabricksConnection = {
  type: 'databricks';
  host: string;
  port: number;
  httpPath: string;
  token: string;
  database: string;
  schema: string;
};
```

#### ConnectionModel Structure
```typescript
type ConnectionModel = {
  id: string;
  connection: ConnectionInput;
};
```

### File System Integration
- **Profiles Generation**: Automatic dbt profiles.yml creation
- **Rosetta Configuration**: main.conf file generation for schema extraction
- **Service Account Files**: Secure storage for BigQuery key files
- **Project Association**: Connection references in project metadata

### Error Handling
- Connection validation with user-friendly error messages
- Timeout handling for database connections
- Secure credential validation
- Usage validation before connection deletion

## Benefits

### Developer Experience
- **Reduced Configuration Time**: Reuse connections across projects
- **Centralized Management**: Single location for all database connections
- **Connection Testing**: Validate configurations before use
- **Visual Interface**: Intuitive UI for connection management

### Security Benefits
- **Encrypted Storage**: Secure credential management
- **Project Isolation**: Scoped access to sensitive data
- **No Plaintext Storage**: Credentials never stored in configuration files
- **Audit Trail**: Connection usage tracking

### Operational Benefits
- **Connection Reusability**: Share connections across teams and projects
- **Consistent Configuration**: Standardized connection parameters
- **Easy Migration**: Simple connection updates across multiple projects
- **Usage Tracking**: Understand connection dependencies

## Future Enhancements

### Planned Features
- **Connection Templates**: Predefined connection configurations
- **Team Sharing**: Share connections across team members
- **Connection Pools**: Advanced connection pooling and load balancing
- **Connection Monitoring**: Real-time connection health monitoring
- **Bulk Operations**: Import/export connection configurations

### Additional Database Support
- **Oracle Database**: Enterprise database support
- **MySQL**: Open-source database integration
- **SQL Server**: Microsoft SQL Server connectivity
- **MongoDB**: NoSQL database support
- **Cassandra**: Wide-column store support

## Implementation Status

### Completed Features ✅
- ✅ Basic CRUD operations for connections
- ✅ Connection testing and validation
- ✅ Secure credential storage
- ✅ Project-connection association
- ✅ UI components for all supported databases
- ✅ React Query integration with caching
- ✅ IPC communication layer
- ✅ Connection reusability across projects

### In Progress 🚧
- 🚧 Enhanced error handling and user feedback
- 🚧 Connection usage analytics
- 🚧 Bulk connection operations

### Recently Completed ✅
- ✅ **Connection Name Validation**: Unique name enforcement with "DBT Connection" reserved for getting started template
- ✅ **Real-time Validation**: Frontend validation with immediate user feedback across all connection forms
- ✅ **Backend Validation**: Server-side validation for data integrity
- ✅ **Universal Form Integration**: Extended validation to all 6 connection types (PostgreSQL, Snowflake, BigQuery, Redshift, Databricks, DuckDB)

### Future Development 📋
- 📋 Additional database type support
- 📋 Connection sharing and templates
- 📋 Advanced connection monitoring
- 📋 Import/export functionality

## Developer Notes

### Code Organization
- **Backend Services**: `src/main/services/connectors.service.ts`
- **IPC Handlers**: `src/main/ipcHandlers/connectors.ipcHandlers.ts`
- **Frontend Services**: `src/renderer/services/connectors.service.ts`
- **React Controllers**: `src/renderer/controllers/connectors.controller.ts`
- **UI Components**: `src/renderer/components/connections/`
- **Type Definitions**: `src/types/backend.ts`, `src/types/ipc.ts`

### Testing Strategy
- Unit tests for connection validation logic
- Integration tests for database connectivity
- UI tests for connection forms and management
- Security tests for credential handling

### Performance Considerations
- Connection caching with React Query
- Lazy loading of connection lists
- Optimistic updates for better UX
- Connection pooling for database operations

## Recent Updates & Improvements (2025)

### Sidebar Navigation Enhancements

#### New Sidebar Order & Structure
The sidebar has been completely restructured to provide a more logical workflow:

1. **Database Connections** (index 0) - Connection management
2. **Select Project** (index 1) - Project selection
3. **DBT Studio** (index 2) - Main workspace (formerly "DBT Projects")
4. **SQL Editor** (index 3) - Query interface

**Changed from previous order:**
- DBT Projects moved from first to third position
- Database Connections moved from second to first position
- This creates a better workflow: Connect → Select → Work → Query

#### Icon Updates
- **Select Project**: Changed from `FolderOpen` → `AccountTree` → `Assignment`
- Final icon choice: `Assignment` (clipboard icon) - unique and semantically appropriate
- All other icons remain unchanged: `Cable`, `CodeSharp`, custom DBT icon

#### Enhanced Tooltips
Added comprehensive tooltip system to all sidebar items:
- **Database Connections**: "Database Connections"
- **Select Project**: "Select Project"  
- **DBT Studio**: "DBT Studio"
- **SQL Editor**: "SQL Editor"

**Tooltip Features:**
- Positioned to the right of icons (`placement="right"`)
- Arrow indicators pointing to icons (`arrow`)
- Conditional tooltips for disabled items (see below)

#### Conditional Item Disabling
Implemented smart disabling logic for project-dependent features:

**Disabled When No Project Selected:**
- **DBT Studio** (`/app`) - Requires active project
- **SQL Editor** (`/app/sql`) - Requires active project

**Always Accessible:**
- **Database Connections** (`/app/connections`) - Independent of project selection
- **Select Project** (`/app/select-project`) - Needed to select projects

**Visual Indicators for Disabled Items:**
- 50% opacity for visual distinction
- `not-allowed` cursor on hover
- `pointerEvents: 'none'` prevents navigation
- Enhanced tooltips: "DBT Studio - Select a project first"
- No active state highlighting when disabled

### Connection Management Improvements

#### Add Connection Navigation
- Added cancel/back button with left arrow icon to add connection screen
- Improved navigation flow after connection creation
- Returns to project selection after creating connection from project setup

#### Project Selection Integration
- Removed "No Connection" option from project creation dropdown
- Projects now require database connections before proceeding to main workspace
- Enhanced validation flow in `ProjectDetails` component

#### Enhanced Navigation Logic
Updated `ProjectDetails` component with improved redirect logic:

```typescript
// 1. No project selected → redirect to project selection
if (!project?.id) {
  return <Navigate to="/app/select-project" replace />;
}

// 2. Project exists but no database connection → redirect to add connection
if (project.id && !project.connectionId) {
  return <Navigate to={`/app/add-connection/${project.id}`} replace />;
}

// 3. Project exists but connection is invalid → redirect to connections management
if (project.connectionId && !project.dbtConnection) {
  toast.error('Database connection not found. Please select a valid connection.');
  return <Navigate to="/app/connections" replace />;
}
```

**Improvements:**
- Added `replace` prop to prevent browser back button issues
- Enhanced error handling for invalid connections
- Clear user feedback with toast messages
- Defensive programming for edge cases

### Sidebar Implementation Details

#### Active Item Logic
Updated active item detection to match new sidebar order:

```typescript
const activeItem = React.useMemo(() => {
  if (location.pathname.includes('connection')) {
    return 0; // Database Connections (first item)
  }
  if (location.pathname.includes('/app/select-project')) {
    return 1; // Select Project (second item)
  }
  if (location.pathname === '/app') {
    return 2; // DBT Studio (third item)
  }
  if (location.pathname.includes('sql')) {
    return 3; // SQL Editor (fourth item)
  }
  return 2; // Default to DBT Studio
}, [location.pathname]);
```

#### Dynamic Item Rendering
Implemented sophisticated conditional rendering:

```typescript
{sidebarElements.map((element, index) => {
  const requiresProject = element.path === '/app' || element.path === '/app/sql';
  const isDisabled = requiresProject && !isProjectSelected;
  
  return (
    <StyledNavLink
      style={{
        cursor: isDisabled ? 'not-allowed' : 'pointer',
        pointerEvents: isDisabled ? 'none' : 'auto',
      }}
    >
      <ListItem
        sx={{
          opacity: isDisabled ? 0.5 : 1,
          cursor: isDisabled ? 'not-allowed !important' : 'pointer',
          backgroundColor: activeItem === index && !isDisabled 
            ? theme.palette.divider 
            : 'transparent',
          '&:hover': {
            backgroundColor: isDisabled 
              ? 'transparent' 
              : theme.palette.action.hover,
          },
          transition: 'background-color 0.2s ease, opacity 0.2s ease',
        }}
      >
        <Tooltip 
          title={isDisabled 
            ? `${element.text} - Select a project first`
            : element.text
          }
        >
          {/* Icon component */}
        </Tooltip>
      </ListItem>
    </StyledNavLink>
  );
})}
```

### User Experience Improvements

#### Workflow Enhancement
1. **Better First-Time User Experience**: Clear progression from connections to project selection to workspace
2. **Logical Navigation Flow**: Users are guided through necessary setup steps
3. **Visual Feedback**: Clear indication of what's available and what requires setup
4. **Error Prevention**: Can't access features that require projects without selecting one first

#### Accessibility Improvements
- Proper ARIA labels through tooltip system
- Keyboard navigation support maintained
- Clear visual distinction between enabled/disabled states
- Screen reader compatible tooltip messages

#### Performance Optimizations
- Smooth CSS transitions for state changes
- Efficient React re-rendering with proper memoization
- Minimal re-computations of active states and disabled logic

## Detailed File Changes Summary

*Use this section as reference before git stashing changes*

### Connection Name Validation Implementation (July 22, 2025)

#### New Files Created:
- `src/renderer/utils/connectionValidation.ts` - Frontend validation utility functions and hooks

#### Modified Files:

##### Backend Validation:
- `src/main/services/connectors.service.ts` - Added connection name validation methods:
  - `validateConnectionName()` - Private method for name validation with optional `allowReservedNames` flag
  - `saveNewConnectionForTemplate()` - Special method allowing reserved names for template import
  - Updated `saveNewConnection()` - Added validation before creating connections
  - Updated `updateConnection()` - Added validation before updating connections
  - Updated `configureConnection()` - Added special handling for Getting Started template imports

##### Frontend Integration:
- `src/renderer/components/connections/postgres.tsx` - PostgreSQL connection form with validation
- `src/renderer/components/connections/snowflake.tsx` - Snowflake connection form with validation
- `src/renderer/components/connections/bigquery.tsx` - BigQuery connection form with validation
- `src/renderer/components/connections/redshift.tsx` - Redshift connection form with validation
- `src/renderer/components/connections/databricks.tsx` - Databricks connection form with validation
- `src/renderer/components/connections/duckdb.tsx` - DuckDB connection form with validation

All connection forms now include:
  - Real-time name validation as users type
  - Integrated error display in form fields
  - Form submission validation with user feedback
  - Material-UI error styling and helper text

##### Documentation:
- `connections-featute.md` - Comprehensive validation system documentation:
  - Technical implementation details
  - Code examples and integration patterns
  - User experience benefits
  - Future enhancement plans

#### Implementation Details:

**Validation Rules Implemented:**
1. **Empty Name Check**: Prevents empty or whitespace-only names
2. **Reserved Name Protection**: "DBT Connection" reserved for getting started template
3. **Uniqueness Enforcement**: Case-insensitive unique name validation across all connections

**Special Features:**
4. **Getting Started Template Support**: Reserved name "DBT Connection" is allowed during template import
   - Template detection via connection name matching
   - Bypass mechanism in `configureConnection` method
   - Uses `saveNewConnectionForTemplate` with `allowReservedNames=true`
   - Maintains validation for all other scenarios
3. **Uniqueness Enforcement**: Case-insensitive duplicate prevention
4. **Update Support**: Excludes current connection during updates

**Frontend Features:**
- Real-time validation implemented across all 6 connection forms
- Visual error indicators with descriptive messages
- Form submission prevention when invalid
- Material-UI error styling integration
- Consistent validation behavior across all database types

**Backend Features:**
- Server-side validation for data integrity
- Descriptive error messages that propagate to frontend
- Integration with existing CRUD operations
- Case-insensitive validation logic

**Implementation Complete:**
All connection forms have been successfully updated with validation:
- ✅ PostgreSQL (`postgres.tsx`)
- ✅ Snowflake (`snowflake.tsx`)
- ✅ BigQuery (`bigquery.tsx`)
- ✅ Redshift (`redshift.tsx`)
- ✅ Databricks (`databricks.tsx`)
- ✅ DuckDB (`duckdb.tsx`)

## Connection Name Validation System

### Overview
The connection name validation system ensures data integrity and prevents conflicts by enforcing unique connection names and protecting reserved names used by the system templates.

### Key Features

#### 1. Unique Name Enforcement
- **Case-Insensitive Comparison**: Connection names are compared ignoring case and leading/trailing whitespace
- **Duplicate Prevention**: Users cannot create connections with names that already exist
- **Update Support**: When editing connections, the current connection is excluded from uniqueness checks

#### 2. Reserved Name Protection
- **Template Protection**: "DBT Connection" is reserved for the getting started template
- **Case-Insensitive**: Reserved name checking ignores case variations
- **Clear Error Messages**: Users receive specific feedback about reserved names

#### 3. Real-Time Validation
- **Immediate Feedback**: Validation occurs as users type in connection forms
- **Visual Indicators**: Invalid names show red error styling and helper text
- **Form Prevention**: Submit buttons are disabled when validation fails
- **Submission Check**: Final validation before backend request
- **Backend Confirmation**: Server-side validation as final safeguard

### Technical Implementation

#### Backend Validation (Data Integrity Layer)
**File**: `src/main/services/connectors.service.ts`

```typescript
private static validateConnectionName(
  name: string,
  existingConnections: ConnectionModel[],
  excludeId?: string,
): { isValid: boolean; message?: string } {
  // Empty name check
  if (!name.trim()) {
    return {
      isValid: false,
      message: 'Connection name cannot be empty',
    };
  }

  // Reserved names check (case-insensitive)
  if (name.toLowerCase().trim() === 'dbt connection') {
    return {
      isValid: false,
      message: 'Connection name "DBT Connection" is reserved for the getting started template',
    };
  }

  // Uniqueness check (case-insensitive)
  const duplicateExists = existingConnections.some(
    (conn) =>
      conn.connection.name.toLowerCase().trim() === name.toLowerCase().trim() &&
      conn.id !== excludeId,
  );

  if (duplicateExists) {
    return {
      isValid: false,
      message: 'A connection with this name already exists',
    };
  }

  return { isValid: true };
}
```

**Integration Points:**
- `saveNewConnection()`: Validates before creating new connections
- `updateConnection()`: Validates before updating existing connections
- Throws descriptive errors that propagate to frontend

#### Frontend Validation (User Experience Layer)
**File**: `src/renderer/utils/connectionValidation.ts`

```typescript
export const validateConnectionName = (
  name: string,
  existingConnections: ConnectionModel[],
  excludeId?: string,
): { isValid: boolean; message?: string } => {
  // Mirror backend validation logic for immediate feedback
}

export const useConnectionNameValidation = (
  existingConnections: ConnectionModel[],
  excludeId?: string,
) => {
  const validateName = (name: string) => {
    return validateConnectionName(name, existingConnections, excludeId);
  };
  return { validateName };
};
```

#### Form Integration Example
**File**: `src/renderer/components/connections/postgres.tsx`

```typescript
// State for validation errors
const [nameError, setNameError] = React.useState<string>('');

// Get existing connections for validation
const { data: existingConnections = [] } = useGetConnections();
const { validateName } = useConnectionNameValidation(
  existingConnections,
  connection?.id, // Exclude current connection for updates
);

// Real-time validation in form handler
const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
  const { name, value } = e.target;
  
  setFormState((prev) => ({
    ...prev,
    [name]: name === 'port' ? Number(value) : value,
  }));

  // Validate connection name in real-time
  if (name === 'name') {
    const validation = validateName(value);
    setNameError(validation.isValid ? '' : validation.message || '');
  }
};

// Form submission validation
const handleSubmit = async (e: React.FormEvent) => {
  e.preventDefault();
  
  // Final validation before submission
  const nameValidation = validateName(formState.name);
  if (!nameValidation.isValid) {
    toast.error(nameValidation.message || 'Invalid connection name');
    setNameError(nameValidation.message || '');
    return;
  }
  
  // Proceed with submission...
};
```

#### D. UI Integration
```tsx
<TextField
  label="Connection Name"
  name="name"
  value={formState.name}
  onChange={handleChange}
  fullWidth
  margin="normal"
  required
  error={!!nameError}
  helperText={nameError || 'Enter a unique name for this connection'}
/>
```

### Validation Rules

#### 1. Empty Name Validation
- **Rule**: Connection name cannot be empty or contain only whitespace
- **Message**: "Connection name cannot be empty"
- **Applied**: Both frontend and backend

#### 2. Reserved Name Validation
- **Rule**: Case-insensitive check for "DBT Connection"
- **Message**: "Connection name 'DBT Connection' is reserved for the getting started template"
- **Applied**: Both frontend and backend
- **Future**: Can be extended for additional reserved names

#### 3. Uniqueness Validation
- **Rule**: Case-insensitive uniqueness across all existing connections
- **Message**: "A connection with this name already exists"
- **Applied**: Both frontend and backend
- **Update Mode**: Excludes current connection from uniqueness check

### Getting Started Template Handling

#### Special Case: Template Import
The Getting Started template contains a connection named "DBT Connection" which is normally reserved. To enable seamless template import, a special handling mechanism has been implemented:

**Implementation Details:**
- **Detection**: The `configureConnection` method automatically detects when a connection name is "DBT Connection"
- **Bypass Mechanism**: For template connections, the reserved name validation is bypassed using `saveNewConnectionForTemplate`
- **Scope**: This bypass only applies during project import, not during manual connection creation
- **Validation**: All other validation rules (uniqueness, empty name) still apply

```typescript
// In configureConnection method
if (!connectionId) {
  // Allow reserved name "DBT Connection" for Getting Started template
  const isTemplateConnection =
    connection.name.toLowerCase().trim() === 'dbt connection';
  if (isTemplateConnection) {
    connectionId = await this.saveNewConnectionForTemplate(
      connection,
      true, // allowReservedNames = true
    );
  } else {
    connectionId = await this.saveNewConnection(connection);
  }
}
```

**User Experience:**
- Template import works seamlessly without connection name conflicts
- Users can import the Getting Started template with the "DBT Connection" name
- Manual creation of "DBT Connection" is still blocked for normal users
- Clear separation between template import and manual connection creation

**Security Considerations:**
- Only affects project import flow, not manual connection management
- Maintains reserved name protection for regular user workflows  
- No changes required in git service or other components

### Error Handling

#### Backend Error Propagation
```typescript
// Backend throws descriptive errors
throw new Error('A connection with this name already exists');

// Frontend controllers receive and display these errors
const { mutate: configureConnection } = useConfigureConnection({
  onError: (error) => {
    toast.error(`Configuration failed: ${error.message}`);
  },
});
```

#### Frontend Validation Flow
1. **Real-time**: Validation occurs on every keystroke in name field
2. **Visual Feedback**: Error styling and helper text appear immediately
3. **Form Prevention**: Submit button disabled when errors exist
4. **Submission Check**: Final validation before backend request
5. **Backend Confirmation**: Server-side validation as final safeguard

### User Experience Benefits

#### 1. Immediate Feedback
- Users see validation errors as they type
- No need to submit form to discover naming conflicts
- Clear, actionable error messages

#### 2. Conflict Prevention
- Impossible to create duplicate connection names
- Getting started template name is protected
- Consistent naming across the application

#### 3. Data Integrity
- Backend validation ensures database consistency
- Frontend validation provides optimal user experience
- Dual-layer validation prevents edge cases

### Future Enhancements

#### Planned Improvements
- **Custom Reserved Names**: Allow administrators to define additional reserved names
- **Name Suggestions**: Automatic suggestions for conflicting names (e.g., "PostgreSQL Connection 2")
- **Bulk Validation**: Validate multiple connections during import operations
- **Pattern Validation**: Optional regex patterns for connection name formatting
- **Internationalization**: Multi-language support for validation messages

#### Integration Opportunities
- **Project Templates**: Validate template-specific connection names
- **Team Sharing**: Validate names across team-shared connections
- **Import/Export**: Validate names during bulk operations
- **API Integration**: Extend validation to REST API endpoints
