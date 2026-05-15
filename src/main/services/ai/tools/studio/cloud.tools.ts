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
import CloudExplorerService from '../../../cloudExplorer.service';
import CloudPreviewService from '../../../cloudPreview.service';
import ConnectorsService from '../../../connectors.service';
import SecureStorageService from '../../../secureStorage.service';
import { truncateToolResult } from '../../tokenEstimator';
import { isToolEnabled } from '../toolRegistry';

const STUDIO_CLOUD_LIST_OBJECTS_FLAG = 'studio.cloud.list_objects';
const STUDIO_CLOUD_PREVIEW_DATA_FLAG = 'studio.cloud.preview_data';
const DEFAULT_MAX_OUTPUT_TOKENS = 3_000;
const MAX_PREVIEW_LIMIT = 500;

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

export function createStudioCloudTools() {
  const listEnabled = isToolEnabled(STUDIO_CLOUD_LIST_OBJECTS_FLAG);
  const previewEnabled = isToolEnabled(STUDIO_CLOUD_PREVIEW_DATA_FLAG);
  if (!listEnabled && !previewEnabled) {
    return {};
  }

  const tools: Record<string, any> = {};

  if (listEnabled) {
    tools.studio_cloud_list_objects = tool({
      description:
        'List objects in a cloud storage bucket (S3/Azure/GCS and S3-compatible providers) using a saved DBT Studio cloud connection.',
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
          bucketName: z
            .string()
            .min(1)
            .describe('Bucket/container name to list objects from'),
          prefix: z
            .string()
            .optional()
            .default('')
            .describe(
              'Optional key prefix (folder path) to narrow object listing',
            ),
          continuationToken: z
            .string()
            .optional()
            .describe('Pagination token from a previous list_objects call'),
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
      execute: async ({
        connectionId,
        connectionName,
        bucketName,
        prefix,
        continuationToken,
      }) => {
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
          const result = await CloudExplorerService.listObjects(
            cloudConnection.provider,
            fullConfig,
            bucketName.trim(),
            continuationToken,
            prefix ?? '',
          );

          const payload = {
            connection: {
              id: cloudConnection.id,
              name: cloudConnection.name,
              provider: cloudConnection.provider,
            },
            bucketName: bucketName.trim(),
            prefix: prefix ?? '',
            objectCount: result.objects.length,
            nextPageToken: result.nextPageToken,
            objects: result.objects,
          };

          const raw = JSON.stringify(payload);
          const output = truncateToolResult(raw, DEFAULT_MAX_OUTPUT_TOKENS);
          const truncated = output !== raw;

          return {
            ok: true,
            ...(truncated ? {} : { data: payload }),
            output,
            meta: {
              duration: Date.now() - startedAt,
              objectCount: result.objects.length,
              truncated,
              hasNextPage: !!result.nextPageToken,
            },
          };
        } catch (error) {
          return {
            ok: false,
            error:
              error instanceof Error
                ? error.message
                : 'Failed to list cloud objects',
            meta: {
              duration: Date.now() - startedAt,
            },
          };
        }
      },
    });
  }

  if (previewEnabled) {
    tools.studio_cloud_preview_data = tool({
      description:
        'Preview tabular data from a cloud object (CSV/Parquet/JSON where supported) using DuckDB cloud preview.',
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
          bucketName: z
            .string()
            .min(1)
            .describe('Bucket/container name containing the object'),
          objectName: z
            .string()
            .min(1)
            .describe('Object key/path inside the bucket/container'),
          previewType: z
            .enum(['sample', 'schema', 'stats'])
            .optional()
            .default('sample')
            .describe('Preview mode: sample rows, schema only, or file stats'),
          limit: z
            .number()
            .int()
            .min(1)
            .max(MAX_PREVIEW_LIMIT)
            .optional()
            .default(100)
            .describe(
              `Maximum number of preview rows to return (1-${MAX_PREVIEW_LIMIT})`,
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
      execute: async ({
        connectionId,
        connectionName,
        bucketName,
        objectName,
        previewType,
        limit,
      }) => {
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
          const objectPath = CloudPreviewService.getCloudUrl(
            cloudConnection.provider,
            bucketName.trim(),
            objectName.trim(),
          );
          const safeLimit = Math.min(
            MAX_PREVIEW_LIMIT,
            Math.max(1, Math.floor(limit ?? 100)),
          );

          const result = await CloudPreviewService.previewCloudData({
            provider: cloudConnection.provider,
            cloudConfig: fullConfig,
            objectPath,
            previewType,
            limit: safeLimit,
          });

          if (!result.success) {
            return {
              ok: false,
              error: result.error ?? 'Cloud preview failed',
              data: {
                objectPath: result.objectPath,
                previewType: result.previewType,
              },
              meta: {
                duration: Date.now() - startedAt,
                limit: safeLimit,
              },
            };
          }

          const payload = {
            connection: {
              id: cloudConnection.id,
              name: cloudConnection.name,
              provider: cloudConnection.provider,
            },
            bucketName: bucketName.trim(),
            objectName: objectName.trim(),
            objectPath,
            previewType: result.previewType,
            limit: safeLimit,
            totalRows: result.totalRows,
            columns: result.columns ?? [],
            rows: result.data ?? [],
          };

          const raw = JSON.stringify(payload);
          const output = truncateToolResult(raw, DEFAULT_MAX_OUTPUT_TOKENS);
          const truncated = output !== raw;

          return {
            ok: true,
            ...(truncated ? {} : { data: payload }),
            output,
            meta: {
              duration: Date.now() - startedAt,
              truncated,
              rowCount: Array.isArray(result.data) ? result.data.length : 0,
              limit: safeLimit,
              previewType: result.previewType,
            },
          };
        } catch (error) {
          return {
            ok: false,
            error:
              error instanceof Error
                ? error.message
                : 'Failed to preview cloud object',
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
