import { Postgres } from './postgres';
import { Snowflake } from './snowflake';
import { BigQuery } from './bigquery';
import { Redshift } from './redshift';
import { Databricks } from './databricks';
import { DuckDB } from './duckdb';
import { SQLite } from './sqlite';
import { Kinetica } from './kinetica';
import { Db2 } from './db2';

export const Connections = {
  Postgres,
  Snowflake,
  BigQuery,
  Redshift,
  Databricks,
  DuckDB,
  SQLite,
  Kinetica,
  Db2,
};
