import type React from 'react';
import {
  CONNECTION_TYPES,
  getDescriptor,
  type SupportedConnectionTypes,
} from './registry.shared';
import type { ConnectionFormProps, ConnectionUi } from './core/ui.renderer';
import { postgresUi } from './postgres/postgres.ui';
import { snowflakeUi } from './snowflake/snowflake.ui';
import { bigqueryUi } from './bigquery/bigquery.ui';
import { redshiftUi } from './redshift/redshift.ui';
import { databricksUi } from './databricks/databricks.ui';
import { duckdbUi } from './duckdb/duckdb.ui';
import { sqliteUi } from './sqlite/sqlite.ui';
import { kineticaUi } from './kinetica/kinetica.ui';
import { oracleUi } from './oracle/oracle.ui';
import { mysqlUi } from './mysql/mysql.ui';
import { ducklakeUi } from './ducklake/ducklake.ui';

export const connectionUis: {
  readonly [K in SupportedConnectionTypes]: ConnectionUi<any>;
} = {
  postgres: postgresUi,
  snowflake: snowflakeUi,
  bigquery: bigqueryUi,
  redshift: redshiftUi,
  databricks: databricksUi,
  duckdb: duckdbUi,
  sqlite: sqliteUi,
  kinetica: kineticaUi,
  oracle: oracleUi,
  mysql: mysqlUi,
  ducklake: ducklakeUi,
};

const isKnown = (type: string): type is SupportedConnectionTypes =>
  Object.prototype.hasOwnProperty.call(connectionUis, type);

export function getConnectionUi(
  type: string | null | undefined,
): ConnectionUi<any> | undefined {
  return type && isKnown(type) ? connectionUis[type] : undefined;
}

/** Add-screen tiles, in CONNECTION_TYPES order. */
export function creatableConnections(): ConnectionUi<any>[] {
  return CONNECTION_TYPES.map((type) => connectionUis[type]).filter(
    (ui) => !!ui.Form,
  );
}

/** The form for a type. Unknown types (and DuckLake) get the Postgres form, as today's `default:` case. */
export function connectionFormFor(
  type: string | undefined,
): React.ComponentType<ConnectionFormProps> {
  return (getConnectionUi(type)?.Form ??
    postgresUi.Form) as React.ComponentType<ConnectionFormProps>;
}

export const connectionLabel = (
  type: string | null | undefined,
): string | undefined => getDescriptor(type)?.displayName;

export const connectionIcon = (
  type: string | null | undefined,
): string | undefined => getConnectionUi(type)?.icon;

export const connectionAccentColor = (
  type: string | null | undefined,
): string => getConnectionUi(type)?.accentColor ?? '#666';

/** The fallback values useDbt / useRosettaDBT / useRosettaExtract use today (their `valueMap`). */
export function defaultEnvFieldValue(
  conn: Record<string, any>,
  field: string,
): string | undefined {
  const valueMap: Record<string, string | undefined> = {
    host: conn.host ? String(conn.host) : undefined,
    port: conn.port ? String(conn.port) : undefined,
    dbname: conn.database,
    schema: conn.schema,
    account: conn.account,
    warehouse: conn.warehouse,
    role: conn.role,
    project: conn.project,
    dataset: conn.dataset || conn.schema,
    httppath: conn.httpPath,
    catalog: conn.database,
  };
  return valueMap[field];
}

export function envFieldValueFor(
  conn: { type?: string } & Record<string, any>,
  field: string,
): string | undefined {
  const ui = getConnectionUi(conn.type);
  return ui?.envFieldValue?.(conn, field) ?? defaultEnvFieldValue(conn, field);
}
