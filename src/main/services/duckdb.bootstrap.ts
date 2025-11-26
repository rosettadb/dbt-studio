/**
 * DuckDB Bootstrap Module
 *
 * Responsible for initializing and managing the persistent main.duckdb database.
 * This module provides a singleton DuckDB instance that is shared across the application.
 *
 * Architecture:
 * - Single persistent database file: main.duckdb
 * - Connection pooling for concurrent operations
 * - Automatic extension loading (ducklake, httpfs, azure, json, excel, avro)
 * - Graceful shutdown with cleanup
 *
 * Usage:
 * - Call DuckDBBootstrap.initialize() during app startup
 * - Use DuckDBBootstrap.getConnection() to acquire connections
 * - Call DuckDBBootstrap.shutdown() during app shutdown
 */

import { app } from 'electron';
import path from 'path';
import fs from 'fs-extra';
import { DuckDBInstance } from '@duckdb/node-api';
import type {
  DuckDBDiagnostics,
  DuckDBLockStatus,
  DuckDBMetadataPayload,
  DuckDBStatus,
} from '../../types/backend';

interface ConnectionInfo {
  id: string;
  connection: any;
  acquiredAt: Date;
  releasedAt: Date | null;
  inUse: boolean;
  refCount: number;
  acquiredBy: string[];
  totalAcquisitions: number;
}

interface ConnectionMetrics {
  totalAcquisitions: number;
  totalReleases: number;
  currentActive: number;
  peakActive: number;
  leakedConnections: number;
  averageHoldTime: number;
}

type DuckDBDatabaseRow = { database_name: string } | [string];

export class DuckDBBootstrap {
  private static instance: any = null;

  private static dbPath: string = '';

  private static connections: ConnectionInfo[] = [];

  private static initialized = false;

  private static connectionIdCounter = 0;

  // Configuration
  private static maxConnections = 50; // Increased to support multiple DuckLake instances

  // Metrics for leak detection
  private static metrics: ConnectionMetrics = {
    totalAcquisitions: 0,
    totalReleases: 0,
    currentActive: 0,
    peakActive: 0,
    leakedConnections: 0,
    averageHoldTime: 0,
  };

  // Leak detection threshold (connections held > 5 minutes)
  private static leakThresholdMs = 5 * 60 * 1000;

  private static lastMetadataCheck: Date | null = null;

  /**
   * Initialize the persistent DuckDB database
   * Creates the database file if it doesn't exist and loads required extensions
   */
  static async initialize(): Promise<void> {
    if (this.initialized) {
      // eslint-disable-next-line no-console
      console.log('[DuckDB] Already initialized');
      return;
    }

    try {
      const startTime = Date.now();

      // Resolve database path in userData directory
      this.dbPath = path.join(app.getPath('userData'), 'duckdb', 'main.duckdb');

      // Ensure directory exists
      await fs.ensureDir(path.dirname(this.dbPath));

      // Check if database exists
      const dbExists = await fs.pathExists(this.dbPath);
      if (dbExists) {
        const stats = await fs.stat(this.dbPath);
        // eslint-disable-next-line no-console
        console.log(
          `[DuckDB] Existing database found (${this.formatBytes(stats.size)})`,
        );
      } else {
        // eslint-disable-next-line no-console
        console.log('[DuckDB] Creating new database...');
      }

      // Create DuckDB instance
      this.instance = await DuckDBInstance.create(this.dbPath);

      // Create initial connection for setup
      const setupConnection = await this.instance.connect();

      // Load extensions
      await this.loadExtensions(setupConnection);

      // Seed default schema if needed
      if (!dbExists) {
        await this.seedDefaultSchema(setupConnection);
      }

      // Note: Setup connection will be garbage collected
      // Node API connections don't require explicit close

      // Create connection pool
      await this.initializeConnectionPool();

      const initTime = Date.now() - startTime;
      // eslint-disable-next-line no-console
      console.log(`[DuckDB] Initialization complete in ${initTime}ms`);
      // eslint-disable-next-line no-console
      console.log(
        `[DuckDB] Connection pool: ${this.connections.length}/${this.maxConnections}`,
      );

      this.initialized = true;
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('[DuckDB] Failed to initialize:', error);
      throw error;
    }
  }

  /**
   * Load required DuckDB extensions
   */
  private static async loadExtensions(connection: any): Promise<void> {
    const extensions = [
      'ducklake', // DuckLake support
      'httpfs', // HTTP/S3 file system
      'azure', // Azure Blob Storage
      'json', // JSON support
      'parquet', // Parquet support (usually built-in)
    ];

    await extensions.reduce(async (previous, ext) => {
      await previous;
      try {
        // Try to install if not already installed
        await connection.run(`INSTALL ${ext};`);
        // Load the extension
        await connection.run(`LOAD ${ext};`);
      } catch (error) {
        // Some extensions might already be installed or built-in
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        // eslint-disable-next-line no-console
        console.warn(
          `[DuckDB] Extension ${ext} may already be loaded:`,
          errorMessage,
        );
      }

      return Promise.resolve();
    }, Promise.resolve());
  }

  /**
   * Seed default schema for new databases
   */
  private static async seedDefaultSchema(connection: any): Promise<void> {
    try {
      // Create metadata schema for tracking
      await connection.run(`
        CREATE SCHEMA IF NOT EXISTS metadata;
      `);

      // Create table to track database metadata
      await connection.run(`
        CREATE TABLE IF NOT EXISTS metadata.db_info (
          key VARCHAR PRIMARY KEY,
          value VARCHAR,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
      `);

      // Insert initial metadata
      await connection.run(`
        INSERT INTO metadata.db_info (key, value) VALUES
          ('version', '1.0.0'),
          ('created_at', CURRENT_TIMESTAMP::VARCHAR),
          ('purpose', 'Rosetta DBT Studio main database');
      `);
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('[DuckDB] Failed to seed schema:', error);
      // Non-fatal error - database can still function
    }
  }

  /**
   * Initialize connection pool
   */
  private static async initializeConnectionPool(): Promise<void> {
    // Create initial connections (start with 3)
    const initialPoolSize = Math.min(3, this.maxConnections);

    const baseCounter = this.connectionIdCounter;
    const newConnections = await Promise.all(
      Array.from({ length: initialPoolSize }, async (_, index) => {
        const connection = await this.instance.connect();
        return {
          id: `conn-${baseCounter + index + 1}`,
          connection,
          acquiredAt: new Date(),
          releasedAt: null,
          inUse: false,
          refCount: 0,
          acquiredBy: [],
          totalAcquisitions: 0,
        } as ConnectionInfo;
      }),
    );

    this.connectionIdCounter += initialPoolSize;
    this.connections.push(...newConnections);
  }

  /**
   * Get a connection from the pool with reference counting
   * Creates a new connection if pool is not exhausted
   */
  static async getConnection(acquiredBy = 'unknown'): Promise<any> {
    if (!this.initialized) {
      throw new Error('[DuckDB] Not initialized. Call initialize() first.');
    }

    // Find available connection
    const available = this.connections.find((c) => !c.inUse);

    if (available) {
      available.inUse = true;
      available.acquiredAt = new Date();
      available.refCount += 1;
      available.totalAcquisitions += 1;
      available.acquiredBy.push(acquiredBy);

      // Update metrics
      this.metrics.totalAcquisitions += 1;
      this.metrics.currentActive += 1;
      if (this.metrics.currentActive > this.metrics.peakActive) {
        this.metrics.peakActive = this.metrics.currentActive;
      }
      return available.connection;
    }

    // Create new connection if under limit
    if (this.connections.length < this.maxConnections) {
      const connection = await this.instance.connect();
      const connInfo: ConnectionInfo = {
        id: `conn-${this.connectionIdCounter + 1}`,
        connection,
        acquiredAt: new Date(),
        releasedAt: null,
        inUse: true,
        refCount: 1,
        acquiredBy: [acquiredBy],
        totalAcquisitions: 1,
      };
      this.connectionIdCounter += 1;
      this.connections.push(connInfo);

      // Update metrics
      this.metrics.totalAcquisitions += 1;
      this.metrics.currentActive += 1;
      if (this.metrics.currentActive > this.metrics.peakActive) {
        this.metrics.peakActive = this.metrics.currentActive;
      }

      return connection;
    }

    return this.waitForConnection(acquiredBy);
  }

  /**
   * Release a connection back to the pool with metrics tracking
   */
  static releaseConnection(connection: any, releasedBy = 'unknown'): void {
    const connInfo = this.connections.find((c) => c.connection === connection);

    if (connInfo) {
      connInfo.inUse = false;
      connInfo.releasedAt = new Date();

      // Calculate hold time
      const holdTime =
        connInfo.releasedAt.getTime() - connInfo.acquiredAt.getTime();

      // Update average hold time
      const totalHoldTime =
        this.metrics.averageHoldTime * this.metrics.totalReleases + holdTime;
      this.metrics.totalReleases += 1;
      this.metrics.averageHoldTime = totalHoldTime / this.metrics.totalReleases;
      this.metrics.currentActive -= 1;

      // Remove from acquiredBy list
      const index = connInfo.acquiredBy.indexOf(releasedBy);
      if (index > -1) {
        connInfo.acquiredBy.splice(index, 1);
      }

      // Check for potential leaks (connection held > threshold)
      if (holdTime > this.leakThresholdMs) {
        // eslint-disable-next-line no-console
        console.warn(
          `[DuckDB] ⚠️  Potential leak detected: Connection ${connInfo.id} held for ${Math.round(holdTime / 1000)}s by ${releasedBy}`,
        );
        this.metrics.leakedConnections += 1;
      }
    } else {
      // eslint-disable-next-line no-console
      console.warn(
        `[DuckDB] Attempted to release unknown connection by ${releasedBy}`,
      );
    }
  }

  /**
   * Wait for an available connection (with timeout)
   */
  private static waitForConnection(
    acquiredBy = 'unknown',
    timeoutMs = 30000,
  ): Promise<any> {
    const startTime = Date.now();

    return new Promise((resolve, reject) => {
      const attemptAcquire = (): void => {
        const available = this.connections.find((c) => !c.inUse);

        if (available) {
          available.inUse = true;
          available.acquiredAt = new Date();
          available.refCount += 1;
          available.totalAcquisitions += 1;
          available.acquiredBy.push(acquiredBy);

          // Update metrics
          this.metrics.totalAcquisitions += 1;
          this.metrics.currentActive += 1;
          if (this.metrics.currentActive > this.metrics.peakActive) {
            this.metrics.peakActive = this.metrics.currentActive;
          }
          resolve(available.connection);
          return;
        }

        if (Date.now() - startTime >= timeoutMs) {
          this.logPoolStatus();
          reject(
            new Error(
              `[DuckDB] Connection pool timeout - no connections available after ${timeoutMs}ms`,
            ),
          );
          return;
        }

        setTimeout(attemptAcquire, 100);
      };

      attemptAcquire();
    });
  }

  /**
   * Execute a function with an automatically managed connection
   * Ensures connection is always released, even if an error occurs
   */
  static async withConnection<T>(
    fn: (connection: any) => Promise<T>,
    acquiredBy = 'withConnection',
  ): Promise<T> {
    const connection = await this.getConnection(acquiredBy);

    try {
      return await fn(connection);
    } finally {
      this.releaseConnection(connection, acquiredBy);
    }
  }

  /**
   * Detect and report potential connection leaks
   * Returns list of connections held longer than threshold
   */
  static detectLeaks(): Array<{
    id: string;
    heldFor: number;
    acquiredBy: string[];
    acquiredAt: Date;
  }> {
    const now = Date.now();
    const leaks = this.connections
      .filter(
        (c) => c.inUse && now - c.acquiredAt.getTime() > this.leakThresholdMs,
      )
      .map((c) => ({
        id: c.id,
        heldFor: now - c.acquiredAt.getTime(),
        acquiredBy: [...c.acquiredBy],
        acquiredAt: c.acquiredAt,
      }));

    if (leaks.length > 0) {
      // eslint-disable-next-line no-console
      console.warn(`[DuckDB] ⚠️  ${leaks.length} potential leak(s) detected:`);
      leaks.forEach((leak) => {
        // eslint-disable-next-line no-console
        console.warn(
          `  - ${leak.id}: held for ${Math.round(leak.heldFor / 1000)}s by ${leak.acquiredBy.join(', ')}`,
        );
      });
    }

    return leaks;
  }

  /**
   * Get connection pool metrics
   */
  static getMetrics(): ConnectionMetrics {
    return { ...this.metrics };
  }

  /**
   * Get current pool status string
   */
  private static getPoolStatus(): string {
    const inUse = this.connections.filter((c) => c.inUse).length;
    return `${inUse}/${this.connections.length} in use`;
  }

  /**
   * Log detailed pool status for debugging
   */
  static logPoolStatus(): void {
    // eslint-disable-next-line no-console
    console.log('[DuckDB] === Connection Pool Status ===');
    // eslint-disable-next-line no-console
    console.log(
      `[DuckDB] Total connections: ${this.connections.length}/${this.maxConnections}`,
    );
    // eslint-disable-next-line no-console
    console.log(
      `[DuckDB] In use: ${this.connections.filter((c) => c.inUse).length}`,
    );
    // eslint-disable-next-line no-console
    console.log(
      `[DuckDB] Available: ${this.connections.filter((c) => !c.inUse).length}`,
    );
    // eslint-disable-next-line no-console
    console.log('[DuckDB] Connections:');

    this.connections.forEach((conn, index) => {
      const status = conn.inUse ? '🔴 IN USE' : '🟢 FREE';
      const acquiredBy =
        conn.acquiredBy.length > 0
          ? conn.acquiredBy[conn.acquiredBy.length - 1]
          : 'none';
      const holdTime =
        conn.inUse && conn.acquiredAt
          ? `${Math.round((Date.now() - conn.acquiredAt.getTime()) / 1000)}s`
          : 'n/a';

      // eslint-disable-next-line no-console
      console.log(
        `[DuckDB]   ${index + 1}. ${conn.id} ${status} - by: ${acquiredBy}, hold: ${holdTime}, ref: ${conn.refCount}`,
      );
    });

    // eslint-disable-next-line no-console
    console.log('[DuckDB] ===========================');
  }

  /**
   * Get database metadata
   */
  static getMetadata(): DuckDBMetadataPayload {
    const now = new Date();
    let sizeBytes = 0;
    let sizeHumanReadable = '0 Bytes';
    let fileExists = false;

    if (this.dbPath) {
      try {
        const stats = fs.statSync(this.dbPath);
        if (stats.isFile()) {
          sizeBytes = stats.size;
          sizeHumanReadable = this.formatBytes(stats.size);
          fileExists = true;
        }
      } catch (error) {
        fileExists = false;
      }
    }

    const poolSize = this.connections.length;
    const activeConnections = this.connections.filter((c) => c.inUse).length;
    const status = this.determineStatus(fileExists);
    const lockStatus = this.determineLockStatus(activeConnections, poolSize);
    this.lastMetadataCheck = now;

    return {
      path: this.dbPath,
      sizeBytes,
      sizeHumanReadable,
      status,
      lockStatus,
      lastCheckedAt: now.toISOString(),
      initialized: this.initialized,
      poolSize,
      activeConnections,
      maxConnections: this.maxConnections,
      fileExists,
    };
  }

  static async refreshMetadata(): Promise<DuckDBMetadataPayload> {
    return this.getMetadata();
  }

  static async reinitialize(options?: {
    dropExisting?: boolean;
  }): Promise<DuckDBMetadataPayload> {
    if (this.initialized) {
      await this.shutdown();
    }

    if (options?.dropExisting && this.dbPath) {
      try {
        await fs.remove(this.dbPath);
      } catch (error) {
        // eslint-disable-next-line no-console
        console.warn(
          '[DuckDB] Failed to remove existing database during reinit:',
          error,
        );
      }
    }

    await this.initialize();
    return this.getMetadata();
  }

  static async diagnose(): Promise<DuckDBDiagnostics> {
    const metadata = this.getMetadata();
    const leaks = this.detectLeaks().map((leak) => ({
      id: leak.id,
      heldForMs: leak.heldFor,
      acquiredBy: leak.acquiredBy,
      acquiredAt: leak.acquiredAt.toISOString(),
    }));

    const pool = {
      activeConnections: this.metrics.currentActive,
      totalConnections: this.connections.length,
      maxConnections: this.maxConnections,
      peakActive: this.metrics.peakActive,
      averageHoldTime: Math.round(this.metrics.averageHoldTime),
    };

    const connectionsSample = this.connections.slice(0, 10).map((conn) => {
      let holdTimeMs = 0;
      if (conn.inUse) {
        holdTimeMs = Date.now() - conn.acquiredAt.getTime();
      } else if (conn.releasedAt && conn.acquiredAt) {
        holdTimeMs = conn.releasedAt.getTime() - conn.acquiredAt.getTime();
      }

      return {
        id: conn.id,
        inUse: conn.inUse,
        refCount: conn.refCount,
        acquiredBy: [...conn.acquiredBy],
        holdTimeMs,
      };
    });

    return { metadata, leaks, pool, connectionsSample };
  }

  private static determineStatus(fileExists: boolean): DuckDBStatus {
    if (this.initialized && fileExists) {
      return 'ready';
    }

    if (!fileExists) {
      return this.initialized ? 'error' : 'missing';
    }

    return 'stopped';
  }

  private static determineLockStatus(
    activeConnections: number,
    poolSize: number,
  ): DuckDBLockStatus {
    if (activeConnections === 0) {
      return 'idle';
    }

    const denominator = poolSize > 0 ? poolSize : this.maxConnections;
    const utilization = denominator === 0 ? 0 : activeConnections / denominator;

    if (utilization >= 0.8) {
      return 'contended';
    }

    return 'active';
  }

  /**
   * Detach all DuckLake catalogs before shutdown
   * This ensures clean shutdown without database locks
   *
   * Phase 2 Change: Properly detach all attached catalogs before closing DuckDB
   */
  static async detachAllCatalogs(): Promise<void> {
    try {
      // Get a connection to run DETACH commands
      // Use a short timeout since we're shutting down
      const connection = await this.getConnection('shutdown-detach');

      try {
        const switchToMainDatabase = async (): Promise<boolean> => {
          const commands = ['USE main', 'USE main.main'];
          // Some environments may still keep "main" as the active catalog;
          // iterate through a couple of safe options before giving up.
          const tryCommand = async (index: number): Promise<boolean> => {
            if (index >= commands.length) {
              return false;
            }

            try {
              await connection.run(commands[index]);
              return true;
            } catch (noop) {
              return tryCommand(index + 1);
            }
          };

          const switched = await tryCommand(0);

          if (switched) {
            return true;
          }

          try {
            await connection.run('USE memory');
            return true;
          } catch (noop) {
            // eslint-disable-next-line no-console
            console.warn(
              '[DuckDB] Unable to switch away from attached catalog before detaching',
            );
          }

          return false;
        };

        // Get list of all attached databases (excluding system databases)
        const result = await connection.run(`
          SELECT database_name
          FROM duckdb_databases()
          WHERE database_name NOT IN ('memory', 'system', 'temp')
            AND database_name NOT LIKE 'pg_temp_%'
        `);
        const databases = (await result.getRows()) as DuckDBDatabaseRow[];

        if (databases.length === 0) {
          this.releaseConnection(connection, 'shutdown-detach');
          return;
        }

        // Switch to main database first (can't detach current database)
        // Note: Using 'main' instead of 'memory' because we're using persistent DuckDB
        await switchToMainDatabase();

        const detachCatalog = async (dbName: string): Promise<boolean> => {
          try {
            const escapedDbName = dbName.replace(/"/g, '""');
            const detachQuery = `DETACH "${escapedDbName}"`;

            const runDetach = async (): Promise<void> => {
              await connection.run(detachQuery);
            };

            try {
              await runDetach();
              return true;
            } catch (detachError) {
              const errorMessage =
                detachError instanceof Error
                  ? detachError.message
                  : String(detachError);

              if (errorMessage.includes('default database')) {
                const switched = await switchToMainDatabase();
                if (switched) {
                  try {
                    await runDetach();
                    return true;
                  } catch (retryError) {
                    const retryMessage =
                      retryError instanceof Error
                        ? retryError.message
                        : String(retryError);
                    // eslint-disable-next-line no-console
                    console.warn(
                      `[DuckDB] Failed to detach ${dbName} after retry: ${retryMessage}`,
                    );
                    return false;
                  }
                }
              }

              // eslint-disable-next-line no-console
              console.warn(
                `[DuckDB] Failed to detach ${dbName}: ${errorMessage}`,
              );
              return false;
            }
          } catch (error) {
            const errorMessage =
              error instanceof Error ? error.message : String(error);
            // eslint-disable-next-line no-console
            console.warn(
              `[DuckDB] Failed to detach ${dbName}: ${errorMessage}`,
            );
            return false;
          }
        };

        // Detach each database sequentially without using iterators
        let detachedCount = 0;
        await databases.reduce<Promise<void>>(async (previous, db) => {
          await previous;
          const dbName = Array.isArray(db) ? db[0] : db?.database_name;

          if (!dbName || dbName === 'main') {
            return;
          }

          const detached = await detachCatalog(dbName);
          if (detached) {
            detachedCount += 1;
          }
        }, Promise.resolve());

        // eslint-disable-next-line no-console
        console.log(
          `[DuckDB] Detached ${detachedCount}/${databases.length} catalog(s)`,
        );
      } finally {
        // Always release the connection
        this.releaseConnection(connection, 'shutdown-detach');
      }
    } catch (error) {
      // Non-fatal error - log and continue with shutdown
      // eslint-disable-next-line no-console
      console.error('[DuckDB] Error during catalog detachment:', error);
      // eslint-disable-next-line no-console
      console.log(
        '[DuckDB] Continuing with shutdown despite detachment errors',
      );
    }
  }

  /**
   * Shutdown and cleanup
   * Closes all connections and the database instance
   *
   * Phase 2 Change: Now detaches all DuckLake catalogs before closing connections
   */
  static async shutdown(): Promise<void> {
    if (!this.initialized) {
      return;
    }

    try {
      // Step 1: Detach all DuckLake catalogs to prevent locks
      await this.detachAllCatalogs();

      // Step 2: Close all connections
      await Promise.all(
        this.connections.map(async (connInfo) => {
          try {
            // Use disconnectSync() for @duckdb/node-api
            if (connInfo.connection) {
              if (typeof connInfo.connection.disconnectSync === 'function') {
                connInfo.connection.disconnectSync();
              } else if (typeof connInfo.connection.closeSync === 'function') {
                connInfo.connection.closeSync();
              } else if (typeof connInfo.connection.close === 'function') {
                await connInfo.connection.close();
              }
            }
          } catch (error) {
            // eslint-disable-next-line no-console
            console.error('[DuckDB] Error disconnecting connection:', error);
          }
        }),
      );
      this.connections = [];

      // Step 3: Close database instance
      if (this.instance) {
        try {
          if (typeof this.instance.close === 'function') {
            await this.instance.close();
          } else if (typeof this.instance.closeSync === 'function') {
            this.instance.closeSync();
          } else if (typeof this.instance.terminate === 'function') {
            await this.instance.terminate();
          } else {
            // eslint-disable-next-line no-console
            console.warn(
              '[DuckDB] Instance does not expose a close method; skipping explicit close',
            );
          }
        } catch (error) {
          // eslint-disable-next-line no-console
          console.error('[DuckDB] Error closing instance:', error);
        }
        this.instance = null;
      }

      this.initialized = false;
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('[DuckDB] Error during shutdown:', error);
      throw error;
    }
  }

  /**
   * Format bytes to human-readable string
   */
  private static formatBytes(bytes: number): string {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / k ** i).toFixed(2))} ${sizes[i]}`;
  }
}
