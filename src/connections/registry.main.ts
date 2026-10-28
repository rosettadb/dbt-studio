import {
  descriptorFor,
  type ConnectionInput,
  type SupportedConnectionTypes,
} from './registry.shared';
import { Connection, type SecretMaterializer } from './core/Connection.main';
import { ConnectionDbt } from './core/ConnectionDbt.main';
import {
  defaultAgentHint,
  resolveDuckDbVersion,
  DUCKLAKE_EXTENSION_VERSION,
  type AgentName,
} from './core/agentHints.main';
import { PostgresConnector } from './postgres/PostgresConnector.main';
import { SnowflakeConnector } from './snowflake/SnowflakeConnector.main';
import { BigQueryConnector } from './bigquery/BigQueryConnector.main';
import { RedshiftConnector } from './redshift/RedshiftConnector.main';
import { DatabricksConnector } from './databricks/DatabricksConnector.main';
import { DuckDBConnector } from './duckdb/DuckDBConnector.main';
import { SQLiteConnector } from './sqlite/SQLiteConnector.main';
import { KineticaConnector } from './kinetica/KineticaConnector.main';
import { OracleConnector } from './oracle/OracleConnector.main';
import { MySqlConnector } from './mysql/MySqlConnector.main';
import { DuckLakeConnector } from './ducklake/DuckLakeConnector.main';

/** One instance per database. A missing key fails tsc. */
export const connectors: {
  readonly [K in SupportedConnectionTypes]: Connection<any>;
} = {
  postgres: new PostgresConnector(),
  snowflake: new SnowflakeConnector(),
  bigquery: new BigQueryConnector(),
  redshift: new RedshiftConnector(),
  databricks: new DatabricksConnector(),
  duckdb: new DuckDBConnector(),
  sqlite: new SQLiteConnector(),
  kinetica: new KineticaConnector(),
  oracle: new OracleConnector(),
  mysql: new MySqlConnector(),
  ducklake: new DuckLakeConnector(),
};

const isKnown = (type: string): type is SupportedConnectionTypes =>
  Object.prototype.hasOwnProperty.call(connectors, type);

/** Exact type. Unknown or removed types (a legacy 'db2' row) return undefined. */
export function getConnector(
  type: string | undefined,
): Connection<any> | undefined {
  return type && isKnown(type) ? connectors[type] : undefined;
}

/** Type or alias ('postgresql'). For the agents. */
export function findConnector(
  typeOrAlias: string | undefined,
): Connection<any> | undefined {
  const descriptor = descriptorFor(typeOrAlias);
  return descriptor ? getConnector(descriptor.type) : undefined;
}

export function isDbtConnector(
  connector: Connection<any> | undefined,
): connector is ConnectionDbt<any, any> {
  return connector instanceof ConnectionDbt;
}

export function getDbtConnector(
  type: string | undefined,
): ConnectionDbt<any, any> | undefined {
  const connector = getConnector(type);
  return isDbtConnector(connector) ? connector : undefined;
}

export function requireConnector(
  type: string | undefined,
  message: string,
): Connection<any> {
  const connector = getConnector(type);
  if (!connector) throw new Error(message);
  return connector;
}

export function requireDbtConnector(
  type: string | undefined,
  message: string,
): ConnectionDbt<any, any> {
  const connector = getDbtConnector(type);
  if (!connector) throw new Error(message);
  return connector;
}

/** The class that imports a profiles.yml output of this `type:`. Unique (tested). */
export function dbtConnectorForAdapter(
  adapterType: string,
): ConnectionDbt<any, any> | undefined {
  return Object.values(connectors).find(
    (c): c is ConnectionDbt<any, any> =>
      isDbtConnector(c) && c.dbtAdapterType === adapterType,
  );
}

/** The agents' "## Dialect Specifics" block. */
export function agentHintFor(type: string, agent: AgentName): string {
  const ctx = {
    agent,
    requestedType: type,
    duckdbVersion: resolveDuckDbVersion(),
    ducklakeVersion: DUCKLAKE_EXTENSION_VERSION,
  };
  return findConnector(type)?.agentHint(ctx) ?? defaultAgentHint(type);
}

/** setConnectionEnvVariable: a secret written to a file instead of process.env. */
export function findSecretMaterializer(
  envKey: string,
):
  | { materialize: SecretMaterializer['materialize']; connectionName: string }
  | undefined {
  const match = Object.values(connectors)
    .flatMap((connector) => connector.secretMaterializers)
    .find((m) => envKey.startsWith(m.prefix));
  return match
    ? {
        materialize: match.materialize,
        connectionName: envKey.slice(match.prefix.length),
      }
    : undefined;
}

/** Replaces sanitizeBigQueryKeyfile at every database.json write. Same signature. */
export function sanitizeForStorage<
  T extends { connection?: { type?: string } },
>(item: T): T {
  const { connection } = item;
  if (connection) {
    getConnector(connection.type)?.sanitizeStoredConnection(
      connection as ConnectionInput,
    );
  }
  return item;
}

export function disposeConnectors(): void {
  Object.values(connectors).forEach((connector) => connector.dispose());
}
