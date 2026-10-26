import fs from 'fs';
import os from 'os';
import path from 'path';
import { ConnectionInput } from '../../../../src/types/backend';

const S = (type: string, field: string) => `FIXTURE-SECRET-${type}-${field}`;

export type Fixture = { label: string; conn: ConnectionInput };

export const FIXTURES: Record<string, Fixture[]> = {
  postgres: [
    {
      label: 'ssl off',
      conn: {
        type: 'postgres',
        name: 'pg_plain',
        host: 'pg.example.com',
        port: 5432,
        username: 'pg_user',
        password: S('postgres', 'password'),
        database: 'pgdb',
        schema: 'public',
      },
    },
    {
      label: 'ssl on, reject unauthorized false',
      conn: {
        type: 'postgres',
        name: 'pg_ssl',
        host: 'pg.example.com',
        port: 5432,
        username: 'pg_user',
        password: S('postgres', 'password'),
        database: 'pgdb',
        schema: 'public',
        ssl: true,
        sslRejectUnauthorized: false,
      },
    },
  ],
  redshift: [
    {
      label: 'ssl off',
      conn: {
        type: 'redshift',
        name: 'rs_plain',
        host: 'rs.example.com',
        port: 5439,
        username: 'rs_user',
        password: S('redshift', 'password'),
        database: 'rsdb',
        schema: 'public',
      },
    },
    {
      label: 'ssl on with sslrootcert',
      conn: {
        type: 'redshift',
        name: 'rs_ssl',
        host: 'rs.example.com',
        port: 5439,
        username: 'rs_user',
        password: S('redshift', 'password'),
        database: 'rsdb',
        schema: 'public',
        ssl: true,
        sslrootcert: '/certs/root.pem',
      },
    },
  ],
  snowflake: [
    {
      label: 'password with role',
      conn: {
        type: 'snowflake',
        name: 'sf_pw',
        account: 'acme-xy123',
        warehouse: 'WH',
        role: 'ANALYST',
        username: 'sf_user',
        password: S('snowflake', 'password'),
        database: 'SFDB',
        schema: 'PUBLIC',
        authMethod: 'password',
      },
    },
    {
      label: 'oauth_browser without role',
      conn: {
        type: 'snowflake',
        name: 'sf_oauth',
        account: 'acme-xy123',
        warehouse: 'WH',
        username: 'sf_user',
        password: '',
        database: 'SFDB',
        schema: 'PUBLIC',
        authMethod: 'oauth_browser',
      },
    },
  ],
  bigquery: [
    {
      label: 'service account, no location',
      conn: {
        type: 'bigquery',
        name: 'bq_plain',
        project: 'my-project',
        dataset: 'my_dataset',
        method: 'service-account',
        keyfile: S('bigquery', 'keyfile'),
        username: 'my-project',
        password: '',
        database: 'my-project',
        schema: 'my_dataset',
      },
    },
    {
      label: 'location and batch priority',
      conn: {
        type: 'bigquery',
        name: 'bq_loc',
        project: 'my-project',
        dataset: 'my_dataset',
        method: 'service-account',
        keyfile: S('bigquery', 'keyfile'),
        location: 'EU',
        priority: 'batch',
        username: 'my-project',
        password: '',
        database: 'my-project',
        schema: 'my_dataset',
      },
    },
  ],
  databricks: [
    {
      label: 'default',
      conn: {
        type: 'databricks',
        name: 'dbx',
        host: 'dbc.example.cloud.databricks.com',
        port: 443,
        httpPath: '/sql/1.0/warehouses/abc',
        token: S('databricks', 'token'),
        database: 'main',
        schema: 'default',
      },
    },
  ],
  duckdb: [
    {
      label: 'absolute path with short_database_path',
      conn: {
        type: 'duckdb',
        name: 'duck_short',
        database_path: '/data/warehouse.duckdb',
        short_database_path: 'warehouse.duckdb',
        database: 'warehouse',
        schema: 'main',
      },
    },
    {
      label: 'without short_database_path',
      conn: {
        type: 'duckdb',
        name: 'duck_noshort',
        database_path: '/data/warehouse.duckdb',
        database: 'warehouse',
        schema: 'main',
      } as unknown as ConnectionInput,
    },
  ],
  sqlite: [
    {
      label: 'file path',
      conn: {
        type: 'sqlite',
        name: 'lite',
        database_path: '/data/app.sqlite',
        short_database_path: 'app.sqlite',
        database: 'app',
        schema: 'main',
      },
    },
  ],
  kinetica: [
    {
      label: 'host and port',
      conn: {
        type: 'kinetica',
        name: 'kin_plain',
        host: 'kin.example.com',
        port: 9191,
        username: 'kin_user',
        password: S('kinetica', 'password'),
        database: 'kindb',
        schema: 'ki_home',
      },
    },
    {
      label: 'useSSL with bypassSslCertCheck',
      conn: {
        type: 'kinetica',
        name: 'kin_ssl',
        host: 'kin.example.com',
        port: 9191,
        username: 'kin_user',
        password: S('kinetica', 'password'),
        database: 'kindb',
        schema: 'ki_home',
        useSSL: true,
        bypassSslCertCheck: true,
      },
    },
  ],
  mysql: [
    {
      label: 'ssl on',
      conn: {
        type: 'mysql',
        name: 'my',
        host: 'mysql.example.com',
        port: 3306,
        username: 'my_user',
        password: S('mysql', 'password'),
        database: 'mydb',
        schema: 'mydb',
        ssl: true,
      },
    },
  ],
  oracle: [
    {
      label: 'basic',
      conn: {
        type: 'oracle',
        name: 'ora_basic',
        connectMode: 'basic',
        host: 'ora.example.com',
        port: 1521,
        serviceName: 'ORCLPDB1',
        username: 'ora_user',
        password: S('oracle', 'password'),
        database: 'ORCLPDB1',
        schema: 'ORA_USER',
      },
    },
    {
      label: 'basic with tls',
      conn: {
        type: 'oracle',
        name: 'ora_tls',
        connectMode: 'basic',
        host: 'ora.example.com',
        port: 2484,
        serviceName: 'ORCLPDB1',
        tls: true,
        username: 'ora_user',
        password: S('oracle', 'password'),
        database: 'ORCLPDB1',
        schema: 'ORA_USER',
      },
    },
    {
      label: 'connect string',
      conn: {
        type: 'oracle',
        name: 'ora_cs',
        connectMode: 'connectString',
        connectString: 'ora.example.com:1521/ORCLPDB1',
        username: 'ora_user',
        password: S('oracle', 'password'),
        database: 'ORCLPDB1',
        schema: 'ORA_USER',
      },
    },
    {
      label: 'wallet',
      conn: {
        type: 'oracle',
        name: 'ora_wallet',
        connectMode: 'wallet',
        connectString: 'mydb_high',
        walletDir: '/wallets/mydb',
        walletPassword: S('oracle', 'walletpassword'),
        username: 'ora_user',
        password: S('oracle', 'password'),
        database: 'mydb_high',
        schema: 'ORA_USER',
      },
    },
  ],
  ducklake: [
    {
      label: 'duckdb catalog, s3 storage',
      conn: {
        type: 'ducklake',
        name: 'dl_s3',
        instanceId: 'inst-s3',
        catalogType: 'duckdb',
        dataPath: 's3://bucket/lake',
      },
    },
    {
      label: 'sqlite catalog, local storage',
      conn: {
        type: 'ducklake',
        name: 'dl_local',
        instanceId: 'inst-local',
        catalogType: 'sqlite',
        dataPath: '/data/lake',
      },
    },
  ],
};

/** A saved row of a type the app no longer supports (Db2 was removed in #526). */
export const LEGACY_DB2 = {
  type: 'db2',
  name: 'old',
  host: 'db2.example.com',
  port: 50000,
  username: 'u',
  password: 'p',
  database: 'd',
  schema: 's',
} as unknown as ConnectionInput;

export const DBT_TYPES = [
  'postgres',
  'redshift',
  'snowflake',
  'bigquery',
  'databricks',
  'duckdb',
  'kinetica',
  'ducklake',
] as const;

export const ALL_TYPES = [
  ...DBT_TYPES,
  'sqlite',
  'mysql',
  'oracle',
] as const;

export const allFixtures = (types: readonly string[]) =>
  types.flatMap((t) =>
    FIXTURES[t].map((f) => ({ type: t, label: f.label, conn: f.conn })),
  );

const tempDirs: string[] = [];
export const makeTempProject = (): string => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'conn-char-'));
  tempDirs.push(dir);
  return dir;
};
export const cleanTempProjects = () => {
  tempDirs.splice(0).forEach((d) => fs.rmSync(d, { recursive: true, force: true }));
};
