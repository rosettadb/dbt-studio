import snowflake from './snowflake.png';
import bigquery from './bigquery.png';
import postgres from './postgresql.png';
import redshift from './redshift.png';
import databricks from './databricks.png';
import duckdb from './duckdb.png';
import mysql from './mysql.png';
import oracle from './oracle.png';
import db2 from './db2.png';
import mssql from './mssql.png';
import kinetica from './kinetica.png';
import googlecloud from './googlecloud.png';
import { SupportedConnectionTypes } from '../../src/types/backend';

type Image = Record<SupportedConnectionTypes, string>;

const obj: { images: Image } = {
  images: {
    snowflake,
    bigquery,
    postgres,
    redshift,
    databricks,
    duckdb,
    mysql,
    oracle,
    db2,
    mssql,
    kinetica,
    googlecloud,
  },
};

export default obj;
