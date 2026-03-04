/**
 * DuckLake Connection Manager
 * Manages connection pooling, lifecycle, and health monitoring for DuckLake instances
 */

import { CatalogAdapter, CatalogAdapterFactory } from './adapters';
import {
  DuckLakeInstance,
  DuckLakeCatalogConfig,
  DuckLakeInstanceHealth,
  DuckLakeStorageConfig,
} from '../../../types/duckLake';

interface ConnectionEntry {
  adapter: CatalogAdapter;
  instance: DuckLakeInstance;
  lastUsed: Date;
  connectionCount: number;
  // eslint-disable-next-line no-undef
  cleanupTimer?: NodeJS.Timeout;
}

export default class DuckLakeConnectionManager {
  private static connections: Map<string, ConnectionEntry> = new Map();

  private static readonly MAX_IDLE_TIME_MS = 60000; // 1 minute - for manual cleanup calls

  private static readonly MAX_CONNECTIONS_PER_INSTANCE = 1; // DuckLake is single-connection per instance

  private static readonly CLEANUP_DELAY_MS = 2000; // 2 seconds delay before cleanup

  // Mutex for connection acquisition to prevent race conditions
  private static connectionLocks: Map<string, Promise<CatalogAdapter>> =
    new Map();

  /**
   * Initialize the connection manager
   * Note: Automatic health checks are disabled to reduce CPU usage.
   * Health checks only run on-demand when user explicitly tests connections.
   */
  static initialize(): void {
    // No automatic background tasks - health checks run only on user interaction
  }

  /**
   * Get or create a connection for an instance
   * Uses mutex to prevent race conditions when multiple components request the same connection
   */
  static async getConnection(
    instanceId: string,
    instance: DuckLakeInstance,
    catalogConfig: DuckLakeCatalogConfig,
    storageConfig?: DuckLakeStorageConfig,
  ): Promise<CatalogAdapter> {
    // Check if there's an ongoing connection attempt (mutex)
    const existingLock = this.connectionLocks.get(instanceId);
    if (existingLock) {
      // eslint-disable-next-line no-console
      console.log(
        `[DuckLake] Waiting for existing connection attempt for instance: ${instanceId}`,
      );
      return existingLock;
    }

    const existing = this.connections.get(instanceId);

    if (existing) {
      // Cancel any pending cleanup timer
      if (existing.cleanupTimer) {
        // eslint-disable-next-line no-console
        console.log(
          `[DuckLake] Canceling cleanup timer for instance: ${instanceId}`,
        );
        clearTimeout(existing.cleanupTimer);
        existing.cleanupTimer = undefined;
      }

      // Update last used time and increment connection count
      existing.lastUsed = new Date();
      existing.connectionCount += 1;
      // eslint-disable-next-line no-console
      console.log(
        `[DuckLake] Reusing existing connection for instance: ${instanceId}, ref count: ${existing.connectionCount}`,
      );
      return existing.adapter;
    }

    // Create mutex promise for this connection attempt
    const connectionPromise = this.createConnection(
      instanceId,
      instance,
      catalogConfig,
      storageConfig,
    );

    this.connectionLocks.set(instanceId, connectionPromise);

    try {
      const adapter = await connectionPromise;
      return adapter;
    } finally {
      // Remove mutex lock
      this.connectionLocks.delete(instanceId);
    }
  }

  /**
   * Internal method to create a new connection
   */
  private static async createConnection(
    instanceId: string,
    instance: DuckLakeInstance,
    catalogConfig: DuckLakeCatalogConfig,
    storageConfig?: DuckLakeStorageConfig,
  ): Promise<CatalogAdapter> {
    // eslint-disable-next-line no-console
    console.log(
      `[DuckLake] Creating new connection for instance: ${instanceId}`,
    );

    try {
      // Create new connection
      const adapter = CatalogAdapterFactory.createAdapter(catalogConfig.type);
      await adapter.connect(catalogConfig, instance, storageConfig);

      const entry: ConnectionEntry = {
        adapter,
        instance,
        lastUsed: new Date(),
        connectionCount: 1,
        cleanupTimer: undefined,
      };

      this.connections.set(instanceId, entry);
      // eslint-disable-next-line no-console
      console.log(
        `[DuckLake] Successfully connected to instance: ${instanceId}, ref count: 1`,
      );
      return adapter;
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error(
        `[DuckLake] Failed to connect to instance: ${instanceId}`,
        error,
      );

      // Check if this is a lock error
      if (
        error instanceof Error &&
        error.message.includes('database is locked')
      ) {
        // eslint-disable-next-line no-console
        console.log(
          `[DuckLake] Detected lock error for instance: ${instanceId}, attempting recovery...`,
        );

        await this.disconnect(instanceId);

        await new Promise((resolve) => {
          setTimeout(resolve, 1000);
        });

        // eslint-disable-next-line no-console
        console.log(
          `[DuckLake] Retrying connection for instance: ${instanceId}`,
        );
        const adapter = CatalogAdapterFactory.createAdapter(catalogConfig.type);
        await adapter.connect(catalogConfig, instance, storageConfig);

        const entry: ConnectionEntry = {
          adapter,
          instance,
          lastUsed: new Date(),
          connectionCount: 1,
          cleanupTimer: undefined,
        };

        this.connections.set(instanceId, entry);
        // eslint-disable-next-line no-console
        console.log(
          `[DuckLake] Successfully connected after retry for instance: ${instanceId}`,
        );
        return adapter;
      }

      throw error;
    }
  }

  /**
   * Release a connection (decrement usage count)
   * If ref count reaches 0, schedules delayed cleanup
   */
  static releaseConnection(instanceId: string): void {
    const entry = this.connections.get(instanceId);
    if (entry && entry.connectionCount > 0) {
      entry.connectionCount -= 1;
      // eslint-disable-next-line no-console
      console.log(
        `[DuckLake] Released connection for instance: ${instanceId}, ref count: ${entry.connectionCount}`,
      );

      // If no more references, schedule cleanup after delay
      if (entry.connectionCount === 0) {
        // Cancel any existing cleanup timer
        if (entry.cleanupTimer) {
          clearTimeout(entry.cleanupTimer);
        }

        // Schedule cleanup after CLEANUP_DELAY_MS
        // eslint-disable-next-line no-console
        console.log(
          `[DuckLake] Scheduling cleanup for instance: ${instanceId} in ${this.CLEANUP_DELAY_MS}ms`,
        );
        entry.cleanupTimer = setTimeout(() => {
          this.performDelayedCleanup(instanceId);
        }, this.CLEANUP_DELAY_MS);
      }
    }
  }

  /**
   * Perform delayed cleanup for an instance
   */
  private static async performDelayedCleanup(
    instanceId: string,
  ): Promise<void> {
    const entry = this.connections.get(instanceId);

    // Check if connection is still unreferenced
    if (entry && entry.connectionCount === 0) {
      // eslint-disable-next-line no-console
      console.log(
        `[DuckLake] Executing delayed cleanup for instance: ${instanceId}`,
      );
      await this.disconnect(instanceId);
    } else if (entry) {
      // eslint-disable-next-line no-console
      console.log(
        `[DuckLake] Skipping cleanup for instance: ${instanceId}, ref count is now ${entry.connectionCount}`,
      );
    }
  }

  /**
   * Disconnect a specific instance
   */
  static async disconnect(instanceId: string): Promise<void> {
    const entry = this.connections.get(instanceId);
    if (entry) {
      // Clear any pending cleanup timer
      if (entry.cleanupTimer) {
        clearTimeout(entry.cleanupTimer);
        entry.cleanupTimer = undefined;
      }

      try {
        // eslint-disable-next-line no-console
        console.log(`[DuckLake] Disconnecting instance: ${instanceId}`);
        await entry.adapter.disconnect();
        // eslint-disable-next-line no-console
        console.log(
          `[DuckLake] Successfully disconnected instance: ${instanceId}`,
        );
      } catch (error) {
        // eslint-disable-next-line no-console
        console.error(
          `[DuckLake] Error disconnecting instance ${instanceId}:`,
          error,
        );
      } finally {
        this.connections.delete(instanceId);
      }
    }
  }

  /**
   * Disconnect all connections
   */
  static async disconnectAll(): Promise<void> {
    const disconnectPromises = Array.from(this.connections.entries()).map(
      async ([instanceId, entry]) => {
        try {
          await entry.adapter.disconnect();
        } catch (error) {
          // eslint-disable-next-line no-console
          console.error(`Error disconnecting instance ${instanceId}:`, error);
        }
      },
    );

    await Promise.all(disconnectPromises);
    this.connections.clear();
  }

  /**
   * Get connection status for an instance
   */
  static getConnectionStatus(instanceId: string): {
    connected: boolean;
    lastUsed?: Date;
    connectionCount?: number;
  } {
    const entry = this.connections.get(instanceId);
    if (!entry) {
      return { connected: false };
    }

    return {
      connected: entry.adapter.isConnected(),
      lastUsed: entry.lastUsed,
      connectionCount: entry.connectionCount,
    };
  }

  /**
   * Get health status for an instance
   */
  static async getInstanceHealth(
    instanceId: string,
  ): Promise<DuckLakeInstanceHealth | null> {
    const entry = this.connections.get(instanceId);
    if (!entry) {
      return null;
    }

    try {
      const healthStatus = await entry.adapter.healthCheck();

      return {
        instanceId,
        status: entry.instance.status,
        lastChecked: healthStatus.lastChecked,
        catalogConnected: healthStatus.connected,
        extensionLoaded: true, // Assume loaded if connection exists
        dataPathAccessible: true, // Would need separate check
        errors: healthStatus.error ? [healthStatus.error] : [],
        warnings: [],
      };
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error(`Health check failed for instance ${instanceId}:`, error);

      return {
        instanceId,
        status: 'error',
        lastChecked: new Date(),
        catalogConnected: false,
        extensionLoaded: false,
        dataPathAccessible: false,
        errors: [(error as Error).message],
        warnings: [],
      };
    }
  }

  /**
   * Test connection without creating persistent connection
   */
  static async testConnection(
    catalogConfig: DuckLakeCatalogConfig,
  ): Promise<{ success: boolean; error?: string; responseTime?: number }> {
    try {
      const adapter = CatalogAdapterFactory.createAdapter(catalogConfig.type);
      const healthStatus = await adapter.testConnection(catalogConfig);

      return {
        success: healthStatus.connected,
        error: healthStatus.error,
        responseTime: healthStatus.responseTime,
      };
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('Connection test failed:', error);
      return {
        success: false,
        error: (error as Error).message,
      };
    }
  }

  /**
   * Get all active connections
   */
  static getActiveConnections(): Array<{
    instanceId: string;
    catalogType: string;
    lastUsed: Date;
    connectionCount: number;
    connected: boolean;
  }> {
    return Array.from(this.connections.entries()).map(
      ([instanceId, entry]) => ({
        instanceId,
        catalogType: entry.adapter.getCatalogType(),
        lastUsed: entry.lastUsed,
        connectionCount: entry.connectionCount,
        connected: entry.adapter.isConnected(),
      }),
    );
  }

  /**
   * Clean up idle connections
   * Note: This is NOT called automatically. Call manually when needed to free resources.
   * Connections idle for more than MAX_IDLE_TIME_MS will be disconnected.
   */
  static async cleanupIdleConnections(): Promise<void> {
    const now = new Date();
    const toDisconnect: string[] = [];

    // Get memory stats before cleanup
    const memBefore = this.getMemoryStats();

    Array.from(this.connections.entries()).forEach(([instanceId, entry]) => {
      const idleTime = now.getTime() - entry.lastUsed.getTime();

      // Disconnect if idle for too long and no active connections
      if (idleTime > this.MAX_IDLE_TIME_MS && entry.connectionCount === 0) {
        toDisconnect.push(instanceId);
      }
    });

    // Disconnect idle connections
    await toDisconnect.reduce(async (previousPromise, instanceId) => {
      await previousPromise;
      await this.disconnect(instanceId);
    }, Promise.resolve());

    if (toDisconnect.length > 0) {
      // Get memory stats after cleanup
      const memAfter = this.getMemoryStats();

      // eslint-disable-next-line no-console
      console.log(
        `[DuckLake] Cleaned up ${toDisconnect.length} idle connections`,
        {
          before: {
            connections: memBefore.totalConnections,
            heapMB: memBefore.heapUsedMB,
            rssMB: memBefore.rss,
          },
          after: {
            connections: memAfter.totalConnections,
            heapMB: memAfter.heapUsedMB,
            rssMB: memAfter.rss,
          },
          freed: {
            heapMB: memBefore.heapUsedMB - memAfter.heapUsedMB,
            rssMB: memBefore.rss - memAfter.rss,
          },
        },
      );

      // Suggest garbage collection if available
      if (global.gc) {
        global.gc();
        // eslint-disable-next-line no-console
        console.log('[DuckLake] Triggered garbage collection');
      }
    }
  }

  /**
   * Get connection statistics
   */
  static getStatistics(): {
    totalConnections: number;
    activeConnections: number;
    connectionsByType: Record<string, number>;
    oldestConnection?: Date;
    newestConnection?: Date;
  } {
    const connections = Array.from(this.connections.values());
    const connectionsByType: Record<string, number> = connections.reduce(
      (acc, entry) => {
        const type = entry.adapter.getCatalogType();
        acc[type] = (acc[type] || 0) + 1;
        return acc;
      },
      {} as Record<string, number>,
    );

    const lastUsedTimes = connections.map((entry) => entry.lastUsed);

    return {
      totalConnections: connections.length,
      activeConnections: connections.filter(
        (entry) => entry.connectionCount > 0,
      ).length,
      connectionsByType,
      oldestConnection:
        lastUsedTimes.length > 0
          ? new Date(Math.min(...lastUsedTimes.map((d) => d.getTime())))
          : undefined,
      newestConnection:
        lastUsedTimes.length > 0
          ? new Date(Math.max(...lastUsedTimes.map((d) => d.getTime())))
          : undefined,
    };
  }

  /**
   * Get memory statistics to monitor for leaks
   */
  static getMemoryStats(): {
    totalConnections: number;
    activeConnections: number;
    heapUsedMB: number;
    heapTotalMB: number;
    externalMB: number;
    rss: number;
  } {
    const stats = this.getStatistics();
    const memUsage = process.memoryUsage();

    return {
      totalConnections: stats.totalConnections,
      activeConnections: stats.activeConnections,
      heapUsedMB: Math.round(memUsage.heapUsed / 1024 / 1024), // MB
      heapTotalMB: Math.round(memUsage.heapTotal / 1024 / 1024), // MB
      externalMB: Math.round(memUsage.external / 1024 / 1024), // MB
      rss: Math.round(memUsage.rss / 1024 / 1024), // MB (Resident Set Size)
    };
  }
}
