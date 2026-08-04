/* eslint-disable no-case-declarations, consistent-return */
import {
  BigQueryConnection,
  ConnectionModel,
  DatabricksConnection,
  DuckDBConnection,
  FabricSparkConnection,
  PostgresConnection,
  RedshiftConnection,
  SnowflakeConnection,
} from '../../types/backend';

const assertNever = (_value: never, context: string): never => {
  throw new Error(
    `UNSUPPORTED_CONNECTION_TYPE: ${context} received an unsupported connection type.`,
  );
};

const getConnectionInput = (conn: ConnectionModel) => {
  if (!conn) {
    return;
  }
  const { connection } = conn;
  const { type } = connection;
  switch (type) {
    case 'postgres':
      const pg = connection as PostgresConnection;
      return {
        type,
        host: pg.host,
        port: pg.port,
        username: pg.username,
        password: pg.password,
        database: pg.database,
        schema: pg.schema || 'public',
      };
    case 'redshift':
      const rs = connection as RedshiftConnection;
      return {
        type,
        host: rs.host,
        port: rs.port,
        username: rs.username,
        password: rs.password,
        database: rs.database,
        schema: rs.schema || 'public',
      };
    case 'snowflake':
      const sf = connection as SnowflakeConnection;
      return {
        type,
        account: sf.account,
        username: sf.username,
        password: sf.password,
        database: sf.database,
        warehouse: sf.warehouse,
        schema: sf.schema || 'PUBLIC',
        role: sf.role,
      };
    case 'bigquery':
      const bq = connection as BigQueryConnection;
      return {
        type,
        projectId: bq.project,
        keyFilename: bq.keyfile,
        schema: bq.database,
        method: bq.method,
        keyfile: bq.keyfile,
        location: bq.location,
        priority: bq.priority,
      };
    case 'databricks':
      const db = connection as DatabricksConnection;
      return {
        type,
        host: db.host,
        port: db.port,
        httpPath: db.httpPath,
        token: db.token, // Use token directly
        database: db.database,
        schema: db.schema,
      };
    case 'duckdb':
      const duck = connection as DuckDBConnection;
      return {
        type,
        database_path: duck.database_path,
        database: duck.database,
        schema: duck.schema || 'main',
        name: connection.name,
      };
    case 'kinetica':
    case 'ducklake':
      return undefined;
    case 'fabricspark': {
      const fabric = connection as FabricSparkConnection;
      return {
        type,
        name: fabric.name,
        endpoint: fabric.endpoint,
        workspaceId: fabric.workspaceId,
        lakehouseId: fabric.lakehouseId,
        lakehouse: fabric.lakehouse,
        schemaMode: fabric.schemaMode,
        schema: fabric.schema,
        authentication: fabric.authentication,
        clientId: fabric.clientId,
        tenantId: fabric.tenantId,
        hasClientSecret: fabric.hasClientSecret,
        threads: fabric.threads,
        environmentId: fabric.environmentId,
        reuseSession: fabric.reuseSession,
        highConcurrency: fabric.highConcurrency,
        workspaceName: fabric.workspaceName,
      };
    }
    default:
      return assertNever(connection, 'useConnectionInput');
  }
};

export default getConnectionInput;
