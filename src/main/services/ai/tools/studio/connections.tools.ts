import { tool } from 'ai';
import { z } from 'zod';

import type {
  BackblazeB2Config,
  CloudConnection,
  CloudStorageConfig,
  GarageConfig,
  MinIOConfig,
  RustfsConfig,
} from '../../../../../types/frontend';
import type { ConnectorTestResponse } from '../../../../../types/backend';
import CloudExplorerService from '../../../cloudExplorer.service';
import ConnectorsService from '../../../connectors.service';
import DuckLakeService from '../../../duckLake.service';
import SecureStorageService from '../../../secureStorage.service';
import { isToolEnabled } from '../toolRegistry';

const STUDIO_CONNECTIONS_LIST_FLAG = 'studio.connections.list';
const STUDIO_CLOUD_CONNECTION_TEST_FLAG = 'studio.cloud.connection_test';

type ConnectionHealth = 'healthy' | 'unhealthy' | 'unknown';

function toHealthLabel(testResult: ConnectorTestResponse): ConnectionHealth {
  if (typeof testResult === 'boolean') {
    return testResult ? 'healthy' : 'unhealthy';
  }
  if (typeof testResult?.ok === 'boolean') {
    return testResult.ok ? 'healthy' : 'unhealthy';
  }
  if (typeof testResult?.success === 'boolean') {
    return testResult.success ? 'healthy' : 'unhealthy';
  }
  return 'unknown';
}

function normalizeConnectionName(value: string): string {
  return value.toLowerCase().trim();
}

async function getRequiredCredential(
  key: string,
  label: string,
): Promise<string> {
  const value = await SecureStorageService.getCredential(key);
  if (!value) {
    throw new Error(
      `Missing secure credential "${label}" for this cloud connection`,
    );
  }
  return value;
}

async function getCloudConnectionByName(
  connectionName: string,
): Promise<CloudConnection | null> {
  const allCloudConnections = await ConnectorsService.loadCloudConnections();
  return (
    allCloudConnections.find(
      (row) =>
        normalizeConnectionName(row.name) ===
        normalizeConnectionName(connectionName),
    ) ?? null
  );
}

async function hydrateCloudConfig(
  connection: CloudConnection,
): Promise<CloudStorageConfig> {
  const { id, provider } = connection;

  if (provider === 'aws') {
    const persisted = connection.config as {
      region: string;
      accessKeyId: string;
    };
    const secretAccessKey = await getRequiredCredential(
      `cloud-aws-${id}`,
      `cloud-aws-${id}`,
    );
    const sessionToken = await SecureStorageService.getCredential(
      `cloud-aws-session-${id}`,
    );
    return {
      ...persisted,
      secretAccessKey,
      ...(sessionToken ? { sessionToken } : {}),
    };
  }

  if (provider === 'azure') {
    const persisted = connection.config as {
      accountName: string;
      connectionString?: string;
    };
    const accountKey = await getRequiredCredential(
      `cloud-azure-${id}`,
      `cloud-azure-${id}`,
    );
    return {
      ...persisted,
      accountKey,
    };
  }

  if (provider === 'gcs') {
    const persisted = connection.config as {
      projectId: string;
    };
    const credentials = await getRequiredCredential(
      `cloud-gcs-${id}`,
      `cloud-gcs-${id}`,
    );
    return {
      ...persisted,
      credentials,
    };
  }

  if (provider === 'minio') {
    const persisted = connection.config as MinIOConfig;
    const secretAccessKey = await getRequiredCredential(
      `cloud-minio-${id}`,
      `cloud-minio-${id}`,
    );
    return {
      ...persisted,
      secretAccessKey,
    };
  }

  if (provider === 'cloudflare-r2') {
    const persisted = connection.config as {
      accountId: string;
      accessKeyId: string;
      jurisdiction?: 'eu';
    };
    const secretAccessKey = await getRequiredCredential(
      `cloud-cloudflare-r2-${id}`,
      `cloud-cloudflare-r2-${id}`,
    );
    return {
      ...persisted,
      secretAccessKey,
    };
  }

  if (provider === 'backblaze-b2') {
    const persisted = connection.config as BackblazeB2Config;
    const applicationKey = await getRequiredCredential(
      `cloud-backblaze-b2-${id}`,
      `cloud-backblaze-b2-${id}`,
    );
    return {
      ...persisted,
      applicationKey,
    };
  }

  if (provider === 'rustfs') {
    const persisted = connection.config as RustfsConfig;
    const secretAccessKey = await getRequiredCredential(
      `cloud-rustfs-${id}`,
      `cloud-rustfs-${id}`,
    );
    return {
      ...persisted,
      secretAccessKey,
    };
  }

  if (provider === 'garage') {
    const persisted = connection.config as GarageConfig;
    const secretAccessKey = await getRequiredCredential(
      `cloud-garage-${id}`,
      `cloud-garage-${id}`,
    );
    return {
      ...persisted,
      secretAccessKey,
    };
  }

  throw new Error(`Unsupported cloud provider: ${provider}`);
}

export function createStudioConnectionsTools() {
  const listEnabled = isToolEnabled(STUDIO_CONNECTIONS_LIST_FLAG);
  const testEnabled = isToolEnabled('studio.connections.test');
  const cloudTestEnabled = isToolEnabled(STUDIO_CLOUD_CONNECTION_TEST_FLAG);

  if (!listEnabled && !testEnabled && !cloudTestEnabled) {
    return {};
  }

  const tools: Record<string, any> = {};

  if (listEnabled) {
    tools.studio_connections_list = tool({
      description:
        'List available database connections in DBT Studio with optional health checks.',
      inputSchema: z.object({
        includeDatabases: z
          .boolean()
          .optional()
          .default(true)
          .describe('Include database connections stored in DBT Studio'),
        includeHealth: z
          .boolean()
          .optional()
          .default(true)
          .describe('Run live health checks for database connections'),
      }),
      execute: async ({ includeDatabases, includeHealth }) => {
        const startedAt = Date.now();

        try {
          const rows: Array<{
            id: string;
            name: string;
            type: string;
            kind: 'database' | 'ducklake';
            health: ConnectionHealth;
          }> = [];

          if (includeDatabases) {
            const dbConnections = await ConnectorsService.loadConnections(true);
            const dbRows = await Promise.all(
              dbConnections.map(async (row) => {
                let health: ConnectionHealth = 'unknown';
                if (includeHealth) {
                  try {
                    const testResult = await ConnectorsService.testConnection(
                      row.connection,
                    );
                    health = toHealthLabel(testResult);
                  } catch {
                    health = 'unhealthy';
                  }
                }

                return {
                  id: row.id,
                  name: row.connection.name,
                  type: row.connection.type,
                  kind: 'database' as const,
                  health,
                };
              }),
            );
            rows.push(...dbRows);
          }

          // Include DuckLake instances alongside regular DB connections
          const duckLakeInstances = await DuckLakeService.listInstances();
          const duckLakeRows = duckLakeInstances.map((inst) => ({
            id: `ducklake-${inst.id}`,
            name: inst.name,
            type: `ducklake (${inst.catalog.type})`,
            kind: 'ducklake' as const,
            health:
              inst.status === 'active'
                ? ('healthy' as const)
                : ('unknown' as const),
          }));
          rows.push(...duckLakeRows);

          return {
            ok: true,
            data: {
              connections: rows,
              total: rows.length,
            },
            meta: {
              duration: Date.now() - startedAt,
            },
          };
        } catch (error) {
          return {
            ok: false,
            error:
              error instanceof Error
                ? error.message
                : 'Failed to list connections',
            meta: {
              duration: Date.now() - startedAt,
            },
          };
        }
      },
    });
  }

  if (testEnabled) {
    tools.studio_connections_test = tool({
      description:
        'Test an existing DBT Studio database connection by connection ID or connection name and return its health.',
      inputSchema: z
        .object({
          connectionId: z
            .string()
            .min(1)
            .optional()
            .describe(
              'Connection ID from DBT Studio connection registry (preferred when available)',
            ),
          connectionName: z
            .string()
            .min(1)
            .optional()
            .describe(
              'Connection name fallback (e.g. "DuckDB Connection", "local")',
            ),
        })
        .refine(
          (value) =>
            typeof value.connectionId === 'string' ||
            typeof value.connectionName === 'string',
          {
            message: 'Provide connectionId or connectionName',
            path: ['connectionId'],
          },
        ),
      execute: async ({ connectionId, connectionName }) => {
        const startedAt = Date.now();
        try {
          let connectionModel: Awaited<
            ReturnType<typeof ConnectorsService.getConnectionById>
          > | null = null;
          let cloudConnection: Awaited<
            ReturnType<typeof ConnectorsService.getCloudConnectionById>
          > | null = null;

          if (connectionId) {
            connectionModel =
              await ConnectorsService.getConnectionById(connectionId);
            if (!connectionModel) {
              cloudConnection =
                await ConnectorsService.getCloudConnectionById(connectionId);
            }
          }

          if (!connectionModel && connectionName) {
            connectionModel =
              await ConnectorsService.findConnectionByName(connectionName);
            if (!connectionModel) {
              const allCloudConnections =
                await ConnectorsService.loadCloudConnections();
              cloudConnection =
                allCloudConnections.find(
                  (row) =>
                    row.name.toLowerCase().trim() ===
                    connectionName.toLowerCase().trim(),
                ) ?? null;
            }
          }

          if (!connectionModel && cloudConnection) {
            return {
              ok: false,
              error:
                'Connection found, but studio_connections_test only supports database connections. Cloud connections are not testable with this tool.',
              data: {
                id: cloudConnection.id,
                name: cloudConnection.name,
                type: cloudConnection.provider,
                kind: 'cloud',
                supportedByTool: false,
              },
              meta: { duration: Date.now() - startedAt },
            };
          }

          if (!connectionModel) {
            const allConnections =
              await ConnectorsService.loadConnections(true);
            return {
              ok: false,
              error: `Connection not found for id/name: ${connectionId ?? connectionName}`,
              data: {
                availableConnections: allConnections.map((row) => ({
                  id: row.id,
                  name: row.connection.name,
                  type: row.connection.type,
                  kind: 'database' as const,
                })),
              },
              meta: { duration: Date.now() - startedAt },
            };
          }

          const testResult = await ConnectorsService.testConnection(
            connectionModel.connection,
          );
          const health = toHealthLabel(testResult);

          return {
            ok: true,
            data: {
              id: connectionModel.id,
              name: connectionModel.connection.name,
              type: connectionModel.connection.type,
              health,
              testSuccess: health === 'healthy',
            },
            meta: { duration: Date.now() - startedAt },
          };
        } catch (error) {
          return {
            ok: false,
            error:
              error instanceof Error
                ? error.message
                : 'Failed to test connection',
            meta: { duration: Date.now() - startedAt },
          };
        }
      },
    });
  }

  if (cloudTestEnabled) {
    tools.studio_cloud_connection_test = tool({
      description:
        'Test an existing DBT Studio cloud connection by connection ID or connection name and return health.',
      inputSchema: z
        .object({
          connectionId: z
            .string()
            .min(1)
            .optional()
            .describe(
              'Cloud connection ID from DBT Studio connection registry (preferred when available)',
            ),
          connectionName: z
            .string()
            .min(1)
            .optional()
            .describe('Cloud connection name fallback'),
        })
        .refine(
          (value) =>
            typeof value.connectionId === 'string' ||
            typeof value.connectionName === 'string',
          {
            message: 'Provide connectionId or connectionName',
            path: ['connectionId'],
          },
        ),
      execute: async ({ connectionId, connectionName }) => {
        const startedAt = Date.now();

        try {
          let cloudConnection: CloudConnection | null = null;

          if (connectionId) {
            cloudConnection =
              await ConnectorsService.getCloudConnectionById(connectionId);
          }

          if (!cloudConnection && connectionName) {
            cloudConnection = await getCloudConnectionByName(connectionName);
          }

          if (!cloudConnection) {
            const availableConnections =
              await ConnectorsService.loadCloudConnections();

            return {
              ok: false,
              error: `Cloud connection not found for id/name: ${connectionId ?? connectionName}`,
              data: {
                availableConnections: availableConnections.map((row) => ({
                  id: row.id,
                  name: row.name,
                  provider: row.provider,
                })),
              },
              meta: {
                duration: Date.now() - startedAt,
              },
            };
          }

          const fullConfig = await hydrateCloudConfig(cloudConnection);
          const success = await CloudExplorerService.testConnection(
            cloudConnection.provider,
            fullConfig,
          );

          return {
            ok: true,
            data: {
              id: cloudConnection.id,
              name: cloudConnection.name,
              provider: cloudConnection.provider,
              health: success ? ('healthy' as const) : ('unhealthy' as const),
            },
            meta: {
              duration: Date.now() - startedAt,
            },
          };
        } catch (error) {
          return {
            ok: false,
            error:
              error instanceof Error
                ? error.message
                : 'Failed to test cloud connection',
            meta: {
              duration: Date.now() - startedAt,
            },
          };
        }
      },
    });
  }

  return tools;
}
