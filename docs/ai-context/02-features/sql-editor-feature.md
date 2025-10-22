# SQL Editor Feature - LLM Context Document

## Overview
The SQL Editor is a comprehensive database query interface in the DBT Studio Electron application that provides real-time SQL editing, execution, and result visualization. It integrates with multiple database types and provides intelligent autocompletion based on database schema.

## Architecture

### Core Components

#### 1. SQL Editor Screen (`src/renderer/screens/sql/index.tsx`)
- **Purpose**: Main container for the SQL editor interface
- **Layout**: Split-pane design with schema tree sidebar and editor/result panels
- **State Management**: Manages query execution state, results, and error handling
- **Key Features**:
  - Dynamic split pane for editor and results
  - Connection validation and error handling
  - Query history integration
  - Loading states and error display

#### 2. SQL Editor Component (`src/renderer/components/sqlEditor/index.tsx`)
- **Purpose**: Wrapper component that manages query execution and persistence
- **Key Responsibilities**:
  - Query execution via `connectorsServices.queryData()`
  - Query history management
  - Auto-save functionality with debouncing
  - Error handling and user feedback

#### 3. Monaco Editor Component (`src/renderer/components/sqlEditor/editorComponent/index.tsx`)
- **Purpose**: Core editor implementation using Monaco Editor
- **Key Features**:
  - SQL syntax highlighting
  - Intelligent autocompletion
  - Query block detection and run icons
  - Real-time content synchronization

## Schema Tree System

### Schema Tree Viewer (`src/renderer/components/schemaTreeViewer/index.tsx`)

#### Architecture
```typescript
type Props = {
  databaseName: string;
  type: SupportedConnectionTypes;
};
```

#### Tree Structure
- **Database Level**: Root node with connection icon
- **Schema Level**: Database schemas as expandable nodes
- **Table/View Level**: Individual tables and views
- **Column Level**: Table columns with type indicators

#### Rendering Components
- **RenderTree**: Renders individual table nodes with columns
- **TreeItems**: Provides styled components for each tree item type
- **Icons**: Different icons for tables, views, columns, and primary keys

#### Schema Data Flow
1. **Schema Extraction**: `projectsServices.extractSchema()` extracts schema from database
2. **Context Storage**: Schema stored in `AppContext` via `fetchSchema()`
3. **Tree Mapping**: Schema data mapped to tree structure in `schemaMap`
4. **Real-time Updates**: Schema refreshes via refresh button with loading states

### Schema Extraction Process

#### Database-Specific Extractors
Located in `src/main/extractor/`:
- **PostgreSQL**: `PGSchemaExtractor` - Uses `pg` library
- **Snowflake**: `SnowflakeExtractor` - Uses `snowflake-sdk`
- **BigQuery**: `BigQueryExtractor` - Uses `@google-cloud/bigquery`
- **Databricks**: `DatabricksExtractor` - Uses `@databricks/sql`
- **DuckDB**: `DuckDBExtractor` - Uses `@duckdb/node-api`
- **Redshift**: `RedshiftExtractor` - Uses `pg` library with SSL support

#### Extraction Process
1. **Connection**: Establish database connection with credentials
2. **Schema Query**: Execute database-specific schema queries
3. **Metadata Parsing**: Parse table, column, and constraint information
4. **Type Mapping**: Map database types to application types
5. **Result Formatting**: Return standardized `Table[]` structure

## SQL Command Execution

### Execution Flow

#### 1. Query Submission
```typescript
const handleRunQuery = async (selectedQuery: string) => {
  const result = await connectorsServices.queryData({
    connection: connectionInput,
    query: selectedQuery,
    projectName: selectedProject.name,
  });
};
```

#### 2. Backend Processing (`src/main/services/connectors.service.ts`)
- **Credential Retrieval**: Secure storage service retrieves encrypted credentials
- **Connection Establishment**: Database-specific connection setup
- **Query Execution**: Execute SQL with proper error handling
- **Result Formatting**: Standardize results across database types

#### 3. Database-Specific Execution (`src/main/utils/connectors.ts`)

##### PostgreSQL/Redshift
```typescript
export const executePostgresQuery = async (
  config: PostgresConnection,
  query: string,
): Promise<QueryResponseType> => {
  const client = new pg.Client(config);
  await client.connect();
  const result = await client.query(query);
  return {
    success: true,
    data: result.rows,
    fields: result.fields.map((f) => ({ name: f.name, type: f.dataTypeID })),
  };
};
```

##### Snowflake
```typescript
export const executeSnowflakeQuery = async (
  config: SnowflakeConnection,
  query: string,
): Promise<QueryResponseType> => {
  const connection = snowflake.createConnection(config);
  await connection.connect();
  const result = await connection.execute({ sqlText: query });
  return { success: true, data: result.rows, fields: result.fields };
};
```

##### BigQuery
```typescript
export const executeBigQueryQuery = async (
  config: BigQueryConnection,
  query: string,
): Promise<QueryResponseType> => {
  const client = new BigQuery(bigqueryConfig);
  const [rows] = await client.query({ query, location: config.location });
  return { success: true, data: rows, fields: Object.keys(rows[0] || {}) };
};
```

### Query Block Detection

#### Block Extraction Algorithm
```typescript
const extractQueryBlock = (
  model: monaco.editor.ITextModel,
  lineNumber: number,
) => {
  let start = lineNumber;
  let end = lineNumber;

  // Expand upward until empty line
  for (let i = lineNumber - 1; i >= 1; i--) {
    const line = model.getLineContent(i).trim();
    if (line === '') break;
    start = i;
  }

  // Expand downward until empty line
  for (let i = lineNumber + 1; i <= totalLines; i++) {
    const line = model.getLineContent(i).trim();
    if (line === '') break;
    end = i;
  }

  return model.getValueInRange(
    new monaco.Range(start, 1, end, model.getLineMaxColumn(end))
  ).trim();
};
```

#### Run Icon Placement
- **Detection**: Identifies start of SQL blocks (non-empty lines after empty lines)
- **Visual Indicators**: Adds run icons (▶) in the gutter margin
- **Interaction**: Click on icon executes the entire block
- **Real-time Updates**: Icons update as content changes

## Autocompletion System

### Completion Generation (`src/renderer/helpers/utils.ts`)

#### SQL Keywords
```typescript
export const MonacoAutocompleteSQLKeywords = [
  'SELECT', 'FROM', 'WHERE', 'JOIN', 'INNER JOIN', 'LEFT JOIN',
  'GROUP BY', 'ORDER BY', 'INSERT INTO', 'UPDATE', 'DELETE',
  'CREATE TABLE', 'ALTER TABLE', 'DROP TABLE', 'AS', 'AND', 'OR',
  'NOT', 'IN', 'IS NULL', 'IS NOT NULL', 'DISTINCT', 'LIMIT',
  'OFFSET', 'HAVING', 'CASE', 'WHEN', 'THEN', 'ELSE', 'END'
] as const;
```

#### Schema-Based Completions
```typescript
export const generateMonacoCompletions = (tables: Table[]) => {
  const completions: Omit<CompletionItem, 'range'>[] = [];
  const seenLabels = new Set<string>();

  // Add SQL keywords
  MonacoAutocompleteSQLKeywords.forEach((keyword) => {
    completions.push({
      label: keyword,
      kind: MonacoCompletionItemKind.Keyword,
      insertText: keyword,
      detail: 'SQL keyword',
    });
  });

  // Add schemas
  tables.forEach((table) => {
    completions.push({
      label: table.schema,
      kind: MonacoCompletionItemKind.Module,
      insertText: table.schema,
      detail: 'Schema',
    });
  });

  // Add tables
  tables.forEach((table) => {
    completions.push({
      label: table.name,
      kind: MonacoCompletionItemKind.Struct,
      insertText: table.name,
      detail: `Table in ${table.schema}`,
    });

    // Add qualified table names
    const qualifiedTableName = `${table.schema}.${table.name}`;
    completions.push({
      label: qualifiedTableName,
      kind: MonacoCompletionItemKind.Struct,
      insertText: qualifiedTableName,
      detail: 'Qualified table name',
    });
  });

  // Add columns
  tables.forEach((table) => {
    table.columns.forEach((column) => {
      completions.push({
        label: column.name,
        kind: MonacoCompletionItemKind.Field,
        insertText: column.name,
        detail: 'Column',
      });

      // Add fully qualified column names
      const fullyQualifiedColumn = `${table.schema}.${table.name}.${column.name}`;
      completions.push({
        label: fullyQualifiedColumn,
        kind: MonacoCompletionItemKind.Value,
        insertText: fullyQualifiedColumn,
        detail: 'Fully qualified column',
      });
    });
  });

  return completions;
};
```

### Monaco Editor Integration

#### Completion Provider Registration
```typescript
const registerCompletionProvider = () => {
  completionProviderRef.current = monacoInstance.languages.registerCompletionItemProvider('sql', {
    provideCompletionItems: (model, position) => {
      const word = model.getWordUntilPosition(position);
      const range = {
        startLineNumber: position.lineNumber,
        endLineNumber: position.lineNumber,
        startColumn: word.startColumn,
        endColumn: word.endColumn,
      };

      const suggestions = completions.map((item) => ({
        ...item,
        range,
      }));
      return { suggestions };
    },
  });
};
```

## Query History System

### History Management (`src/renderer/components/sqlEditor/queryHistory/index.tsx`)

#### History Data Structure
```typescript
type QueryHistoryType = {
  id: string;
  executedAt: Date;
  results: QueryResponseType;
  projectId: string;
  projectName: string;
  query: string;
};
```

#### History Features
- **Automatic Storage**: Queries saved automatically after execution
- **Project Filtering**: History filtered by current project
- **Time-based Sorting**: Most recent queries first
- **Query Preview**: Hover tooltips show query snippets
- **Selection Dialog**: Detailed view with full query and results
- **One-click Loading**: Click to load query back into editor

#### History UI Components
- **Toolbar Icon**: History button in editor toolbar
- **Dropdown Menu**: List of recent queries with timestamps
- **Detail Dialog**: Full query view with syntax highlighting
- **Selection Action**: Load query into editor with one click

## Result Visualization

### Query Result Component (`src/renderer/screens/sql/queryResult.tsx`)

#### Result Processing
```typescript
export const QueryResult: React.FC<Props> = ({ results }) => {
  const columns = React.useMemo(() => {
    return results.fields?.map((field) => field.name) ?? [];
  }, [results]);

  const rows = React.useMemo(() => {
    return results.data ?? [];
  }, [results]);
};
```

#### Custom Table Integration
- **Dynamic Columns**: Auto-generated from query results
- **Data Formatting**: JSON stringification for complex data types
- **Responsive Design**: Handles large result sets efficiently
- **Type Safety**: Generic typing for different data structures

## Error Handling

### Error Management Flow
1. **Connection Errors**: Validated before query execution
2. **Query Errors**: Caught and displayed with user-friendly messages
3. **Network Errors**: Handled with retry mechanisms
4. **Result Errors**: Graceful degradation for malformed results

### Error Display
- **Toast Notifications**: Immediate feedback for errors
- **Error State**: Clear error messages in result panel
- **Loading States**: Visual feedback during execution
- **Connection Status**: Real-time connection validation

## Security Considerations

### Credential Management
- **Secure Storage**: Credentials stored using keytar encryption
- **Environment Variables**: Sensitive data passed via environment
- **Connection Isolation**: Each query uses fresh connection
- **Credential Rotation**: Support for credential updates

### Query Security
- **Input Validation**: SQL injection prevention
- **Connection Limits**: Timeout and connection pool limits
- **Error Sanitization**: Sensitive data filtered from error messages
- **Audit Trail**: Query history for security monitoring

## Performance Optimizations

### Editor Performance
- **Debounced Saving**: 500ms delay for auto-save
- **Virtual Scrolling**: Efficient rendering of large files
- **Completion Caching**: Autocompletion results cached
- **Memory Management**: Proper disposal of Monaco instances

### Query Performance
- **Connection Pooling**: Efficient database connections
- **Result Streaming**: Large result set handling
- **Query Optimization**: Database-specific optimizations
- **Caching**: Schema and connection caching

## Integration Points

### App Context Integration
- **Schema Management**: Centralized schema state in `AppContext`
- **Project Selection**: Query execution tied to selected project
- **Connection State**: Real-time connection status updates
- **Theme Integration**: Dark/light mode support

### IPC Communication
- **Query Execution**: IPC calls to main process for database operations
- **File Operations**: Save/load queries via IPC
- **Schema Extraction**: IPC calls for schema retrieval
- **Error Handling**: Cross-process error propagation

## Development Patterns

### Component Architecture
- **Functional Components**: React hooks for state management
- **TypeScript**: Strict typing for all components
- **Material-UI**: Consistent styling and theming
- **Error Boundaries**: Graceful error handling

### State Management
- **Local State**: Component-specific state with useState
- **Context State**: Global state via React Context
- **Persistence**: localStorage for user preferences
- **Real-time Updates**: Live schema and connection updates

### Testing Considerations
- **Unit Tests**: Component and utility function testing
- **Integration Tests**: End-to-end query execution testing
- **Mock Patterns**: Database connection mocking
- **Error Scenarios**: Comprehensive error handling tests

## Future Enhancements

### Planned Features
- **Query Templates**: Pre-built query templates
- **Query Optimization**: AI-powered query suggestions
- **Result Export**: CSV/JSON export functionality
- **Query Scheduling**: Automated query execution
- **Collaboration**: Shared queries and results

### Technical Improvements
- **WebSocket Support**: Real-time query progress
- **Query Plan Visualization**: Execution plan display
- **Advanced Autocompletion**: Context-aware suggestions
- **Query Validation**: Syntax and semantic validation
- **Performance Monitoring**: Query execution metrics

This SQL Editor feature provides a comprehensive, secure, and user-friendly interface for database query execution within the DBT Studio application, supporting multiple database types with intelligent autocompletion and robust error handling. 