import { Postgres } from './postgres';
import { Snowflake } from './snowflake';
import { BigQuery } from './bigquery';
import { Redshift } from './redshift';
import { Databricks } from './databricks';
import { DuckDB } from './duckdb';
import { SQLite } from './sqlite';
import { Kinetica } from './kinetica';
import { MySql } from './mysql';

export const Connections = {
  Postgres,
  Snowflake,
  BigQuery,
  Redshift,
  Databricks,
  DuckDB,
  SQLite,
  Kinetica,
  MySql,
};
