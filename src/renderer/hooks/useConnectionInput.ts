/* eslint-disable no-case-declarations */
import {
  BigQueryDBTConnection,
  DatabricksDBTConnection,
  DuckDBDBTConnection,
  PostgresDBTConnection,
  Project,
  RedshiftDBTConnection,
  SnowflakeDBTConnection,
} from '../../types/backend';

const useConnectionInput = (selectedProject?: Project) => {
  if (!selectedProject?.dbtConnection) return undefined;
  const { type, ...rest } = selectedProject.dbtConnection;

  switch (type) {
    case 'postgres':
      const pg = rest as PostgresDBTConnection;
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
      const rs = rest as RedshiftDBTConnection;
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
      const sf = rest as SnowflakeDBTConnection;
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
      const bq = rest as BigQueryDBTConnection;
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
      const db = rest as DatabricksDBTConnection;
      return {
        type,
        host: db.host,
        port: db.port,
        httpPath: db.http_path,
        token: db.token, // Use token directly
        database: db.database,
        schema: db.schema,
      };
    case 'duckdb':
      const duck = rest as DuckDBDBTConnection;
      return {
        type,
        database_path: duck.path,
        database: duck.database,
        schema: duck.schema || 'main',
        name: selectedProject.name,
      };
    default:
      return undefined;
  }
};

export default useConnectionInput;
