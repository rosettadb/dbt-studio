import { Storage } from '@google-cloud/storage';
import {
  S3Client,
  ListBucketsCommand,
  ListObjectsV2Command,
  GetObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import {
  BlobServiceClient,
  StorageSharedKeyCredential,
  generateBlobSASQueryParameters,
  BlobSASPermissions,
  SASProtocol,
} from '@azure/storage-blob';
import {
  Bucket,
  StorageObject,
  CloudListResult,
  S3Config,
  AzureConfig,
  GCSConfig,
  CloudStorageConfig,
} from '../../types/frontend';

// Cloud storage service class
class CloudExplorerService {
  // AWS S3 Methods
  private static createS3Client(config: S3Config): S3Client {
    // Validate credentials are provided
    if (!config.accessKeyId || !config.secretAccessKey) {
      throw new Error(
        'AWS credentials are required (Access Key ID and Secret Access Key)',
      );
    }

    return new S3Client({
      region: config.region,
      credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
      },
    });
  }

  static async listS3Buckets(config: S3Config): Promise<Bucket[]> {
    const client = CloudExplorerService.createS3Client(config);
    try {
      const data = await client.send(new ListBucketsCommand({}));
      return (data.Buckets || []).map((bucket) => ({
        name: bucket.Name!,
        created: bucket.CreationDate!,
        location: config.region,
      }));
    } catch (error) {
      throw new Error(`Error listing S3 buckets: ${error}`);
    }
  }

  static async listS3Objects(
    config: S3Config,
    bucketName: string,
    continuationToken?: string,
    prefix = '',
  ): Promise<CloudListResult> {
    const client = CloudExplorerService.createS3Client(config);
    try {
      const result = await client.send(
        new ListObjectsV2Command({
          Bucket: bucketName,
          Prefix: prefix || undefined,
          Delimiter: '/',
          ContinuationToken: continuationToken,
          MaxKeys: 100,
        }),
      );

      const folders = (result.CommonPrefixes || []).map((folderPrefix) => ({
        name: folderPrefix.Prefix!,
        size: 0,
        updated: new Date(),
        isDirectory: true,
      }));

      const files = (result.Contents || [])
        .filter((obj) => obj.Key !== prefix)
        .map((obj) => ({
          name: obj.Key!,
          size: obj.Size || 0,
          updated: obj.LastModified || new Date(),
          contentType: undefined,
          isDirectory: false,
        }));

      return {
        objects: [...folders, ...files],
        nextPageToken: result.IsTruncated
          ? result.NextContinuationToken
          : undefined,
      };
    } catch (error) {
      throw new Error(`Error listing S3 objects: ${error}`);
    }
  }

  static async getS3DownloadUrl(
    config: S3Config,
    bucketName: string,
    objectKey: string,
  ): Promise<string> {
    const client = CloudExplorerService.createS3Client(config);
    try {
      const command = new GetObjectCommand({
        Bucket: bucketName,
        Key: objectKey,
      });
      return await getSignedUrl(client, command, { expiresIn: 3600 });
    } catch (error) {
      throw new Error(`Error generating S3 signed URL: ${error}`);
    }
  }

  static async testS3Connection(config: S3Config): Promise<boolean> {
    const client = CloudExplorerService.createS3Client(config);
    try {
      await client.send(new ListBucketsCommand({}));
      return true;
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('S3 connection test failed:', error);
      // Re-throw with user-friendly message
      const errorMessage = (error as Error).message;
      const errorName = (error as any).name;

      if (
        errorName === 'InvalidAccessKeyId' ||
        errorMessage.includes('InvalidAccessKeyId')
      ) {
        throw new Error(
          'Invalid AWS Access Key ID. Please check your credentials.',
        );
      } else if (
        errorName === 'SignatureDoesNotMatch' ||
        errorMessage.includes('SignatureDoesNotMatch')
      ) {
        throw new Error(
          'Invalid AWS Secret Access Key. Please check your credentials.',
        );
      } else if (
        errorName === 'InvalidClientTokenId' ||
        errorMessage.includes('security token')
      ) {
        throw new Error(
          'Invalid AWS credentials. Please verify your Access Key ID and Secret Access Key.',
        );
      } else if (
        errorMessage.includes('ENOTFOUND') ||
        errorMessage.includes('ECONNREFUSED')
      ) {
        throw new Error(
          'Cannot reach AWS S3. Check your internet connection and region.',
        );
      } else if (
        errorMessage.includes('AccessDenied') ||
        errorName === 'AccessDenied'
      ) {
        throw new Error(
          'AWS credentials are valid but lack permissions to list buckets.',
        );
      }
      throw new Error(`S3 connection failed: ${errorMessage}`);
    }
  }

  // Azure Blob Storage Methods
  private static createBlobServiceClient(
    config: AzureConfig,
  ): BlobServiceClient {
    if (config.connectionString) {
      return BlobServiceClient.fromConnectionString(config.connectionString);
    }

    // Validate credentials are provided
    if (!config.accountName || !config.accountKey) {
      throw new Error(
        'Azure credentials are required (Account Name and Account Key)',
      );
    }

    const credential = new StorageSharedKeyCredential(
      config.accountName,
      config.accountKey,
    );
    const url = `https://${config.accountName}.blob.core.windows.net`;
    return new BlobServiceClient(url, credential);
  }

  static async listAzureContainers(config: AzureConfig): Promise<Bucket[]> {
    const client = CloudExplorerService.createBlobServiceClient(config);
    try {
      const containers: Bucket[] = [];
      const containerIterator = client.listContainers();

      // Handle async iterator without for await
      const containerResults = [];
      let result = await containerIterator.next();
      while (!result.done) {
        containerResults.push(result.value);
        // eslint-disable-next-line no-await-in-loop
        result = await containerIterator.next();
      }

      containerResults.forEach((container) => {
        containers.push({
          name: container.name,
          created: container.properties.lastModified || new Date(),
          location: 'Azure',
        });
      });

      return containers;
    } catch (error) {
      throw new Error(`Error listing Azure containers: ${error}`);
    }
  }

  static async listAzureBlobs(
    config: AzureConfig,
    containerName: string,
    continuationToken?: string,
    prefix = '',
  ): Promise<CloudListResult> {
    const client = CloudExplorerService.createBlobServiceClient(config);
    const containerClient = client.getContainerClient(containerName);

    try {
      const result: StorageObject[] = [];

      const options = {
        prefix: prefix || undefined,
      };

      const listBlobsResponse = containerClient
        .listBlobsByHierarchy('/', options)
        .byPage({
          continuationToken,
          maxPageSize: 100,
        });

      const iterator = await listBlobsResponse.next();
      const page = iterator.value;

      (page.segment.blobPrefixes || []).forEach((blobPrefix: any) => {
        result.push({
          name: blobPrefix.name,
          size: 0,
          updated: new Date(),
          isDirectory: true,
        });
      });

      (page.segment.blobItems || []).forEach((blob: any) => {
        result.push({
          name: blob.name,
          size: blob.properties.contentLength || 0,
          updated: blob.properties.lastModified || new Date(),
          contentType: blob.properties.contentType,
          isDirectory: false,
        });
      });

      return {
        objects: result,
        nextPageToken: page.continuationToken,
      };
    } catch (error) {
      throw new Error(`Error listing Azure blobs: ${error}`);
    }
  }

  static async getAzureBlobDownloadUrl(
    config: AzureConfig,
    containerName: string,
    blobName: string,
  ): Promise<string> {
    const serviceClient = CloudExplorerService.createBlobServiceClient(config);
    const containerClient = serviceClient.getContainerClient(containerName);
    const blobClient = containerClient.getBlobClient(blobName);

    try {
      const expiresOn = new Date(new Date().valueOf() + 60 * 60 * 1000);
      const sas = generateBlobSASQueryParameters(
        {
          containerName,
          blobName,
          permissions: BlobSASPermissions.parse('r'),
          startsOn: new Date(),
          expiresOn,
          protocol: SASProtocol.Https,
        },
        new StorageSharedKeyCredential(
          config.accountName,
          config.accountKey || '',
        ),
      ).toString();

      return `${blobClient.url}?${sas}`;
    } catch (error) {
      throw new Error(`Error generating Azure blob SAS URL: ${error}`);
    }
  }

  static async testAzureConnection(config: AzureConfig): Promise<boolean> {
    const client = CloudExplorerService.createBlobServiceClient(config);
    try {
      const containerIterator = client.listContainers();
      const firstResult = await containerIterator.next();
      return !firstResult.done || firstResult.value !== undefined;
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('Azure connection test failed:', error);
      // Re-throw with user-friendly message
      const errorMessage = (error as Error).message;
      const errorCode = (error as any).code;

      if (
        errorCode === 'AuthenticationFailed' ||
        errorMessage.includes('AuthenticationFailed')
      ) {
        throw new Error(
          'Invalid Azure credentials. Please check your Account Name and Account Key.',
        );
      } else if (
        errorMessage.includes('AccountNotFound') ||
        errorCode === 'ResourceNotFound'
      ) {
        throw new Error(
          'Azure Storage Account not found. Please verify your Account Name.',
        );
      } else if (
        errorMessage.includes('ENOTFOUND') ||
        errorMessage.includes('ECONNREFUSED')
      ) {
        throw new Error(
          'Cannot reach Azure Blob Storage. Check your internet connection.',
        );
      } else if (errorMessage.includes('InvalidAuthenticationInfo')) {
        throw new Error(
          'Invalid Azure Account Key. Please check your credentials.',
        );
      }
      throw new Error(`Azure connection failed: ${errorMessage}`);
    }
  }

  // Google Cloud Storage Methods
  private static getStorageClient(config: GCSConfig): Storage {
    const options: any = {
      projectId: config.projectId,
    };

    if (config.credentials) {
      try {
        options.credentials =
          typeof config.credentials === 'string'
            ? JSON.parse(config.credentials)
            : config.credentials;
      } catch (error) {
        throw new Error('Invalid GCS credentials JSON format');
      }
    } else {
      // Don't allow falling back to ADC - require explicit credentials
      throw new Error('GCS credentials are required');
    }

    return new Storage(options);
  }

  static async listGCSBuckets(config: GCSConfig): Promise<Bucket[]> {
    try {
      const storage = CloudExplorerService.getStorageClient(config);
      const [buckets] = await storage.getBuckets();
      return buckets.map((bucket) => ({
        name: bucket.name,
        created: bucket.metadata.timeCreated
          ? new Date(bucket.metadata.timeCreated)
          : undefined,
        location: bucket.metadata.location,
      }));
    } catch (error) {
      throw new Error(`Error listing GCS buckets: ${error}`);
    }
  }

  static async listGCSObjects(
    config: GCSConfig,
    bucketName: string,
    pageToken?: string,
    prefix = '',
  ): Promise<CloudListResult> {
    try {
      const storage = CloudExplorerService.getStorageClient(config);

      const normalizedPrefix =
        prefix && !prefix.endsWith('/') ? `${prefix}/` : prefix;
      const bucket = storage.bucket(bucketName);

      const [files, , response] = await bucket.getFiles({
        prefix: normalizedPrefix,
        delimiter: '/',
        autoPaginate: false,
        pageToken,
        maxResults: 100,
      });

      const nextToken = (response as any)?.nextPageToken;

      const [, , prefixResponse] = await bucket.getFiles({
        prefix: normalizedPrefix,
        delimiter: '/',
        autoPaginate: false,
      });

      const prefixes = (prefixResponse as any)?.prefixes ?? [];

      const fileObjects = files
        .filter((file) => file.name !== normalizedPrefix)
        .map((file) => ({
          name: file.name,
          size: Number(file.metadata.size ?? '0'),
          contentType: file.metadata.contentType,
          updated: new Date(file.metadata.updated ?? ''),
          isDirectory: false,
        }));

      const directoryObjects = prefixes.map((folderPrefix: string) => ({
        name: folderPrefix,
        size: 0,
        updated: new Date(),
        isDirectory: true,
      }));

      return {
        objects: [...directoryObjects, ...fileObjects],
        nextPageToken: nextToken,
      };
    } catch (error) {
      throw new Error(`Error listing GCS objects: ${error}`);
    }
  }

  static async getGCSDownloadUrl(
    config: GCSConfig,
    bucketName: string,
    objectName: string,
  ): Promise<string> {
    try {
      const storage = CloudExplorerService.getStorageClient(config);
      const bucket = storage.bucket(bucketName);
      const file = bucket.file(objectName);

      const [url] = await file.getSignedUrl({
        action: 'read',
        expires: Date.now() + 15 * 60 * 1000,
      });

      return url;
    } catch (error) {
      throw new Error(`Error generating GCS download URL: ${error}`);
    }
  }

  static async testGCSConnection(config: GCSConfig): Promise<boolean> {
    try {
      const storage = CloudExplorerService.getStorageClient(config);
      await storage.getBuckets({ maxResults: 1 });
      return true;
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('GCS connection test failed:', error);
      // Re-throw with a user-friendly message
      const errorMessage = (error as Error).message;
      if (errorMessage.includes('BAD_BASE64_DECODE')) {
        throw new Error(
          'Invalid GCS service account credentials. Please check your JSON key file.',
        );
      } else if (
        errorMessage.includes('ENOTFOUND') ||
        errorMessage.includes('ECONNREFUSED')
      ) {
        throw new Error(
          'Cannot reach Google Cloud Storage. Check your internet connection.',
        );
      } else if (
        errorMessage.includes('invalid_grant') ||
        errorMessage.includes('unauthorized')
      ) {
        throw new Error(
          'GCS authentication failed. Verify your service account has the correct permissions.',
        );
      }
      throw new Error(`GCS connection failed: ${errorMessage}`);
    }
  }

  // Generic methods for different cloud providers
  static async listBuckets(
    provider: 'aws' | 'azure' | 'gcs',
    config: CloudStorageConfig,
  ): Promise<Bucket[]> {
    switch (provider) {
      case 'aws':
        return CloudExplorerService.listS3Buckets(config as S3Config);
      case 'azure':
        return CloudExplorerService.listAzureContainers(config as AzureConfig);
      case 'gcs':
        return CloudExplorerService.listGCSBuckets(config as GCSConfig);
      default:
        throw new Error(`Unsupported provider: ${provider}`);
    }
  }

  static async listObjects(
    provider: 'aws' | 'azure' | 'gcs',
    config: CloudStorageConfig,
    bucketName: string,
    continuationToken?: string,
    prefix = '',
  ): Promise<CloudListResult> {
    switch (provider) {
      case 'aws':
        return CloudExplorerService.listS3Objects(
          config as S3Config,
          bucketName,
          continuationToken,
          prefix,
        );
      case 'azure':
        return CloudExplorerService.listAzureBlobs(
          config as AzureConfig,
          bucketName,
          continuationToken,
          prefix,
        );
      case 'gcs':
        return CloudExplorerService.listGCSObjects(
          config as GCSConfig,
          bucketName,
          continuationToken,
          prefix,
        );
      default:
        throw new Error(`Unsupported provider: ${provider}`);
    }
  }

  static async getDownloadUrl(
    provider: 'aws' | 'azure' | 'gcs',
    config: CloudStorageConfig,
    bucketName: string,
    objectName: string,
  ): Promise<string> {
    switch (provider) {
      case 'aws':
        return CloudExplorerService.getS3DownloadUrl(
          config as S3Config,
          bucketName,
          objectName,
        );
      case 'azure':
        return CloudExplorerService.getAzureBlobDownloadUrl(
          config as AzureConfig,
          bucketName,
          objectName,
        );
      case 'gcs':
        return CloudExplorerService.getGCSDownloadUrl(
          config as GCSConfig,
          bucketName,
          objectName,
        );
      default:
        throw new Error(`Unsupported provider: ${provider}`);
    }
  }

  static async testConnection(
    provider: 'aws' | 'azure' | 'gcs',
    config: CloudStorageConfig,
  ): Promise<boolean> {
    switch (provider) {
      case 'aws':
        return CloudExplorerService.testS3Connection(config as S3Config);
      case 'azure':
        return CloudExplorerService.testAzureConnection(config as AzureConfig);
      case 'gcs':
        return CloudExplorerService.testGCSConnection(config as GCSConfig);
      default:
        throw new Error(`Unsupported provider: ${provider}`);
    }
  }
}

export default CloudExplorerService;
