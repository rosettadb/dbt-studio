import { Postgres } from './postgres';
import { Snowflake } from './snowflake';
import { BigQuery } from './bigquery';
import { Redshift } from './redshift';

export const Connections = { Postgres, Snowflake, BigQuery, Redshift };
