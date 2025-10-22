# Database Integration & Schema Extractors

## Overview
DBT Studio supports 12+ database types with a unified connection interface and specialized schema extractors. This document details the database integration patterns, schema extraction capabilities, and connection management.

## Supported Database Types

### Fully Implemented (with Schema Extractors)
1. **PostgreSQL** (`src/main/extractor/pg.extractor.ts`)
   - Full schema extraction with tables, columns, constraints
   - Support for multiple schemas and databases
   - Real-time connection testing

2. **Snowflake** (`src/main/extractor/snowflake.extractor.ts`)
   - Account-based authentication
   - Warehouse and role configuration
   - Schema metadata with data types

3. **BigQuery** (`src/main/extractor/bigquery.extractor.ts`)
   - Service account authentication
   - Dataset and project structure
   - Google Cloud integration

4. **Redshift** (`src/main/extractor/redshift.extractor.ts`)
   - AWS-compatible PostgreSQL variant
   - Cluster-based connections
   - SSL configuration support

5. **Databricks** (`src/main/extractor/databrics.extractor.ts`)
   - Token-based authentication
   - SQL endpoint connectivity
   - Delta Lake integration

6. **DuckDB** (`src/main/extractor/duckdb.extractor.ts`)
   - Local file-based database
   - In-memory analytics
   - Integration with cloud storage

### Supported (Connection Only)
- **MySQL**: Basic connection support
- **Oracle**: Enterprise database connectivity  
- **DB2**: IBM database support
- **MSSQL**: Microsoft SQL Server
- **Kinetica**: GPU-accelerated analytics
- **Google Cloud**: Additional GCP services

## Connection Type System

### Base Connection Interface
```typescript
export type ConnectionBase = {
  type: SupportedConnectionTypes;
  name: string;
  username: string;
  password: string;
  database: string;
  schema: string;
};
```

### Provider-Specific Connections
Each database type extends the base with specific configuration:

```typescript
export type PostgresConnection = ConnectionBase & {
  type: 'postgres';
  host: string;
  port: number;
  keepalives_idle?: number;
};

export type SnowflakeConnection = ConnectionBase & {
  type: 'snowflake';
  account: string;
  warehouse: string;
  role?: string;
  client_session_keep_alive?: boolean;
};

export type BigQueryConnection = ConnectionBase & {
  type: 'bigquery';
  project: string;
  dataset: string;
  method: 'service-account';
  keyfile: string;
  location?: string;
  priority?: 'interactive' | 'batch';
};
```

## Schema Extraction Architecture

### Extractor Interface
All schema extractors implement a consistent interface:

```typescript
interface SchemaExtractor {
  extractSchema(connection: ConnectionInput): Promise<Table[]>;
  testConnection(connection: ConnectionInput): Promise<boolean>;
}
```

### Table Structure
```typescript
export type Table = {
  name: string;
  schema: string;
  columns: Column[];
  primaryKeys?: string[];
  foreignKeys?: ForeignKey[];
};

export type Column = {
  name: string;
  type: string;
  nullable: boolean;
  defaultValue?: string;
  isPrimaryKey?: boolean;
  isForeignKey?: boolean;
};
```

## Connection Management Patterns

### Secure Credential Storage
Database credentials are stored using keytar with project-specific isolation:

```typescript
// Pattern: db-{credential-type}-{projectName}
const usernameKey = `db-user-${projectName}`;
const passwordKey = `db-password-${projectName}`;
const tokenKey = `db-token-${projectName}`;

// Usage in components
const { getDatabaseUsername, setDatabasePassword } = useSecureStorage();
```

### Connection Testing
Real-time connection validation before saving:

```typescript
const { mutate: testConnection } = useTestConnection({
  onSuccess: (success) => {
    if (success) {
      setConnectionStatus('success');
      toast.success('Connection successful!');
    } else {
      setConnectionStatus('failed');
      toast.error('Connection failed');
    }
  },
});
```

### Environment Variable Injection
Secure credential injection for CLI operations:

```typescript
const setEnvVariables = useSetConnectionEnvVariable();

// Before running dbt commands
await setEnvVariables({
  key: 'DBT_DATABASE_USERNAME',
  value: await getDatabaseUsername(project.name),
});
```

## Schema Extractor Implementation Details

### PostgreSQL Extractor
```sql
-- Extract table information
SELECT 
  t.table_schema,
  t.table_name,
  c.column_name,
  c.data_type,
  c.is_nullable,
  c.column_default
FROM information_schema.tables t
JOIN information_schema.columns c ON t.table_name = c.table_name
WHERE t.table_schema NOT IN ('information_schema', 'pg_catalog')
ORDER BY t.table_schema, t.table_name, c.ordinal_position;
```

### Snowflake Extractor
```sql
-- Snowflake-specific metadata queries
SHOW TABLES IN SCHEMA identifier($1);
DESCRIBE TABLE identifier($1);
```

### BigQuery Extractor
Uses Google Cloud BigQuery client for metadata:

```typescript
const [tables] = await bigquery
  .dataset(dataset)
  .getTables();

const [metadata] = await table.getMetadata();
```

## Connection Validation Patterns

### Multi-Step Validation
1. **Basic Connectivity**: Network reachability
2. **Authentication**: Credential validation
3. **Permission Testing**: Schema access verification
4. **Query Execution**: Sample query execution

### Error Handling
Provider-specific error messages with actionable guidance:

```typescript
// Example for BigQuery
if (error.code === 403) {
  return {
    success: false,
    error: 'BigQuery Authentication Error: Insufficient permissions...',
  };
}
```

## Integration with dbt Profiles

### Profile Generation
Automatic dbt profiles.yml generation based on connection configuration:

```yaml
# PostgreSQL example
my_project:
  outputs:
    dev:
      type: postgres
      host: "{{ env_var('DBT_DATABASE_HOST') }}"
      user: "{{ env_var('DBT_DATABASE_USERNAME') }}"
      password: "{{ env_var('DBT_DATABASE_PASSWORD') }}"
      port: 5432
      dbname: "{{ env_var('DBT_DATABASE_NAME') }}"
      schema: public
      threads: 4
      keepalives_idle: 0
```

### Environment Integration
Seamless integration with CLI tools through environment variables:

```typescript
// Set connection environment variables
const connectionEnvVars = {
  DBT_DATABASE_HOST: connection.host,
  DBT_DATABASE_USERNAME: await getDatabaseUsername(project.name),
  DBT_DATABASE_PASSWORD: await getDatabasePassword(project.name),
  DBT_DATABASE_NAME: connection.database,
};
```

## Performance Considerations

### Connection Pooling
- Reuse connections for schema extraction
- Close connections properly to prevent leaks
- Timeout handling for long-running operations

### Caching Strategy
- Cache schema data in React Query
- Invalidate cache on connection changes
- Background refresh for stale data

### Async Operations
```typescript
// Non-blocking schema extraction
const fetchSchema = async () => {
  setIsLoadingSchema(true);
  try {
    const schemaRes = await projectsServices.extractSchema(selectedProject);
    setSchema(schemaRes);
  } finally {
    setIsLoadingSchema(false);
  }
};
```

## Future Enhancements

### Planned Extractors
- **MySQL**: Full schema extraction implementation
- **Oracle**: Enterprise schema support
- **DB2**: IBM database schema extraction
- **MSSQL**: SQL Server metadata extraction

### Advanced Features
- **Schema Diffing**: Compare schema versions
- **Data Lineage**: Track data dependencies
- **Performance Metrics**: Query performance tracking
- **Auto-Discovery**: Automatic schema detection

## Best Practices

### Security
1. Never store credentials in plaintext
2. Use project-specific credential isolation
3. Implement proper connection timeouts
4. Validate all user inputs

### Performance
1. Cache schema data appropriately
2. Use connection pooling where possible
3. Implement proper error handling
4. Provide user feedback for long operations

### Maintainability
1. Follow consistent extractor patterns
2. Use TypeScript for type safety
3. Implement comprehensive error handling
4. Document provider-specific quirks

This database integration architecture provides a robust, secure, and extensible foundation for connecting to various database systems while maintaining consistent patterns and user experience.
