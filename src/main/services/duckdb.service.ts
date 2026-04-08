import { app } from 'electron';
import path from 'path';
import fs from 'fs-extra';
import { DuckDBInstance } from '@duckdb/node-api';
import {
  DuckDBStatus,
  DuckDBLockStatus,
  DuckDBMetadataPayload,
  DuckDBDiagnostics,
  DuckDBLeakInfo,
  DuckDBConnectionSample,
} from '../../types/backend';

const DB_FILENAME = 'main.duckdb';
const MAX_POOL_SIZE = 10;
const CONNECTION_TIMEOUT_MS = 5000;

interface PooledConnection {
  id: string;
  connection: any;
  inUse: boolean;
  acquiredAt?: number;
  acquiredBy?: string;
  refCount: number;
}

export default class DuckDBBootstrap {
  private static instance: DuckDBInstance | null = null;

  private static status: DuckDBStatus = 'missing';

  private static dbPath: string = '';

  private static pool: PooledConnection[] = [];

  private static waitQueue: Array<(connection: any) => void> = [];

  private static initializationPromise: Promise<void> | null = null;

  static async initialize(): Promise<void> {
    if (this.initializationPromise) return this.initializationPromise;

    this.initializationPromise = (async () => {
      try {
        this.status = 'initializing';
        const userDataPath = app.getPath('userData');
        this.dbPath = path.join(userDataPath, DB_FILENAME);

        // Ensure directory exists
        await fs.ensureDir(userDataPath);

        // Check if file exists
        const fileExists = await fs.pathExists(this.dbPath);
        if (!fileExists) {
          // It will be created by DuckDB
        }

        // Initialize DuckDB instance
        // Note: @duckdb/node-api might behave differently depending on version
        // We assume DuckDBInstance.create(path) works
        this.instance = await DuckDBInstance.create(this.dbPath);

        this.status = 'ready';
        // eslint-disable-next-line no-console
        console.log(`[DuckDB] Initialized at ${this.dbPath}`);
      } catch (error) {
        // eslint-disable-next-line no-console
        console.error('[DuckDB] Initialization failed:', error);

        try {
          // eslint-disable-next-line no-console
          console.log('[DuckDB] Falling back to in-memory database');
          this.instance = await DuckDBInstance.create(':memory:');
          this.status = 'fallback_memory';
          this.dbPath = ':memory:';
        } catch (fallbackError) {
          this.status = 'error';
          // eslint-disable-next-line no-console
          console.error('[DuckDB] Fallback failed:', fallbackError);
        }
      }
    })();

    return this.initializationPromise;
  }

  static async getConnection(purpose: string = 'unknown'): Promise<any> {
    await this.initialize();

    if (
      (this.status !== 'ready' && this.status !== 'fallback_memory') ||
      !this.instance
    ) {
      throw new Error(`DuckDB is not ready. Status: ${this.status}`);
    }

    // Simple pool management
    // 1. Try to find an existing idle connection
    let pooled = this.pool.find((p) => !p.inUse);

    if (!pooled) {
      // 2. If pool not full, create new connection
      if (this.pool.length < MAX_POOL_SIZE) {
        const connection = await this.instance.connect();
        pooled = {
          id: Math.random().toString(36).substring(7),
          connection,
          inUse: false,
          refCount: 0,
        };
        this.pool.push(pooled);
      } else {
        // 3. Wait for connection
        return new Promise((resolve, reject) => {
          let timeout: ReturnType<typeof setTimeout>;

          const resolveWrapper = (conn: any) => {
            clearTimeout(timeout);
            const p = this.pool.find((x) => x.connection === conn);
            if (p) {
              p.inUse = true;
              p.acquiredAt = Date.now();
              p.acquiredBy = purpose;
              p.refCount += 1;
            }
            resolve(conn);
          };

          timeout = setTimeout(() => {
            const index = this.waitQueue.indexOf(resolveWrapper);
            if (index > -1) {
              this.waitQueue.splice(index, 1);
              reject(new Error('DuckDB connection pool exhausted (timeout)'));
            }
          }, CONNECTION_TIMEOUT_MS);

          this.waitQueue.push(resolveWrapper);
        });
      }
    }

    pooled.inUse = true;
    pooled.acquiredAt = Date.now();
    pooled.acquiredBy = purpose;
    pooled.refCount += 1;

    return pooled.connection;
  }

  static async releaseConnection(connection: any): Promise<void> {
    const pooled = this.pool.find((p) => p.connection === connection);
    if (pooled) {
      // Check if there are waiters
      if (this.waitQueue.length > 0) {
        const next = this.waitQueue.shift();
        if (next) {
          // Pass connection directly to waiter
          // Waiter will update metadata
          next(connection);
          return;
        }
      }

      pooled.inUse = false;
      pooled.acquiredBy = undefined;
      pooled.acquiredAt = undefined;
    }
  }

  // Helper to run a block with a connection
  static async withConnection<T>(
    callback: (connection: any) => Promise<T>,
    purpose: string,
  ): Promise<T> {
    const connection = await this.getConnection(purpose);
    try {
      return await callback(connection);
    } finally {
      await this.releaseConnection(connection);
    }
  }

  static async getMetadata(): Promise<DuckDBMetadataPayload> {
    let sizeBytes = 0;
    let fileExists = false;
    try {
      if (this.dbPath && (await fs.pathExists(this.dbPath))) {
        const stats = await fs.stat(this.dbPath);
        sizeBytes = stats.size;
        fileExists = true;
      }
    } catch (e) {
      // ignore
    }

    const activeConnections = this.pool.filter((p) => p.inUse).length;

    // Get DuckDB version from package.json — no SQL query needed
    let duckdbVersion: string | undefined;
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const pkg = require('@duckdb/node-api/package.json');
      duckdbVersion = pkg.version as string;
    } catch {
      // not critical
    }

    // Determine lock status
    let lockStatus: DuckDBLockStatus = 'unknown';
    if (this.status === 'ready') {
      lockStatus = activeConnections > 0 ? 'active' : 'idle';
      if (activeConnections >= MAX_POOL_SIZE) {
        lockStatus = 'contended';
      }
    }

    return {
      path: this.dbPath,
      sizeBytes,
      sizeHumanReadable: this.formatBytes(sizeBytes),
      status: this.status,
      lockStatus,
      lastCheckedAt: new Date().toISOString(),
      initialized: this.status === 'ready',
      poolSize: this.pool.length,
      activeConnections,
      maxConnections: MAX_POOL_SIZE,
      fileExists,
      duckdbVersion,
    };
  }

  static async refreshMetadata(): Promise<DuckDBMetadataPayload> {
    return this.getMetadata();
  }

  static async reinitialize(options?: {
    dropExisting?: boolean;
  }): Promise<DuckDBMetadataPayload> {
    // Close all connections
    await this.shutdown();

    if (options?.dropExisting && this.dbPath) {
      try {
        await fs.remove(this.dbPath);
        // eslint-disable-next-line no-console
        console.log('[DuckDB] Dropped existing database file');
      } catch (e) {
        // eslint-disable-next-line no-console
        console.error('[DuckDB] Failed to delete database file:', e);
      }
    }

    this.initializationPromise = null;
    await this.initialize();
    return this.getMetadata();
  }

  static async diagnose(): Promise<DuckDBDiagnostics> {
    const metadata = await this.getMetadata();
    const now = Date.now();

    const leaks: DuckDBLeakInfo[] = this.pool
      .filter(
        (p) => p.inUse && p.acquiredAt && now - p.acquiredAt > 5 * 60 * 1000,
      ) // > 5 mins
      .map((p) => ({
        id: p.id,
        heldForMs: now - (p.acquiredAt || 0),
        acquiredBy: p.acquiredBy ? [p.acquiredBy] : [],
        acquiredAt: new Date(p.acquiredAt || 0).toISOString(),
      }));

    const connectionsSample: DuckDBConnectionSample[] = this.pool.map((p) => ({
      id: p.id,
      inUse: p.inUse,
      refCount: p.refCount,
      acquiredBy: p.acquiredBy ? [p.acquiredBy] : [],
      holdTimeMs: p.inUse && p.acquiredAt ? now - p.acquiredAt : 0,
    }));

    // Calculate average hold time (simplified, just current hold times)
    const activeHoldTimes = this.pool
      .filter((p) => p.inUse && p.acquiredAt)
      .map((p) => now - (p.acquiredAt || 0));

    const averageHoldTime =
      activeHoldTimes.length > 0
        ? activeHoldTimes.reduce((a, b) => a + b, 0) / activeHoldTimes.length
        : 0;

    return {
      metadata,
      leaks,
      pool: {
        activeConnections: this.pool.filter((p) => p.inUse).length,
        totalConnections: this.pool.length,
        maxConnections: MAX_POOL_SIZE,
        peakActive: 0, // Not tracked yet
        averageHoldTime,
      },
      connectionsSample,
    };
  }

  static async shutdown(): Promise<void> {
    // Close all connections
    // Note: DuckDB node api might not have explicit disconnect on connection object if it's just a handle
    // But we should close the instance
    this.pool = []; // Clear pool

    if (this.instance) {
      // this.instance.close(); // If close exists
      this.instance = null;
    }
    this.status = 'stopped';
  }

  private static formatBytes(bytes: number, decimals = 2): string {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / k ** i).toFixed(dm))} ${sizes[i]}`;
  }
}
