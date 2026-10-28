import fs from 'fs';
import os from 'os';
import path from 'path';
import { v4 as uuidV4 } from 'uuid';

/**
 * Raw BigQuery service-account JSON must never be persisted to database.json
 * — only the secure-storage key name it was materialized under. This was
 * previously duplicated ad hoc in four separate call sites; centralized here
 * so there's exactly one place to fix if the key-naming scheme ever changes.
 */
export function sanitizeBigQueryKeyfile<
  T extends {
    connection?: { type?: string; keyfile?: string; name?: string };
  },
>(item: T): T {
  const { connection } = item;
  if (
    connection &&
    connection.type === 'bigquery' &&
    connection.keyfile &&
    connection.keyfile.startsWith('{')
  ) {
    connection.keyfile = `db-bigquery-${connection.name}`;
  }
  return item;
}

/** App-lifetime BigQuery service-account key files (moved from ConnectorsService). */
export class BigQueryKeyFiles {
  private static readonly bigQueryKeyFiles = new Map<string, string>();

  private static isBigQueryCleanupRegistered = false;

  private static registerBigQueryCleanup(): void {
    if (this.isBigQueryCleanupRegistered) return;
    this.isBigQueryCleanupRegistered = true;

    process.once('exit', () => this.cleanupBigQueryKeyFiles());

    const cleanupAndExit = (exitCode: number): void => {
      this.cleanupBigQueryKeyFiles();
      process.exitCode = exitCode;
      setImmediate(() => process.exit(exitCode));
    };

    process.once('SIGINT', () => cleanupAndExit(130));
    process.once('SIGTERM', () => cleanupAndExit(143));
  }

  static async materializeBigQueryServiceAccount(
    connectionName: string,
    value: string,
  ): Promise<void> {
    let credentials: { client_email?: unknown };
    try {
      credentials = JSON.parse(value);
    } catch {
      throw new Error('Invalid BigQuery service account key JSON format.');
    }

    if (
      typeof credentials.client_email !== 'string' ||
      !credentials.client_email.trim()
    ) {
      throw new Error('BigQuery service account key is missing client_email.');
    }

    const key = `db-bigquery-${connectionName}`;
    this.registerBigQueryCleanup();
    const tempKeyPath = path.join(
      os.tmpdir(),
      `rosetta-bigquery-${uuidV4()}.json`,
    );
    await fs.promises.writeFile(tempKeyPath, value, {
      encoding: 'utf8',
      mode: 0o600,
    });

    const previousKeyPath = this.bigQueryKeyFiles.get(key);
    this.bigQueryKeyFiles.set(key, tempKeyPath);
    process.env[key] = tempKeyPath;
    process.env[`db-bigquery-email-${connectionName}`] =
      credentials.client_email;

    if (previousKeyPath) {
      await fs.promises.rm(previousKeyPath, { force: true });
    }
  }

  static cleanupBigQueryKeyFiles(): void {
    const keyFiles = Array.from(this.bigQueryKeyFiles.entries());
    this.bigQueryKeyFiles.clear();

    keyFiles.forEach(([key, keyPath]) => {
      if (process.env[key] === keyPath) delete process.env[key];
      const connectionName = key.slice('db-bigquery-'.length);
      delete process.env[`db-bigquery-email-${connectionName}`];
      try {
        fs.rmSync(keyPath, { force: true });
      } catch {
        // Continue removing the remaining materialized credentials.
      }
    });
  }
}
