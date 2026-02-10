import { ipcMain } from 'electron';
import type { CloudStorageConfig, CloudProvider } from '../../types/frontend';
import { CloudExplorerService, CloudPreviewService } from '../services';

const handlerChannels = [
  'cloudExplorer:listBuckets',
  'cloudExplorer:listObjects',
  'cloudExplorer:getDownloadUrl',
  'cloudExplorer:testConnection',
  'cloudExplorer:previewData',
];

const removeCloudExplorerIpcHandlers = () => {
  handlerChannels.forEach((channel) => {
    ipcMain.removeHandler(channel);
  });
};

const registerCloudExplorerHandlers = () => {
  removeCloudExplorerIpcHandlers();

  ipcMain.handle(
    'cloudExplorer:listBuckets',
    async (
      _event,
      {
        provider,
        config,
      }: {
        provider: CloudProvider;
        config: CloudStorageConfig;
      },
    ) => {
      return CloudExplorerService.listBuckets(provider, config);
    },
  );

  ipcMain.handle(
    'cloudExplorer:listObjects',
    async (
      _event,
      {
        provider,
        config,
        bucketName,
        continuationToken,
        prefix = '',
      }: {
        provider: CloudProvider;
        config: CloudStorageConfig;
        bucketName: string;
        continuationToken?: string;
        prefix?: string;
      },
    ) => {
      return CloudExplorerService.listObjects(
        provider,
        config,
        bucketName,
        continuationToken,
        prefix,
      );
    },
  );

  ipcMain.handle(
    'cloudExplorer:getDownloadUrl',
    async (
      _event,
      {
        provider,
        config,
        bucketName,
        objectName,
      }: {
        provider: CloudProvider;
        config: CloudStorageConfig;
        bucketName: string;
        objectName: string;
      },
    ) => {
      return CloudExplorerService.getDownloadUrl(
        provider,
        config,
        bucketName,
        objectName,
      );
    },
  );

  ipcMain.handle(
    'cloudExplorer:testConnection',
    async (
      _event,
      {
        provider,
        config,
      }: {
        provider: CloudProvider;
        config: CloudStorageConfig;
      },
    ) => {
      // Add validation to ensure config is not undefined
      if (!config) {
        throw new Error('Config is undefined');
      }

      // Validate required fields based on provider
      if (provider === 'aws') {
        const s3Config = config as any;
        if (
          !s3Config.region ||
          !s3Config.accessKeyId ||
          !s3Config.secretAccessKey
        ) {
          throw new Error(
            `Invalid AWS config: missing required fields. Received: ${JSON.stringify(s3Config)}`,
          );
        }
      } else if (provider === 'minio') {
        const minioConfig = config as any;
        if (
          !minioConfig.endpoint ||
          !minioConfig.accessKeyId ||
          !minioConfig.secretAccessKey
        ) {
          throw new Error(
            `Invalid MinIO config: missing required fields. Received: ${JSON.stringify(minioConfig)}`,
          );
        }
      } else if (provider === 'cloudflare-r2') {
        const r2Config = config as any;
        if (
          !r2Config.accountId ||
          !r2Config.accessKeyId ||
          !r2Config.secretAccessKey
        ) {
          throw new Error(
            `Invalid Cloudflare R2 config: missing required fields. Received: ${JSON.stringify(r2Config)}`,
          );
        }
      } else if (provider === 'backblaze-b2') {
        const b2Config = config as any;
        if (!b2Config.applicationKeyId || !b2Config.applicationKey) {
          throw new Error(
            `Invalid Backblaze B2 config: missing required fields. Received: ${JSON.stringify(b2Config)}`,
          );
        }
      } else if (provider === 'rustfs') {
        const rustfsConfig = config as any;
        if (
          !rustfsConfig.endpoint ||
          !rustfsConfig.accessKeyId ||
          !rustfsConfig.secretAccessKey
        ) {
          throw new Error(
            `Invalid rustfs config: missing required fields. Received: ${JSON.stringify(rustfsConfig)}`,
          );
        }
      }

      return CloudExplorerService.testConnection(provider, config);
    },
  );

  ipcMain.handle(
    'cloudExplorer:previewData',
    async (
      _event,
      {
        provider,
        config,
        bucketName,
        objectName,
        previewType = 'sample',
        limit = 100,
      }: {
        provider: CloudProvider;
        config: CloudStorageConfig;
        bucketName: string;
        objectName: string;
        previewType?: 'sample' | 'schema' | 'stats';
        limit?: number;
      },
    ) => {
      const objectPath = CloudPreviewService.getCloudUrl(
        provider,
        bucketName,
        objectName,
      );

      try {
        const result = await CloudPreviewService.previewCloudData({
          provider,
          cloudConfig: config,
          objectPath,
          previewType,
          limit,
        });

        return result;
      } catch (error) {
        // eslint-disable-next-line no-console
        console.error('IPC Handler - Preview error:', error);
        throw error;
      }
    },
  );
};

export default registerCloudExplorerHandlers;
