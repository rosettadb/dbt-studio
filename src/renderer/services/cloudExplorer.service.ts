import type {
  Bucket,
  CloudListResult,
  CloudStorageConfig,
  PreviewResult,
  CloudProvider,
} from '../../types/frontend';
import type {
  UploadFileRequest,
  UploadFileResponse,
  CreateBucketRequest,
  CreateBucketResponse,
  DeleteObjectRequest,
  DeleteObjectResponse,
  UploadProgressEvent,
  CreateFolderRequest,
  CreateFolderResponse,
} from '../../types/ipc';
import { client } from '../config/client';

class CloudExplorerService {
  static async listBuckets(
    provider: CloudProvider,
    config: CloudStorageConfig,
  ): Promise<Bucket[]> {
    const { data } = await client.post<
      {
        provider: CloudProvider;
        config: CloudStorageConfig;
      },
      Bucket[]
    >('cloudExplorer:listBuckets', { provider, config });
    return data;
  }

  static async listObjects(
    provider: CloudProvider,
    config: CloudStorageConfig,
    bucketName: string,
    continuationToken?: string,
    prefix = '',
  ): Promise<CloudListResult> {
    const { data } = await client.post<
      {
        provider: CloudProvider;
        config: CloudStorageConfig;
        bucketName: string;
        continuationToken?: string;
        prefix?: string;
      },
      CloudListResult
    >('cloudExplorer:listObjects', {
      provider,
      config,
      bucketName,
      continuationToken,
      prefix,
    });
    return data;
  }

  static async getDownloadUrl(
    provider: CloudProvider,
    config: CloudStorageConfig,
    bucketName: string,
    objectName: string,
  ): Promise<string> {
    const { data } = await client.post<
      {
        provider: CloudProvider;
        config: CloudStorageConfig;
        bucketName: string;
        objectName: string;
      },
      string
    >('cloudExplorer:getDownloadUrl', {
      provider,
      config,
      bucketName,
      objectName,
    });
    return data;
  }

  static async testConnection(
    provider: CloudProvider,
    config: CloudStorageConfig,
  ): Promise<boolean> {
    const { data } = await client.post<
      {
        provider: CloudProvider;
        config: CloudStorageConfig;
      },
      boolean
    >('cloudExplorer:testConnection', { provider, config });
    return data;
  }

  static async previewData(
    provider: CloudProvider,
    config: CloudStorageConfig,
    bucketName: string,
    objectName: string,
    previewType: 'sample' | 'schema' | 'stats' = 'sample',
    limit: number = 100,
  ): Promise<PreviewResult> {
    try {
      const { data } = await client.post<
        {
          provider: CloudProvider;
          config: CloudStorageConfig;
          bucketName: string;
          objectName: string;
          previewType?: 'sample' | 'schema' | 'stats';
          limit?: number;
        },
        PreviewResult
      >('cloudExplorer:previewData', {
        provider,
        config,
        bucketName,
        objectName,
        previewType,
        limit,
      });

      return data;
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('previewData error:', error);
      throw error;
    }
  }

  static async uploadFile(
    params: UploadFileRequest,
  ): Promise<UploadFileResponse> {
    const { data } = await client.post<UploadFileRequest, UploadFileResponse>(
      'cloudExplorer:uploadFile',
      params,
    );
    return data;
  }

  static async createBucket(
    params: CreateBucketRequest,
  ): Promise<CreateBucketResponse> {
    const { data } = await client.post<
      CreateBucketRequest,
      CreateBucketResponse
    >('cloudExplorer:createBucket', params);
    return data;
  }

  static async deleteObject(
    params: DeleteObjectRequest,
  ): Promise<DeleteObjectResponse> {
    const { data } = await client.post<
      DeleteObjectRequest,
      DeleteObjectResponse
    >('cloudExplorer:deleteObject', params);
    return data;
  }

  static onUploadProgress(
    handler: (event: UploadProgressEvent) => void,
  ): () => void {
    return window.electron.ipcRenderer.on(
      'cloudExplorer:uploadProgress',
      handler as (...args: unknown[]) => void,
    );
  }

  static async createFolder(
    params: CreateFolderRequest,
  ): Promise<CreateFolderResponse> {
    const { data } = await client.post<CreateFolderRequest, CreateFolderResponse>(
      'cloudExplorer:createFolder',
      params,
    );
    return data;
  }
}

export default CloudExplorerService;
