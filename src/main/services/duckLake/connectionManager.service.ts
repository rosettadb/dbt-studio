/**
 * DuckLake Connection Manager
 * Manages connection pooling, lifecycle, and health monitoring for DuckLake instances
 */

import { CatalogAdapter, CatalogAdapterFactory } from './adapters';
import {
  DuckLakeInstance,
  DuckLakeCatalogConfig,
  DuckLakeInstanceHealth,
} from '../../../types/duckLake';

interface ConnectionEntry {
  adapter: CatalogAdapter;
  instance: DuckLakeInstance;
  lastUsed: Date;
  connectionCount: number;
}

export class DuckLakeConnectionManager {
  private static connections: Map<string, ConnectionEntry> = new Map();

  private static healthCheckInterval: ReturnType<typeof setInterval> | null =
    null;

  private static readonly HEALTH_CHECK_INTERVAL_MS = 30000; // 30 seconds

  private static readonly MAX_IDLE_TIME_MS = 300000; // 5 minutes

  private static readonly MAX_CONNECTIONS_PER_INSTANCE = 1; // DuckLake is single-connection per instance

  /**
   * Initialize the connection manager
   */
  static initialize(): void {
    if (!this.healthCheckInterval) {
      this.startHealthChecking();
    }
  }

  /**
   * Get or create a connection for an instance
   */
  static async getConnection(
    instanceId: string,
    instance: DuckLakeInstance,
    catalogConfig: DuckLakeCatalogConfig,
  ): Promise<CatalogAdapter> {
    const existing = this.connections.get(instanceId);

    if (existing) {
      // Update last used time and increment connection count
      existing.lastUsed = new Date();
      existing.connectionCount += 1;
      return existing.adapter;
    }

    // Create new connection
    const adapter = CatalogAdapterFactory.createAdapter(catalogConfig.type);
    await adapter.connect(catalogConfig, instance);

    const entry: ConnectionEntry = {
      adapter,
      instance,
      lastUsed: new Date(),
      connectionCount: 1,
    };

    this.connections.set(instanceId, entry);
    return adapter;
  }

  /**
   * Release a connection (decrement usage count)
   */
  static releaseConnection(instanceId: string): void {
    const entry = this.connections.get(instanceId);
    if (entry && entry.connectionCount > 0) {
      entry.connectionCount -= 1;
    }
  }

  /**
   * Disconnect a specific instance
   */
  static async disconnect(instanceId: string): Promise<void> {
    const entry = this.connections.get(instanceId);
    if (entry) {
      try {
        await entry.adapter.disconnect();
      } catch (error) {
        // eslint-disable-next-line no-console
        console.error(`Error disconnecting instance ${instanceId}:`, error);
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
   */
  static async cleanupIdleConnections(): Promise<void> {
    const now = new Date();
    const toDisconnect: string[] = [];

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
      // eslint-disable-next-line no-console
      console.log(
        `Cleaned up ${toDisconnect.length} idle DuckLake connections`,
      );
    }
  }

  /**
   * Start periodic health checking and cleanup
   */
  private static startHealthChecking(): void {
    this.healthCheckInterval = setInterval(async () => {
      try {
        await this.performHealthChecks();
        await this.cleanupIdleConnections();
      } catch (error) {
        // eslint-disable-next-line no-console
        console.error('Error during DuckLake health check cycle:', error);
      }
    }, this.HEALTH_CHECK_INTERVAL_MS);
  }

  /**
   * Perform health checks on all connections
   */
  private static async performHealthChecks(): Promise<void> {
    const healthCheckPromises = Array.from(this.connections.entries()).map(
      async ([instanceId, entry]) => {
        try {
          const health = await entry.adapter.healthCheck();
          if (!health.connected) {
            // eslint-disable-next-line no-console
            console.warn(
              `DuckLake instance ${instanceId} health check failed:`,
              health.error,
            );

            // Optionally disconnect unhealthy connections
            if (entry.connectionCount === 0) {
              await this.disconnect(instanceId);
            }
          }
        } catch (error) {
          // eslint-disable-next-line no-console
          console.error(
            `Health check error for instance ${instanceId}:`,
            error,
          );
        }
      },
    );

    await Promise.all(healthCheckPromises);
  }

  /**
   * Stop health checking
   */
  static shutdown(): void {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = null;
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
}
