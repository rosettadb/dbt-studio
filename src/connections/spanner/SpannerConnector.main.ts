import SecureStorageService from '../../main/services/secureStorage.service';
import type { QueryResponseType, Table } from '../../types/backend';
import type { ConnectionInput } from '../registry.shared';
import {
  Connection,
  type QueryContext,
  type TestResult,
} from '../core/Connection.main';
import type { AgentHintContext } from '../core/agentHints.main';
import { spannerDescriptor, type SpannerConnection } from './spanner.shared';
import {
  isRawSpannerKey,
  spannerKeyName,
  validateSpannerEmulatorHost,
  validateSpannerIds,
  validateSpannerKeyJson,
} from './spanner.helpers.shared';
import { closeSpannerClients } from './spanner.client.main';
import {
  executeSpannerQuery,
  testSpannerConnection,
} from './spanner.query.main';
import SpannerExtractor from './spanner.extractor.main';

const AUTH_METHODS = ['service-account', 'adc', 'emulator'];

export class SpannerConnector extends Connection<SpannerConnection> {
  readonly descriptor = spannerDescriptor;

  readonly validatesOnSave = true;

  async validate(conn: SpannerConnection): Promise<void> {
    if (!AUTH_METHODS.includes(conn.authMethod))
      throw new Error('Choose a supported Spanner authentication method.');
    const idError = validateSpannerIds(conn);
    if (idError) throw new Error(idError);
    if (conn.authMethod === 'emulator') {
      if (!validateSpannerEmulatorHost(conn.emulatorHost || ''))
        throw new Error(
          'Enter an emulator host as host:port (for example localhost:9010).',
        );
      return;
    }
    if (conn.authMethod !== 'service-account') return;
    if (!conn.keyfile)
      throw new Error('Spanner service account key is required.');
    if (isRawSpannerKey(conn.keyfile)) {
      const keyError = validateSpannerKeyJson(conn.keyfile);
      if (keyError) throw new Error(keyError);
    }
  }

  // eslint-disable-next-line class-methods-use-this
  async test(conn: SpannerConnection): Promise<TestResult> {
    return testSpannerConnection(conn);
  }

  // eslint-disable-next-line class-methods-use-this
  async query(
    conn: SpannerConnection,
    sql: string,
    ctx: QueryContext,
  ): Promise<QueryResponseType> {
    return executeSpannerQuery(conn, sql, ctx.onCancelable);
  }

  // eslint-disable-next-line class-methods-use-this
  async extractSchema(conn: SpannerConnection): Promise<{ tables: Table[] }> {
    return new SpannerExtractor(conn).extractSchema();
  }

  // eslint-disable-next-line class-methods-use-this
  sameTarget(a: SpannerConnection, b: SpannerConnection): boolean {
    return (
      a.project === b.project &&
      a.instance === b.instance &&
      a.database === b.database &&
      a.authMethod === b.authMethod &&
      a.emulatorHost === b.emulatorHost &&
      a.keyfile === b.keyfile
    );
  }

  // eslint-disable-next-line class-methods-use-this
  nameHint(conn: SpannerConnection): string {
    return conn.database;
  }

  /** The client reads `db-spanner-<name>` itself, as Oracle reads its own secrets. */
  async resolveSecrets(conn: SpannerConnection): Promise<SpannerConnection> {
    return conn;
  }

  // eslint-disable-next-line class-methods-use-this
  agentHint(ctx: AgentHintContext): string {
    const dialects =
      'A Spanner database uses either GoogleSQL or the PostgreSQL dialect; tell which from the column types in the schema (INT64, FLOAT64, STRING, BYTES mean GoogleSQL; bigint, double precision, character varying mean PostgreSQL). GoogleSQL: quote identifiers with backticks, and there is no ILIKE (use LOWER(x) LIKE). PostgreSQL dialect: quote identifiers with double quotes; it is a subset of PostgreSQL.';
    const head =
      '\n\n## Dialect Specifics\nYou are connected to Google Cloud Spanner. ';
    // The notebooks agent is told that LIMIT/OFFSET are stripped, because the
    // UI pages the results.
    return ctx.agent === 'notebooks'
      ? `${head}${dialects} Do not add row limits; the UI handles pagination. Avoid full scans of large tables by filtering or aggregating.`
      : `${head}${dialects} Use LIMIT, and avoid full scans of large tables.`;
  }

  // eslint-disable-next-line class-methods-use-this
  prepareForStorage(conn: SpannerConnection): SpannerConnection {
    const { keyfile, ...rest } = conn;
    return {
      ...rest,
      username: conn.project,
      password: '',
      ...(conn.authMethod === 'service-account' &&
        keyfile && { keyfile: spannerKeyName(conn.name) }),
    };
  }

  // eslint-disable-next-line class-methods-use-this
  sanitizeStoredConnection(conn: SpannerConnection): void {
    if (isRawSpannerKey(conn.keyfile))
      // eslint-disable-next-line no-param-reassign
      conn.keyfile = spannerKeyName(conn.name);
  }

  // eslint-disable-next-line class-methods-use-this
  async onRename(
    previous: ConnectionInput,
    next: SpannerConnection,
  ): Promise<void> {
    if (previous.type !== 'spanner' || previous.name === next.name) return;
    // The key is stored by name; drop the one left under the old name.
    await SecureStorageService.deleteCredential(
      spannerKeyName(previous.name),
    ).catch(() => undefined);
  }

  // eslint-disable-next-line class-methods-use-this
  dispose(): void {
    closeSpannerClients();
  }
}
