import { Postgres } from './postgres';
import { Snowflake } from './snowflake';
import { BigQuery } from './bigquery';
import { Redshift } from './redshift';
import { Databricks } from './databricks';
import { DuckDB } from './duckdb';
import { Kinetica } from './kinetica';
import { FabricSpark } from './fabricspark';

export const Connections = {
  Postgres,
  Snowflake,
  BigQuery,
  Redshift,
  Databricks,
  DuckDB,
  Kinetica,
  FabricSpark,
};
