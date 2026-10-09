import { credentials as grpcCredentials } from '@grpc/grpc-js';
import { app } from 'electron';
import crypto from 'crypto';
import type { SpannerConnection } from '../../types/backend';
import SecureStorageService from '../services/secureStorage.service';

/** A cached client is closed after this long with no work running on it. */
const IDLE_CLOSE_MS = 10 * 60_000;

type CachedClient = {
  fingerprint: string;
  client: any;
  database: any;
  inUse: number;
  idleTimer?: ReturnType<typeof setTimeout>;
};
const clients = new Map<string, CachedClient>();

export type SpannerDatabaseLease = { database: any; release: () => void };

function closeClient(entry: CachedClient): void {
  if (entry.idleTimer) clearTimeout(entry.idleTimer);
  entry.client.close().catch(() => undefined);
}

function fingerprint(
  connection: SpannerConnection,
  credential?: string,
): string {
  return crypto
    .createHash('sha256')
    .update(
      JSON.stringify({
        project: connection.project,
        instance: connection.instance,
        database: connection.database,
        authMethod: connection.authMethod,
        emulatorHost: connection.emulatorHost,
        keyfile: connection.keyfile,
        credential: credential
          ? crypto.createHash('sha256').update(credential).digest('hex')
          : '',
      }),
    )
    .digest('hex');
}

async function getCachedClient(
  connection: SpannerConnection,
): Promise<CachedClient> {
  // Test sends the key JSON inline instead of saving it first. Such a key gets
  // a one-off client that is never cached and closes when Test releases it.
  const inlineKey =
    connection.authMethod === 'service-account' &&
    connection.keyfile?.trimStart().startsWith('{')
      ? connection.keyfile
      : undefined;
  let serviceAccountKey: string | undefined = inlineKey;
  if (connection.authMethod === 'service-account' && !inlineKey) {
    serviceAccountKey =
      (await SecureStorageService.getCredential(
        `db-spanner-${connection.name}`,
      )) || undefined;
    if (!serviceAccountKey)
      throw new Error(
        'Spanner service account key not found in secure storage.',
      );
  }
  const configHash = fingerprint(connection, serviceAccountKey);
  if (!inlineKey) {
    const cached = clients.get(connection.name);
    if (cached?.fingerprint === configHash) {
      return cached;
    }
    if (cached) {
      // The connection's settings changed: replace its client. A client that
      // is still running work is closed when that work releases it.
      clients.delete(connection.name);
      if (cached.inUse === 0) closeClient(cached);
    }
  }

  const options: Record<string, unknown> = {
    projectId: connection.project,
    // The SDK otherwise exports client metrics to Cloud Monitoring in the
    // connection's project. The switch is global inside the SDK, so every
    // client sets it.
    disableBuiltInMetrics: true,
  };
  if (connection.authMethod === 'service-account') {
    try {
      options.credentials = JSON.parse(serviceAccountKey!);
    } catch {
      throw new Error('Invalid Spanner service account key JSON.');
    }
    const credentials = options.credentials as Record<string, unknown>;
    if (
      credentials.type !== 'service_account' ||
      typeof credentials.client_email !== 'string' ||
      typeof credentials.private_key !== 'string'
    ) {
      throw new Error(
        'Spanner service account key must include client_email and private_key.',
      );
    }
  } else if (connection.authMethod === 'emulator') {
    const [servicePath, portText] = (
      connection.emulatorHost || 'localhost:9010'
    ).split(':');
    options.servicePath = servicePath;
    options.port = Number(portText);
    options.sslCreds = grpcCredentials.createInsecure();
    // Provide dummy credentials so the SDK skips GCP metadata lookup entirely.
    // Without this, @google-cloud/spanner fires an ADC discovery request that
    // fails with an unhandled MetadataLookupWarning and crashes the main process.
    options.credentials = {
      client_email: 'emulator@emulator.iam.gserviceaccount.com',
      private_key: '',
    };
  }

  // eslint-disable-next-line global-require
  const { Spanner } = require('@google-cloud/spanner') as {
    Spanner: new (config: any) => any;
  };
  const client = new Spanner(options);
  const database = client
    .instance(connection.instance)
    .database(connection.database);
  const entry: CachedClient = {
    fingerprint: configHash,
    client,
    database,
    inUse: 0,
  };
  if (!inlineKey) clients.set(connection.name, entry);
  return entry;
}

/**
 * Borrows the cached Spanner database for a connection; call `release` when
 * the work is done. A client closes after 10 minutes with no work running,
 * and is replaced automatically when the connection's settings change, so
 * callers never need to invalidate it.
 */
export async function acquireSpannerDatabase(
  connection: SpannerConnection,
): Promise<SpannerDatabaseLease> {
  const entry = await getCachedClient(connection);
  entry.inUse += 1;
  if (entry.idleTimer) clearTimeout(entry.idleTimer);
  let released = false;
  return {
    database: entry.database,
    release: () => {
      if (released) return;
      released = true;
      entry.inUse -= 1;
      if (entry.inUse > 0) return;
      if (clients.get(connection.name) !== entry) {
        closeClient(entry);
        return;
      }
      entry.idleTimer = setTimeout(() => {
        if (entry.inUse > 0 || clients.get(connection.name) !== entry) return;
        clients.delete(connection.name);
        closeClient(entry);
      }, IDLE_CLOSE_MS);
    },
  };
}

export async function closeSpannerClients(): Promise<void> {
  const all = [...clients.values()];
  clients.clear();
  await Promise.all(
    all.map((entry) => {
      if (entry.idleTimer) clearTimeout(entry.idleTimer);
      return entry.client.close().catch(() => undefined);
    }),
  );
}

app.on('before-quit', () => {
  closeSpannerClients().catch(() => undefined);
});
