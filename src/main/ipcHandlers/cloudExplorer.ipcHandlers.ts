import { ipcMain } from 'electron';
import { CloudExplorerService } from '../services';
import type { CloudStorageConfig } from '../../types/frontend';

const handlerChannels = [
  'cloudExplorer:listBuckets',
  'cloudExplorer:listObjects',
  'cloudExplorer:getDownloadUrl',
  'cloudExplorer:testConnection',
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
        provider: 'aws' | 'azure' | 'gcs';
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
        provider: 'aws' | 'azure' | 'gcs';
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
        provider: 'aws' | 'azure' | 'gcs';
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
        provider: 'aws' | 'azure' | 'gcs';
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
      }

      return CloudExplorerService.testConnection(provider, config);
    },
  );
};

export default registerCloudExplorerHandlers;
