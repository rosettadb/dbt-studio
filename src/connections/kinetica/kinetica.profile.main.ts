import { KineticaConnection } from '../../types/backend';

/** dbt-kinetica falls back to this schema when the profile omits one. */
export const DEFAULT_KINETICA_SCHEMA = 'ki_home';

/**
 * Profile output for the dbt-kinetica adapter
 * (https://github.com/rosettadb/kinetica-dbt-adapter).
 *
 * - `host` is the full head-node URL (scheme, host, optional port and path);
 *   the adapter has no separate `port` field. The Studio exports the
 *   pre-built URL as the `db-url-<connection>` environment variable.
 * - `database` is a label only (Kinetica has no databases) and is never
 *   rendered into SQL, so it is emitted only when the connection sets one.
 * - `timeout` is intentionally not derived from the connection's client
 *   timeout (milliseconds for the interactive GPUdb driver). The adapter's
 *   default is "no limit", which is the safer choice for long DDL. Users can
 *   add `timeout: <seconds>` to profiles.yml; partial updates preserve it.
 * - `disable_auto_discovery` stays on so connections work behind Docker,
 *   NAT and load balancers.
 */
export function buildKineticaProfileOutput(
  conn: KineticaConnection,
  envVar: (field: string) => string,
): Record<string, unknown> {
  return {
    type: 'kinetica',
    host: envVar('url'),
    user: envVar('user'),
    password: envVar('password'),
    schema: conn.schema ? envVar('schema') : DEFAULT_KINETICA_SCHEMA,
    threads: 4,
    ...(conn.database && { database: envVar('dbname') }),
    disable_auto_discovery: true,
    ...(conn.useSSL &&
      conn.bypassSslCertCheck && { skip_ssl_cert_verification: true }),
  };
}
