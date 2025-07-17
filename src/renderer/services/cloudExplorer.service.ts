import type {
  Bucket,
  CloudListResult,
  CloudStorageConfig,
} from '../../types/frontend';
import { client } from '../config/client';

class CloudExplorerService {
  static async listBuckets(
    provider: 'aws' | 'azure' | 'gcs',
    config: CloudStorageConfig,
  ): Promise<Bucket[]> {
    const { data } = await client.post<
      { provider: 'aws' | 'azure' | 'gcs'; config: CloudStorageConfig },
      Bucket[]
    >('cloudExplorer:listBuckets', { provider, config });
    return data;
  }

  static async listObjects(
    provider: 'aws' | 'azure' | 'gcs',
    config: CloudStorageConfig,
    bucketName: string,
    continuationToken?: string,
    prefix = '',
  ): Promise<CloudListResult> {
    const { data } = await client.post<
      {
        provider: 'aws' | 'azure' | 'gcs';
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
    provider: 'aws' | 'azure' | 'gcs',
    config: CloudStorageConfig,
    bucketName: string,
    objectName: string,
  ): Promise<string> {
    const { data } = await client.post<
      {
        provider: 'aws' | 'azure' | 'gcs';
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
    provider: 'aws' | 'azure' | 'gcs',
    config: CloudStorageConfig,
  ): Promise<boolean> {
    const { data } = await client.post<
      { provider: 'aws' | 'azure' | 'gcs'; config: CloudStorageConfig },
      boolean
    >('cloudExplorer:testConnection', { provider, config });
    return data;
  }
}

export default CloudExplorerService;
