import crypto from 'crypto';
import { credentials as grpcCredentials } from '@grpc/grpc-js';
import SecureStorageService from '../../main/services/secureStorage.service';
import type { SpannerConnection } from './spanner.shared';
import {
  DEFAULT_SPANNER_EMULATOR_HOST,
  isRawSpannerKey,
  spannerKeyName,
  validateSpannerKeyJson,
} from './spanner.helpers.shared';

export type SpannerDialect = 'GOOGLE_STANDARD_SQL' | 'POSTGRESQL';

/** A cached client closes after this long with no work running on it. */
const IDLE_CLOSE_MS = 10 * 60_000;

type CachedClient = {
  fingerprint: string;
  client: any;
  database: any;
  inUse: number;
  idleTimer?: ReturnType<typeof setTimeout>;
  dialect?: Promise<SpannerDialect>;
};

const clients = new Map<string, CachedClient>();

export type SpannerLease = {
  database: any;
  /** The database's dialect, looked up once per cached client. */
  dialect: () => Promise<SpannerDialect>;
  release: () => void;
};

/** Readable text for the common gRPC failures. Never includes key contents. */
export function spannerErrorText(error: any): string {
  const code = error?.code;
  if (code === 5 || code === 'NOT_FOUND')
    return 'Spanner instance or database was not found. Check the project, instance, and database IDs.';
  if (code === 7 || code === 'PERMISSION_DENIED')
    return 'Permission denied. The identity needs at least roles/spanner.databaseReader for queries.';
  if (code === 16 || code === 'UNAUTHENTICATED')
    return 'Spanner authentication failed. For ADC, run `gcloud auth application-default login`.';
  return String(error?.details || error?.message || 'Spanner request failed.');
}

const closeClient = (entry: CachedClient) => {
  if (entry.idleTimer) clearTimeout(entry.idleTimer);
  Promise.resolve(entry.client.close()).catch(() => undefined);
};

const sha256 = (value: string) =>
  crypto.createHash('sha256').update(value).digest('hex');

const fingerprintOf = (conn: SpannerConnection, key?: string) =>
  sha256(
    JSON.stringify({
      project: conn.project,
      instance: conn.instance,
      database: conn.database,
      authMethod: conn.authMethod,
      emulatorHost: conn.emulatorHost,
      key: key ? sha256(key) : '',
    }),
  );

async function readServiceAccountKey(conn: SpannerConnection): Promise<string> {
  // Test sends the key inline, before anything is saved.
  if (isRawSpannerKey(conn.keyfile)) return conn.keyfile as string;
  const stored = await SecureStorageService.getCredential(
    spannerKeyName(conn.name),
  );
  if (!stored)
    throw new Error(
      'Spanner service account key not found. Edit the connection and paste the key.',
    );
  return stored;
}

function clientOptions(conn: SpannerConnection, key?: string) {
  const options: Record<string, unknown> = {
    projectId: conn.project,
    // The SDK otherwise exports client metrics to Cloud Monitoring in the
    // connection's project. The switch is a static every new client overwrites,
    // so every client must set it.
    disableBuiltInMetrics: true,
  };
  if (conn.authMethod === 'service-account') {
    const problem = validateSpannerKeyJson(key as string);
    if (problem) throw new Error(problem);
    options.credentials = JSON.parse(key as string);
  } else if (conn.authMethod === 'emulator') {
    const [servicePath, port] = (
      conn.emulatorHost || DEFAULT_SPANNER_EMULATOR_HOST
    ).split(':');
    options.servicePath = servicePath;
    options.port = Number(port);
    options.sslCreds = grpcCredentials.createInsecure();
    // Placeholder credentials stop the SDK's ADC lookup, which otherwise
    // crashes the main process with an unhandled MetadataLookupWarning.
    options.credentials = {
      client_email: 'emulator@emulator.iam.gserviceaccount.com',
      private_key: '',
    };
  }
  return options;
}

async function getClient(conn: SpannerConnection): Promise<{
  entry: CachedClient;
  cached: boolean;
}> {
  const key =
    conn.authMethod === 'service-account'
      ? await readServiceAccountKey(conn)
      : undefined;
  const fingerprint = fingerprintOf(conn, key);
  const cached = !isRawSpannerKey(conn.keyfile);

  if (cached) {
    const existing = clients.get(conn.name);
    if (existing?.fingerprint === fingerprint)
      return { entry: existing, cached };
    if (existing) {
      // Settings changed: replace the client. One still running work closes
      // when that work releases it.
      clients.delete(conn.name);
      if (existing.inUse === 0) closeClient(existing);
    }
  }

  // eslint-disable-next-line global-require, @typescript-eslint/no-var-requires
  const { Spanner } = require('@google-cloud/spanner');
  const client = new Spanner(clientOptions(conn, key));
  const entry: CachedClient = {
    fingerprint,
    client,
    database: client.instance(conn.instance).database(conn.database),
    inUse: 0,
  };
  if (cached) clients.set(conn.name, entry);
  return { entry, cached };
}

async function lookUpDialect(database: any): Promise<SpannerDialect> {
  const dialect = await database.getDatabaseDialect();
  return String(dialect).includes('POSTGRESQL')
    ? 'POSTGRESQL'
    : 'GOOGLE_STANDARD_SQL';
}

/**
 * Borrows the database for a connection; call `release` when the work is done.
 * A client closes after 10 minutes with no work running, and is replaced when
 * the connection's settings change, so callers never invalidate it. A client
 * built from raw key JSON (Test) is never cached and closes on release.
 */
export async function acquireSpannerDatabase(
  conn: SpannerConnection,
): Promise<SpannerLease> {
  const { entry, cached } = await getClient(conn);
  entry.inUse += 1;
  if (entry.idleTimer) clearTimeout(entry.idleTimer);
  let released = false;
  return {
    database: entry.database,
    dialect: () => {
      if (!entry.dialect) {
        entry.dialect = lookUpDialect(entry.database);
        // A failed lookup must not stick to a cached client.
        entry.dialect.catch(() => {
          entry.dialect = undefined;
        });
      }
      return entry.dialect;
    },
    release: () => {
      if (released) return;
      released = true;
      entry.inUse -= 1;
      if (entry.inUse > 0) return;
      if (!cached || clients.get(conn.name) !== entry) {
        closeClient(entry);
        return;
      }
      entry.idleTimer = setTimeout(() => {
        if (entry.inUse > 0 || clients.get(conn.name) !== entry) return;
        clients.delete(conn.name);
        closeClient(entry);
      }, IDLE_CLOSE_MS);
    },
  };
}

export function closeSpannerClients(): void {
  const all = [...clients.values()];
  clients.clear();
  all.forEach(closeClient);
}
