/* eslint-disable no-case-declarations, consistent-return */
import {
  BigQueryConnection,
  ConnectionModel,
  DatabricksConnection,
  DuckDBConnection,
  PostgresConnection,
  RedshiftConnection,
  SnowflakeConnection,
} from '../../types/backend';

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
        authMethod: sf.authMethod,
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
    default:
      return undefined;
  }
};

export default getConnectionInput;
