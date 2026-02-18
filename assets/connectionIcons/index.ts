import snowflake from './snowflake.png';
import bigquery from './bigquery.png';
import postgres from './postgresql.png';
import redshift from './redshift.png';
import databricks from './databricks.png';
import duckdb from './duckdb.png';
import ducklake from './ducklake.png';
import sqlite from './sqlite.png';
import mysql from './mysql.png';
import oracle from './oracle.png';
import db2 from './db2.png';
import mssql from './mssql.png';
import kinetica from './kinetica.png';
import googlecloud from './googlecloud.png';
import azureBlob from './azure_blob.png';
import s3Bucket from './s3_bucktet.png';
import minio from './minio.png';
import cloudflareR2 from './cloudflare_r2.png';
import backblazeB2 from './blackbaze.png';
import rustfs from './rustfs.png';
import openai from './openai.svg';
import ollama from './ollama.svg';
import google from './google.svg';
import anthropic from './anthropic.svg';
import file from './file.png';
import { SupportedConnectionTypes } from '../../src/types/backend';

type Image = Record<SupportedConnectionTypes, string>;

// Cloud storage specific images
export const cloudStorageImages = {
  gcs: googlecloud,
  aws: s3Bucket,
  s3: s3Bucket,
  azure: azureBlob,
  minio,
  'cloudflare-r2': cloudflareR2,
  'backblaze-b2': backblazeB2,
  rustfs,
};

// AI provider specific images
export const aiProviderImages = {
  openai,
  ollama,
  gemini: google,
  anthropic,
};

// Default fallback icon
export const defaultIcon = file;

// Database icons for DuckLake catalogs
export const databaseIcons = {
  duckdb,
  sqlite,
  postgresql: postgres,
};

const obj: { images: Image } = {
  images: {
    snowflake,
    bigquery,
    postgres,
    redshift,
    databricks,
    duckdb,
    ducklake,
    mysql,
    oracle,
    db2,
    mssql,
    kinetica,
    googlecloud,
  },
};

export default obj;
