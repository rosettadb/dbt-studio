import fs from 'fs';
import { Storage } from '@google-cloud/storage';
import {
  S3Client,
  ListBucketsCommand,
  ListObjectsV2Command,
  ListObjectsCommand,
  GetObjectCommand,
  PutObjectCommand,
  CreateMultipartUploadCommand,
  UploadPartCommand,
  CompleteMultipartUploadCommand,
  AbortMultipartUploadCommand,
  DeleteObjectCommand,
  DeleteObjectsCommand,
  CreateBucketCommand,
  DeleteBucketCommand,
  ListObjectVersionsCommand,
  HeadBucketCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import {
  BlobServiceClient,
  StorageSharedKeyCredential,
  generateBlobSASQueryParameters,
  BlobSASPermissions,
  SASProtocol,
} from '@azure/storage-blob';
import type { WebContents } from 'electron';
import {
  Bucket,
  StorageObject,
  CloudListResult,
  S3Config,
  AzureConfig,
  GCSConfig,
  MinIOConfig,
  CloudflareR2Config,
  BackblazeB2Config,
  RustfsConfig,
  GarageConfig,
  CloudStorageConfig,
  CloudProvider,
} from '../../types/frontend';
import {
  UploadFileRequest,
  UploadFileResponse,
  UploadFolderRequest,
  UploadFolderResponse,
  CreateBucketRequest,
  CreateBucketResponse,
  DeleteObjectRequest,
  DeleteObjectResponse,
  CreateFolderRequest,
  CreateFolderResponse,
  DeleteBucketRequest,
  DeleteBucketResponse,
  UPLOAD_SIZE_LIMIT_BYTES,
  MULTIPART_THRESHOLD_BYTES,
  S3_BATCH_DELETE_LIMIT,
} from '../../types/ipc';

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

    const credentials: {
      accessKeyId: string;
      secretAccessKey: string;
      sessionToken?: string;
    } = {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
    };

    if (config.sessionToken) {
      credentials.sessionToken = config.sessionToken;
    }

    return new S3Client({
      region: config.region,
      credentials,
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

  // MinIO Methods (S3-compatible)
  private static createMinIOClient(config: MinIOConfig): S3Client {
    // Validate credentials are provided
    if (!config.accessKeyId || !config.secretAccessKey) {
      throw new Error(
        'MinIO credentials are required (Access Key ID and Secret Access Key)',
      );
    }

    if (!config.endpoint) {
      throw new Error('MinIO endpoint is required');
    }

    // Strip protocol and trailing slashes from endpoint
    const cleanEndpoint = config.endpoint
      .replace(/^https?:\/\//, '') // Remove http:// or https://
      .replace(/\/$/, ''); // Remove trailing slash

    const protocol = config.useSSL ? 'https' : 'http';
    const endpoint = `${protocol}://${cleanEndpoint}`;

    return new S3Client({
      endpoint,
      region: config.region || 'us-east-1',
      credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
      },
      forcePathStyle: true, // Required for MinIO
    });
  }

  static async listMinIOBuckets(config: MinIOConfig): Promise<Bucket[]> {
    const client = CloudExplorerService.createMinIOClient(config);
    try {
      const data = await client.send(new ListBucketsCommand({}));
      return (data.Buckets || []).map((bucket) => ({
        name: bucket.Name!,
        created: bucket.CreationDate!,
        location: config.region || 'us-east-1',
      }));
    } catch (error) {
      throw new Error(`Error listing MinIO buckets: ${error}`);
    }
  }

  static async listMinIOObjects(
    config: MinIOConfig,
    bucketName: string,
    continuationToken?: string,
    prefix = '',
  ): Promise<CloudListResult> {
    const client = CloudExplorerService.createMinIOClient(config);
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
      throw new Error(`Error listing MinIO objects: ${error}`);
    }
  }

  static async getMinIODownloadUrl(
    config: MinIOConfig,
    bucketName: string,
    objectKey: string,
  ): Promise<string> {
    const client = CloudExplorerService.createMinIOClient(config);
    try {
      const command = new GetObjectCommand({
        Bucket: bucketName,
        Key: objectKey,
      });
      return await getSignedUrl(client, command, { expiresIn: 3600 });
    } catch (error) {
      throw new Error(`Error generating MinIO signed URL: ${error}`);
    }
  }

  static async testMinIOConnection(config: MinIOConfig): Promise<boolean> {
    const client = CloudExplorerService.createMinIOClient(config);
    try {
      await client.send(new ListBucketsCommand({}));
      return true;
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('MinIO connection test failed:', error);
      // Re-throw with user-friendly message
      const errorMessage = (error as Error).message;
      const errorName = (error as any).name;

      if (
        errorName === 'InvalidAccessKeyId' ||
        errorMessage.includes('InvalidAccessKeyId')
      ) {
        throw new Error(
          'Invalid MinIO Access Key ID. Please check your credentials in MinIO console.',
        );
      } else if (
        errorName === 'SignatureDoesNotMatch' ||
        errorMessage.includes('SignatureDoesNotMatch')
      ) {
        throw new Error(
          'Invalid MinIO Secret Access Key. Please verify your credentials.',
        );
      } else if (
        errorMessage.includes('ENOTFOUND') ||
        errorMessage.includes('getaddrinfo')
      ) {
        throw new Error(
          'Cannot resolve MinIO endpoint. Check your endpoint address.',
        );
      } else if (errorMessage.includes('ECONNREFUSED')) {
        throw new Error(
          'Cannot connect to MinIO server. Ensure the server is running at the specified endpoint.',
        );
      } else if (errorMessage.includes('ETIMEDOUT')) {
        throw new Error(
          'Connection to MinIO server timed out. Check your endpoint and network.',
        );
      } else if (
        errorMessage.includes('PermanentRedirect') ||
        errorName === 'PermanentRedirect'
      ) {
        throw new Error(
          'Bucket region mismatch. Check your region configuration.',
        );
      } else if (
        errorMessage.includes('AccessDenied') ||
        errorName === 'AccessDenied'
      ) {
        throw new Error(
          'MinIO credentials are valid but lack permissions to list buckets.',
        );
      } else if (
        errorMessage.includes('certificate') ||
        errorMessage.includes('SSL')
      ) {
        throw new Error(
          'SSL/TLS certificate error. Try disabling SSL or check your certificate configuration.',
        );
      }
      throw new Error(`MinIO connection failed: ${errorMessage}`);
    }
  }

  // Cloudflare R2 Methods (S3-compatible)
  private static createR2Client(config: CloudflareR2Config): S3Client {
    // Validate credentials are provided
    if (!config.accessKeyId || !config.secretAccessKey) {
      throw new Error(
        'Cloudflare R2 credentials are required (Access Key ID and Secret Access Key)',
      );
    }

    if (!config.accountId) {
      throw new Error('Cloudflare R2 Account ID is required');
    }

    // Validate account ID format
    // Cloudflare Account IDs are exactly 32 characters, alphanumeric
    if (!config.accountId || config.accountId.trim().length === 0) {
      throw new Error('Cloudflare R2 Account ID is required');
    }

    // Validation: must be exactly 32 alphanumeric characters
    if (!/^[a-zA-Z0-9]{32}$/.test(config.accountId)) {
      throw new Error('Account ID must be exactly 32 alphanumeric characters');
    }

    // Build R2 endpoint from account ID
    const jurisdiction = config.jurisdiction === 'eu' ? '.eu' : '';
    const endpoint = `https://${config.accountId}.r2.cloudflarestorage.com${jurisdiction}`;

    return new S3Client({
      endpoint,
      region: 'auto', // R2 uses 'auto' region
      credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
      },
    });
  }

  static async listR2Buckets(config: CloudflareR2Config): Promise<Bucket[]> {
    const client = CloudExplorerService.createR2Client(config);
    try {
      const data = await client.send(new ListBucketsCommand({}));
      return (data.Buckets || []).map((bucket) => ({
        name: bucket.Name!,
        created: bucket.CreationDate!,
        location: config.jurisdiction === 'eu' ? 'EU' : 'Global',
      }));
    } catch (error) {
      throw new Error(`Error listing Cloudflare R2 buckets: ${error}`);
    }
  }

  static async listR2Objects(
    config: CloudflareR2Config,
    bucketName: string,
    continuationToken?: string,
    prefix = '',
  ): Promise<CloudListResult> {
    const client = CloudExplorerService.createR2Client(config);
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
      throw new Error(`Error listing Cloudflare R2 objects: ${error}`);
    }
  }

  static async getR2DownloadUrl(
    config: CloudflareR2Config,
    bucketName: string,
    objectKey: string,
  ): Promise<string> {
    const client = CloudExplorerService.createR2Client(config);
    try {
      const command = new GetObjectCommand({
        Bucket: bucketName,
        Key: objectKey,
      });
      return await getSignedUrl(client, command, { expiresIn: 3600 });
    } catch (error) {
      throw new Error(`Error generating Cloudflare R2 signed URL: ${error}`);
    }
  }

  static async testR2Connection(config: CloudflareR2Config): Promise<boolean> {
    const client = CloudExplorerService.createR2Client(config);
    try {
      // Try ListBuckets first (requires Admin permissions)
      await client.send(new ListBucketsCommand({}));
      return true;
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error(
        'Cloudflare R2 ListBuckets failed, trying alternative test:',
        error,
      );

      // If ListBuckets fails with AccessDenied, it might be a permission issue
      // Try a simpler operation that works with Object Read & Write permissions
      const errorName = (error as any).name;
      if (
        errorName === 'AccessDenied' ||
        (error as any).Code === 'AccessDenied'
      ) {
        throw new Error(
          'R2 API token authenticated successfully, but lacks permission to list buckets. ' +
            'This token has "Object Read & Write" permissions but needs "Admin Read & Write" to list all buckets. ' +
            'Please create a new token with "Admin Read & Write" permissions in Cloudflare Dashboard → R2 → Manage R2 API Tokens.',
        );
      }

      // For other errors, use the existing error handling
      // eslint-disable-next-line no-console
      console.error('Cloudflare R2 connection test failed:', error);
      // eslint-disable-next-line no-console
      console.error('Error details:', {
        name: (error as any).name,
        message: (error as Error).message,
        code: (error as any).Code,
        statusCode: (error as any).$metadata?.httpStatusCode,
      });

      // Re-throw with user-friendly message
      const errorMessage = (error as Error).message;

      if (
        errorName === 'InvalidAccessKeyId' ||
        errorMessage.includes('InvalidAccessKeyId')
      ) {
        throw new Error(
          'Invalid R2 API token. Generate a new token in Cloudflare dashboard → R2 → Manage API Tokens.',
        );
      } else if (
        errorName === 'SignatureDoesNotMatch' ||
        errorMessage.includes('SignatureDoesNotMatch')
      ) {
        throw new Error(
          'Invalid R2 Secret Access Key. Please verify your credentials.',
        );
      } else if (
        errorMessage.includes('ENOTFOUND') ||
        errorMessage.includes('getaddrinfo')
      ) {
        throw new Error(
          'Cannot resolve Cloudflare R2 endpoint. Check your Account ID.',
        );
      } else if (errorMessage.includes('ECONNREFUSED')) {
        throw new Error(
          'Cannot connect to Cloudflare R2. Check your internet connection.',
        );
      } else if (errorMessage.includes('ETIMEDOUT')) {
        throw new Error(
          'Connection to Cloudflare R2 timed out. Check your network.',
        );
      } else if (
        errorMessage.includes('NoSuchBucket') ||
        errorName === 'NoSuchBucket'
      ) {
        throw new Error('Bucket not found. Verify bucket name and account ID.');
      } else if (errorMessage.includes('InvalidAccountId')) {
        throw new Error(
          'Invalid account ID. Must be a 32-character alphanumeric string.',
        );
      }
      throw new Error(`Cloudflare R2 connection failed: ${errorMessage}`);
    }
  }

  // ==================== Backblaze B2 Methods ====================

  private static createB2Client(config: BackblazeB2Config): S3Client {
    const endpoint = config.endpoint || 's3.us-west-004.backblazeb2.com';

    // Extract region from endpoint (e.g., 's3.us-west-004.backblazeb2.com' -> 'us-west-004')
    // or 's3.eu-central-003.backblazeb2.com' -> 'eu-central-003'
    const regionMatch = endpoint.match(/s3\.([^.]+-.+-\d+)\./);
    const region = regionMatch ? regionMatch[1] : 'us-west-004';

    return new S3Client({
      region,
      endpoint: `https://${endpoint}`,
      credentials: {
        accessKeyId: config.applicationKeyId,
        secretAccessKey: config.applicationKey,
      },
      // B2 requires virtual-hosted-style URLs (forcePathStyle: false is default)
      // AWS SDK v3 uses signature version 4 by default (required by B2)
      forcePathStyle: false,
    });
  }

  static async listB2Buckets(config: BackblazeB2Config): Promise<Bucket[]> {
    const client = CloudExplorerService.createB2Client(config);
    try {
      const command = new ListBucketsCommand({});
      const response = await client.send(command);
      return (
        response.Buckets?.map((bucket) => ({
          name: bucket.Name || '',
          created: bucket.CreationDate,
        })) || []
      );
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('Backblaze B2 ListBuckets failed:', error);
      throw new Error(`Error listing Backblaze B2 buckets: ${error}`);
    }
  }

  static async listB2Objects(
    config: BackblazeB2Config,
    bucketName: string,
    continuationToken?: string,
    prefix = '',
  ): Promise<CloudListResult> {
    const client = CloudExplorerService.createB2Client(config);
    try {
      const command = new ListObjectsV2Command({
        Bucket: bucketName,
        ContinuationToken: continuationToken,
        Prefix: prefix,
        Delimiter: '/',
      });
      const response = await client.send(command);

      const objects: StorageObject[] = [];

      // Add folders (common prefixes)
      if (response.CommonPrefixes) {
        response.CommonPrefixes.forEach((cp) => {
          if (cp.Prefix) {
            objects.push({
              name: cp.Prefix,
              size: 0,
              updated: new Date(),
              isDirectory: true,
            });
          }
        });
      }

      // Add files
      if (response.Contents) {
        response.Contents.forEach((obj) => {
          if (obj.Key && obj.Key !== prefix) {
            objects.push({
              name: obj.Key,
              size: obj.Size || 0,
              updated: obj.LastModified || new Date(),
              contentType: undefined,
              isDirectory: false,
            });
          }
        });
      }

      return {
        objects,
        nextPageToken: response.NextContinuationToken,
      };
    } catch (error) {
      throw new Error(`Error listing Backblaze B2 objects: ${error}`);
    }
  }

  static async getB2DownloadUrl(
    config: BackblazeB2Config,
    bucketName: string,
    objectKey: string,
  ): Promise<string> {
    const client = CloudExplorerService.createB2Client(config);
    try {
      const command = new GetObjectCommand({
        Bucket: bucketName,
        Key: objectKey,
      });
      return await getSignedUrl(client, command, { expiresIn: 3600 });
    } catch (error) {
      throw new Error(`Error generating Backblaze B2 signed URL: ${error}`);
    }
  }

  static async testB2Connection(config: BackblazeB2Config): Promise<boolean> {
    const client = CloudExplorerService.createB2Client(config);
    try {
      await client.send(new ListBucketsCommand({}));
      return true;
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('Backblaze B2 connection test failed:', error);
      // eslint-disable-next-line no-console
      console.error('Error details:', {
        name: (error as any).name,
        message: (error as Error).message,
        code: (error as any).Code,
        statusCode: (error as any).$metadata?.httpStatusCode,
      });

      // Re-throw with user-friendly message
      const errorMessage = (error as Error).message;
      const errorName = (error as any).name;

      if (
        errorName === 'InvalidAccessKeyId' ||
        errorMessage.includes('InvalidAccessKeyId')
      ) {
        throw new Error(
          'Invalid B2 Application Key ID. Check your credentials in Backblaze dashboard.',
        );
      } else if (
        errorName === 'SignatureDoesNotMatch' ||
        errorMessage.includes('SignatureDoesNotMatch')
      ) {
        throw new Error('Invalid B2 Application Key. Verify your credentials.');
      } else if (
        errorMessage.includes('ENOTFOUND') ||
        errorMessage.includes('getaddrinfo')
      ) {
        throw new Error(
          'Cannot resolve Backblaze B2 endpoint. Check your endpoint address.',
        );
      } else if (errorMessage.includes('ECONNREFUSED')) {
        throw new Error(
          'Cannot connect to Backblaze B2. Check your internet connection.',
        );
      } else if (errorMessage.includes('ETIMEDOUT')) {
        throw new Error(
          'Connection to Backblaze B2 timed out. Check your network.',
        );
      } else if (
        errorMessage.includes('NoSuchBucket') ||
        errorName === 'NoSuchBucket'
      ) {
        throw new Error('Bucket not found. Verify bucket name.');
      } else if (
        errorName === 'InvalidRequest' ||
        errorMessage.includes('InvalidRequest')
      ) {
        throw new Error(
          'B2 only supports S3 v4 signatures. Ensure your SDK is configured correctly.',
        );
      } else if (
        errorName === 'AccessDenied' ||
        errorMessage.includes('AccessDenied')
      ) {
        throw new Error(
          'Access denied. Check: 1) Application Key has correct permissions, 2) Key is applied to correct buckets, 3) Endpoint matches your B2 region.',
        );
      }
      throw new Error(`Backblaze B2 connection failed: ${errorMessage}`);
    }
  }

  // rustfs Methods (S3-compatible)
  private static createRustfsClient(config: RustfsConfig): S3Client {
    // Validate credentials are provided
    if (!config.accessKeyId || !config.secretAccessKey) {
      throw new Error(
        'rustfs credentials are required (Access Key ID and Secret Access Key)',
      );
    }

    if (!config.endpoint) {
      throw new Error('rustfs endpoint is required');
    }

    // Strip protocol and trailing slashes from endpoint
    const cleanEndpoint = config.endpoint
      .replace(/^https?:\/\//, '') // Remove http:// or https://
      .replace(/\/$/, ''); // Remove trailing slash

    const protocol = config.useSSL ? 'https' : 'http';
    const endpoint = `${protocol}://${cleanEndpoint}`;

    return new S3Client({
      endpoint,
      region: config.region || 'us-east-1',
      credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
      },
      forcePathStyle: true, // Required for rustfs (S3-compatible with path-style URLs)
      // AWS SDK v3.600+ adds CRC32 checksums by default; RustFS rejects them as InvalidArgument.
      // Only send checksums when the operation explicitly requires it.
      requestChecksumCalculation: 'WHEN_REQUIRED',
      responseChecksumValidation: 'WHEN_REQUIRED',
    });
  }

  static async listRustfsBuckets(config: RustfsConfig): Promise<Bucket[]> {
    const client = CloudExplorerService.createRustfsClient(config);
    try {
      const data = await client.send(new ListBucketsCommand({}));
      return (data.Buckets || []).map((bucket) => ({
        name: bucket.Name!,
        created: bucket.CreationDate!,
        location: config.region || 'us-east-1',
      }));
    } catch (error) {
      throw new Error(`Error listing rustfs buckets: ${error}`);
    }
  }

  static async listRustfsObjects(
    config: RustfsConfig,
    bucketName: string,
    continuationToken?: string,
    prefix = '',
  ): Promise<CloudListResult> {
    const client = CloudExplorerService.createRustfsClient(config);
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
      throw new Error(`Error listing rustfs objects: ${error}`);
    }
  }

  static async getRustfsDownloadUrl(
    config: RustfsConfig,
    bucketName: string,
    objectKey: string,
  ): Promise<string> {
    const client = CloudExplorerService.createRustfsClient(config);
    try {
      const command = new GetObjectCommand({
        Bucket: bucketName,
        Key: objectKey,
      });
      return await getSignedUrl(client, command, { expiresIn: 3600 });
    } catch (error) {
      throw new Error(`Error generating rustfs signed URL: ${error}`);
    }
  }

  static async testRustfsConnection(config: RustfsConfig): Promise<boolean> {
    const client = CloudExplorerService.createRustfsClient(config);
    try {
      await client.send(new ListBucketsCommand({}));
      return true;
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('rustfs connection test failed:', error);
      // Re-throw with user-friendly message
      const errorMessage = (error as Error).message;
      const errorName = (error as any).name;

      if (
        errorName === 'InvalidAccessKeyId' ||
        errorMessage.includes('InvalidAccessKeyId')
      ) {
        throw new Error(
          'Invalid rustfs Access Key ID. Please check your credentials.',
        );
      } else if (
        errorName === 'SignatureDoesNotMatch' ||
        errorMessage.includes('SignatureDoesNotMatch')
      ) {
        throw new Error(
          'Invalid rustfs Secret Access Key. Please verify your credentials.',
        );
      } else if (
        errorMessage.includes('ENOTFOUND') ||
        errorMessage.includes('getaddrinfo')
      ) {
        throw new Error(
          'Cannot resolve rustfs endpoint. Check your endpoint address.',
        );
      } else if (errorMessage.includes('ECONNREFUSED')) {
        throw new Error(
          'Cannot connect to rustfs server. Ensure the server is running at the specified endpoint.',
        );
      } else if (errorMessage.includes('ETIMEDOUT')) {
        throw new Error(
          'Connection to rustfs server timed out. Check your endpoint and network.',
        );
      } else if (
        errorMessage.includes('PermanentRedirect') ||
        errorName === 'PermanentRedirect'
      ) {
        throw new Error(
          'Bucket region mismatch. Check your region configuration.',
        );
      } else if (
        errorMessage.includes('AccessDenied') ||
        errorName === 'AccessDenied'
      ) {
        throw new Error(
          'rustfs credentials are valid but lack permissions to list buckets.',
        );
      } else if (
        errorMessage.includes('certificate') ||
        errorMessage.includes('SSL')
      ) {
        throw new Error(
          'SSL/TLS certificate error. Try disabling SSL or check your certificate configuration.',
        );
      } else if (
        errorMessage.includes('NetworkError') ||
        errorMessage.includes('network')
      ) {
        throw new Error(
          'Network error connecting to rustfs. Check endpoint URL format (http:// or https://).',
        );
      }
      throw new Error(`rustfs connection failed: ${errorMessage}`);
    }
  }

  // Garage Methods (S3-compatible)
  private static createGarageClient(config: GarageConfig): S3Client {
    // Validate credentials are provided
    if (!config.accessKeyId || !config.secretAccessKey) {
      throw new Error(
        'Garage credentials are required (Access Key ID and Secret Access Key)',
      );
    }

    if (!config.endpoint) {
      throw new Error('Garage endpoint is required');
    }

    // Strip protocol and trailing slashes from endpoint
    const cleanEndpoint = config.endpoint
      .replace(/^https?:\/\//, '') // Remove http:// or https://
      .replace(/\/$/, ''); // Remove trailing slash

    const protocol = config.useSSL ? 'https' : 'http';
    const endpoint = `${protocol}://${cleanEndpoint}`;

    // Default to path-style for broader compatibility with Garage deployments
    const forcePathStyle = config.urlStyle !== 'virtual-host';

    return new S3Client({
      endpoint,
      region: config.region || 'us-east-1',
      credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
      },
      forcePathStyle,
    });
  }

  static async listGarageBuckets(config: GarageConfig): Promise<Bucket[]> {
    const client = CloudExplorerService.createGarageClient(config);
    try {
      const data = await client.send(new ListBucketsCommand({}));
      return (data.Buckets || []).map((bucket) => ({
        name: bucket.Name!,
        created: bucket.CreationDate!,
        location: config.region || 'us-east-1',
      }));
    } catch (error) {
      throw new Error(`Error listing Garage buckets: ${error}`);
    }
  }

  static async listGarageObjects(
    config: GarageConfig,
    bucketName: string,
    continuationToken?: string,
    prefix = '',
  ): Promise<CloudListResult> {
    const client = CloudExplorerService.createGarageClient(config);
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
      throw new Error(`Error listing Garage objects: ${error}`);
    }
  }

  static async getGarageDownloadUrl(
    config: GarageConfig,
    bucketName: string,
    objectKey: string,
  ): Promise<string> {
    const client = CloudExplorerService.createGarageClient(config);
    try {
      const command = new GetObjectCommand({
        Bucket: bucketName,
        Key: objectKey,
      });
      return await getSignedUrl(client, command, { expiresIn: 3600 });
    } catch (error) {
      throw new Error(`Error generating Garage signed URL: ${error}`);
    }
  }

  static async testGarageConnection(config: GarageConfig): Promise<boolean> {
    const client = CloudExplorerService.createGarageClient(config);
    try {
      const data = await client.send(new ListBucketsCommand({}));
      const firstBucket = data.Buckets?.[0]?.Name;

      // Validate addressing mode (path vs virtual-host) with a bucket-scoped op
      if (firstBucket) {
        await client.send(new HeadBucketCommand({ Bucket: firstBucket }));
      }

      return true;
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('Garage Connection test failed:', error);

      const errorMessage = (error as Error).message;
      const errorName = (error as any).name;

      if (
        errorName === 'InvalidAccessKeyId' ||
        errorMessage.includes('InvalidAccessKeyId')
      ) {
        throw new Error(
          'Invalid Garage Access Key ID. Please check your credentials.',
        );
      } else if (
        errorName === 'SignatureDoesNotMatch' ||
        errorMessage.includes('SignatureDoesNotMatch')
      ) {
        throw new Error(
          'Invalid Garage Secret Access Key. Please verify your credentials.',
        );
      } else if (
        errorMessage.includes('ENOTFOUND') ||
        errorMessage.includes('getaddrinfo')
      ) {
        throw new Error(
          'Cannot resolve Garage endpoint. Check your endpoint address.',
        );
      } else if (errorMessage.includes('ECONNREFUSED')) {
        throw new Error(
          'Cannot connect to Garage server. Ensure the server is running at the specified endpoint.',
        );
      } else if (errorMessage.includes('ETIMEDOUT')) {
        throw new Error(
          'Connection to Garage server timed out. Check your endpoint and network.',
        );
      } else if (
        errorMessage.includes('PermanentRedirect') ||
        errorName === 'PermanentRedirect'
      ) {
        throw new Error(
          'Bucket region mismatch. Check your region configuration.',
        );
      } else if (
        errorMessage.includes('AccessDenied') ||
        errorName === 'AccessDenied'
      ) {
        throw new Error(
          'Garage credentials are valid but lack permissions to list buckets.',
        );
      } else if (
        errorMessage.includes('certificate') ||
        errorMessage.includes('SSL')
      ) {
        throw new Error(
          'SSL/TLS certificate error. Try disabling SSL or check your certificate configuration.',
        );
      } else if (
        errorMessage.includes('NetworkError') ||
        errorMessage.includes('network')
      ) {
        throw new Error(
          'Network error connecting to Garage. Check endpoint URL format (http:// or https://).',
        );
      }

      throw new Error(`Garage connection failed: ${errorMessage}`);
    }
  }

  // Generic methods for different cloud providers
  static async listBuckets(
    provider: CloudProvider,
    config: CloudStorageConfig,
  ): Promise<Bucket[]> {
    switch (provider) {
      case 'aws':
        return CloudExplorerService.listS3Buckets(config as S3Config);
      case 'azure':
        return CloudExplorerService.listAzureContainers(config as AzureConfig);
      case 'gcs':
        return CloudExplorerService.listGCSBuckets(config as GCSConfig);
      case 'minio':
        return CloudExplorerService.listMinIOBuckets(config as MinIOConfig);
      case 'cloudflare-r2':
        return CloudExplorerService.listR2Buckets(config as CloudflareR2Config);
      case 'backblaze-b2':
        return CloudExplorerService.listB2Buckets(config as BackblazeB2Config);
      case 'rustfs':
        return CloudExplorerService.listRustfsBuckets(config as RustfsConfig);
      case 'garage':
        return CloudExplorerService.listGarageBuckets(config as GarageConfig);
      default:
        throw new Error(`Unsupported provider: ${provider}`);
    }
  }

  static async listObjects(
    provider: CloudProvider,
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
      case 'minio':
        return CloudExplorerService.listMinIOObjects(
          config as MinIOConfig,
          bucketName,
          continuationToken,
          prefix,
        );
      case 'cloudflare-r2':
        return CloudExplorerService.listR2Objects(
          config as CloudflareR2Config,
          bucketName,
          continuationToken,
          prefix,
        );
      case 'backblaze-b2':
        return CloudExplorerService.listB2Objects(
          config as BackblazeB2Config,
          bucketName,
          continuationToken,
          prefix,
        );
      case 'rustfs':
        return CloudExplorerService.listRustfsObjects(
          config as RustfsConfig,
          bucketName,
          continuationToken,
          prefix,
        );
      case 'garage':
        return CloudExplorerService.listGarageObjects(
          config as GarageConfig,
          bucketName,
          continuationToken,
          prefix,
        );
      default:
        throw new Error(`Unsupported provider: ${provider}`);
    }
  }

  static async getDownloadUrl(
    provider: CloudProvider,
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
      case 'minio':
        return CloudExplorerService.getMinIODownloadUrl(
          config as MinIOConfig,
          bucketName,
          objectName,
        );
      case 'cloudflare-r2':
        return CloudExplorerService.getR2DownloadUrl(
          config as CloudflareR2Config,
          bucketName,
          objectName,
        );
      case 'backblaze-b2':
        return CloudExplorerService.getB2DownloadUrl(
          config as BackblazeB2Config,
          bucketName,
          objectName,
        );
      case 'rustfs':
        return CloudExplorerService.getRustfsDownloadUrl(
          config as RustfsConfig,
          bucketName,
          objectName,
        );
      case 'garage':
        return CloudExplorerService.getGarageDownloadUrl(
          config as GarageConfig,
          bucketName,
          objectName,
        );
      default:
        throw new Error(`Unsupported provider: ${provider}`);
    }
  }

  static async testConnection(
    provider: CloudProvider,
    config: CloudStorageConfig,
  ): Promise<boolean> {
    switch (provider) {
      case 'aws':
        return CloudExplorerService.testS3Connection(config as S3Config);
      case 'azure':
        return CloudExplorerService.testAzureConnection(config as AzureConfig);
      case 'gcs':
        return CloudExplorerService.testGCSConnection(config as GCSConfig);
      case 'minio':
        return CloudExplorerService.testMinIOConnection(config as MinIOConfig);
      case 'cloudflare-r2':
        return CloudExplorerService.testR2Connection(
          config as CloudflareR2Config,
        );
      case 'backblaze-b2':
        return CloudExplorerService.testB2Connection(
          config as BackblazeB2Config,
        );
      case 'rustfs':
        return CloudExplorerService.testRustfsConnection(
          config as RustfsConfig,
        );
      case 'garage':
        return CloudExplorerService.testGarageConnection(
          config as GarageConfig,
        );
      default:
        throw new Error(`Unsupported provider: ${provider}`);
    }
  }

  static validateBucketName(
    provider: CloudProvider,
    name: string,
  ): { valid: boolean; error?: string } {
    try {
      if (!name || name.length === 0) {
        return { valid: false, error: 'Bucket name must not be empty.' };
      }

      const ipAddressPattern = /^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/;

      if (provider === 'aws') {
        if (name.length < 3 || name.length > 63) {
          return {
            valid: false,
            error: 'Bucket name must be between 3 and 63 characters.',
          };
        }
        if (!/^[a-z0-9][a-z0-9-]*[a-z0-9]$/.test(name)) {
          return {
            valid: false,
            error:
              'Bucket name may only contain lowercase letters, numbers, and hyphens, and must start and end with a letter or number.',
          };
        }
        if (/--/.test(name)) {
          return {
            valid: false,
            error: 'Bucket name must not contain consecutive hyphens.',
          };
        }
        if (ipAddressPattern.test(name)) {
          return {
            valid: false,
            error: 'Bucket name must not be formatted as an IP address.',
          };
        }
        return { valid: true };
      }

      if (provider === 'azure') {
        if (name.length < 3 || name.length > 63) {
          return {
            valid: false,
            error: 'Container name must be between 3 and 63 characters.',
          };
        }
        if (!/^[a-z0-9][a-z0-9-]*$/.test(name)) {
          return {
            valid: false,
            error:
              'Container name may only contain lowercase letters, numbers, and hyphens, and must start with a letter or number.',
          };
        }
        return { valid: true };
      }

      if (provider === 'gcs') {
        if (name.length < 3 || name.length > 63) {
          return {
            valid: false,
            error: 'Bucket name must be between 3 and 63 characters.',
          };
        }
        if (!/^[a-z0-9][a-z0-9\-_.]*[a-z0-9]$/.test(name)) {
          return {
            valid: false,
            error:
              'Bucket name may only contain lowercase letters, numbers, hyphens, underscores, and dots, and must start and end with a letter or number.',
          };
        }
        if (name.startsWith('.') || name.endsWith('.')) {
          return {
            valid: false,
            error: 'Bucket name must not start or end with a dot.',
          };
        }
        if (name.includes('..')) {
          return {
            valid: false,
            error: 'Bucket name must not contain consecutive dots.',
          };
        }
        if (ipAddressPattern.test(name)) {
          return {
            valid: false,
            error: 'Bucket name must not be formatted as an IP address.',
          };
        }
        return { valid: true };
      }

      // For other providers (minio, cloudflare-r2, backblaze-b2, rustfs),
      // apply basic S3-compatible rules
      if (name.length < 3 || name.length > 63) {
        return {
          valid: false,
          error: 'Bucket name must be between 3 and 63 characters.',
        };
      }
      if (!/^[a-z0-9][a-z0-9-]*[a-z0-9]$/.test(name)) {
        return {
          valid: false,
          error:
            'Bucket name may only contain lowercase letters, numbers, and hyphens, and must start and end with a letter or number.',
        };
      }
      return { valid: true };
    } catch {
      return { valid: false, error: 'Bucket name validation failed.' };
    }
  }

  static sanitizeInput(input: string): string {
    let result = input;
    // Remove null bytes
    result = result.replace(/\0/g, '');
    // Remove path traversal sequences (both forward and back slash variants)
    // Repeat until no more sequences remain (handles nested patterns like ..../)
    let prev = '';
    while (prev !== result) {
      prev = result;
      result = result.replace(/\.\.\//g, '').replace(/\.\.\\/g, '');
    }
    // Remove leading slashes
    result = result.replace(/^\/+/, '');
    return result;
  }

  // ─── Write Operations ────────────────────────────────────────────────────────

  static async uploadFile(
    params: UploadFileRequest,
    webContents: WebContents,
  ): Promise<UploadFileResponse> {
    const { provider, config, bucketName, prefix, localFilePath, fileName } =
      params;

    // Don't sanitize localFilePath — it's an absolute OS path from the native file dialog
    const safePath = localFilePath;
    const safeBucket = CloudExplorerService.sanitizeInput(bucketName);
    const safePrefix = CloudExplorerService.sanitizeInput(prefix);
    const objectKey = safePrefix + fileName;

    try {
      const stat = await fs.promises.stat(safePath);
      if (stat.size >= UPLOAD_SIZE_LIMIT_BYTES) {
        throw new Error('File exceeds the 5 GB upload limit.');
      }

      const emitProgress = (loaded: number, total: number) => {
        const percentage = total > 0 ? Math.round((loaded / total) * 100) : 0;
        webContents.send('cloudExplorer:uploadProgress', {
          loaded,
          total,
          percentage,
        });
      };

      if (provider === 'aws') {
        const s3Config = config as S3Config;
        const client = CloudExplorerService.createS3Client(s3Config);
        const fileBuffer = await fs.promises.readFile(safePath);
        const fileSize = stat.size;

        if (fileSize > MULTIPART_THRESHOLD_BYTES) {
          // Multipart upload
          const createRes = await client.send(
            new CreateMultipartUploadCommand({
              Bucket: safeBucket,
              Key: objectKey,
            }),
          );
          const uploadId = createRes.UploadId!;
          const partSize = MULTIPART_THRESHOLD_BYTES; // 100 MB parts
          const parts: { ETag: string; PartNumber: number }[] = [];
          let uploadedBytes = 0;

          try {
            let partNumber = 1;
            for (let offset = 0; offset < fileSize; offset += partSize) {
              const chunk = fileBuffer.slice(offset, offset + partSize);
              // eslint-disable-next-line no-await-in-loop
              const partRes = await client.send(
                new UploadPartCommand({
                  Bucket: safeBucket,
                  Key: objectKey,
                  UploadId: uploadId,
                  PartNumber: partNumber,
                  Body: chunk,
                }),
              );
              parts.push({ ETag: partRes.ETag!, PartNumber: partNumber });
              uploadedBytes += chunk.length;
              emitProgress(uploadedBytes, fileSize);
              partNumber += 1;
            }

            await client.send(
              new CompleteMultipartUploadCommand({
                Bucket: safeBucket,
                Key: objectKey,
                UploadId: uploadId,
                MultipartUpload: { Parts: parts },
              }),
            );
          } catch (partError) {
            await client
              .send(
                new AbortMultipartUploadCommand({
                  Bucket: safeBucket,
                  Key: objectKey,
                  UploadId: uploadId,
                }),
              )
              .catch(() => {});
            throw partError;
          }
        } else {
          // Single-part upload
          await client.send(
            new PutObjectCommand({
              Bucket: safeBucket,
              Key: objectKey,
              Body: fileBuffer,
              ContentLength: stat.size,
            }),
          );
          emitProgress(stat.size, stat.size);
        }
      } else if (provider === 'azure') {
        const azureConfig = config as AzureConfig;
        const serviceClient =
          CloudExplorerService.createBlobServiceClient(azureConfig);
        const containerClient = serviceClient.getContainerClient(safeBucket);
        const blockBlobClient = containerClient.getBlockBlobClient(objectKey);
        await blockBlobClient.uploadFile(safePath, {
          onProgress: (ev) => emitProgress(ev.loadedBytes, stat.size),
        });
      } else if (provider === 'gcs') {
        const gcsConfig = config as GCSConfig;
        const storage = CloudExplorerService.getStorageClient(gcsConfig);
        const bucket = storage.bucket(safeBucket);
        await bucket.upload(safePath, {
          destination: objectKey,
          resumable: stat.size > MULTIPART_THRESHOLD_BYTES,
        });
        emitProgress(stat.size, stat.size);
      } else {
        // S3-compatible providers (minio, cloudflare-r2, backblaze-b2, garage, rustfs)
        let s3Client: S3Client;
        if (provider === 'minio') {
          s3Client = CloudExplorerService.createMinIOClient(
            config as MinIOConfig,
          );
        } else if (provider === 'cloudflare-r2') {
          s3Client = CloudExplorerService.createR2Client(
            config as CloudflareR2Config,
          );
        } else if (provider === 'backblaze-b2') {
          s3Client = CloudExplorerService.createB2Client(
            config as BackblazeB2Config,
          );
        } else if (provider === 'garage') {
          s3Client = CloudExplorerService.createGarageClient(
            config as GarageConfig,
          );
        } else {
          s3Client = CloudExplorerService.createRustfsClient(
            config as RustfsConfig,
          );
        }
        const fileBuffer = await fs.promises.readFile(safePath);
        await s3Client.send(
          new PutObjectCommand({
            Bucket: safeBucket,
            Key: objectKey,
            Body: fileBuffer,
            ContentLength: stat.size,
          }),
        );
        emitProgress(stat.size, stat.size);
      }

      return { success: true, objectKey };
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('CloudExplorerService.uploadFile error:', error);
      throw error;
    }
  }

  static async uploadFolder(
    params: UploadFolderRequest,
    webContents: WebContents,
  ): Promise<UploadFolderResponse> {
    const { provider, config, bucketName, prefix, localFolderPath } = params;
    const safeBucket = CloudExplorerService.sanitizeInput(bucketName);
    const safePrefix = CloudExplorerService.sanitizeInput(prefix);
    // Strip trailing slashes so split/pop reliably returns the folder name
    const normalizedFolderPath = localFolderPath.replace(/[\\/]+$/, '');

    // Recursively collect all files under the folder
    const collectFiles = async (dir: string): Promise<string[]> => {
      const entries = await fs.promises.readdir(dir, { withFileTypes: true });
      const nested = await Promise.all(
        entries.map((entry) => {
          const fullPath = `${dir}/${entry.name}`;
          return entry.isDirectory()
            ? collectFiles(fullPath)
            : Promise.resolve([fullPath]);
        }),
      );
      return ([] as string[]).concat(...nested);
    };

    const allFiles = await collectFiles(normalizedFolderPath);
    const folderName = normalizedFolderPath.split(/[\\/]/).pop() || 'folder';
    let uploadedCount = 0;
    let failedCount = 0;

    await allFiles.reduce(async (prev, filePath, i) => {
      await prev;
      const relativePath = filePath
        .slice(normalizedFolderPath.length)
        .replace(/^[\\/]/, '');
      const fileName = `${folderName}/${relativePath}`;

      webContents.send('cloudExplorer:uploadProgress', {
        loaded: i,
        total: allFiles.length,
        percentage: Math.round((i / allFiles.length) * 100),
        fileName: relativePath,
        fileIndex: i + 1,
        fileCount: allFiles.length,
      });

      try {
        await CloudExplorerService.uploadFile(
          {
            provider,
            config,
            bucketName: safeBucket,
            prefix: safePrefix,
            localFilePath: filePath,
            fileName,
          },
          webContents,
        );
        uploadedCount += 1;
      } catch (fileError) {
        // eslint-disable-next-line no-console
        console.error(`uploadFolder: failed to upload ${filePath}:`, fileError);
        failedCount += 1;
      }
    }, Promise.resolve());

    webContents.send('cloudExplorer:uploadProgress', {
      loaded: allFiles.length,
      total: allFiles.length,
      percentage: 100,
      fileIndex: allFiles.length,
      fileCount: allFiles.length,
    });

    return { success: failedCount === 0, uploadedCount, failedCount };
  }

  static async createBucket(
    params: CreateBucketRequest,
  ): Promise<CreateBucketResponse> {
    const { provider, config, bucketName, region } = params;
    const safeBucket = CloudExplorerService.sanitizeInput(bucketName);

    try {
      if (provider === 'aws') {
        const s3Config = config as S3Config;
        const client = CloudExplorerService.createS3Client(s3Config);
        const createParams: any = { Bucket: safeBucket };
        const effectiveRegion = region || s3Config.region;
        if (effectiveRegion && effectiveRegion !== 'us-east-1') {
          createParams.CreateBucketConfiguration = {
            LocationConstraint: effectiveRegion,
          };
        }
        await client.send(new CreateBucketCommand(createParams));
      } else if (provider === 'azure') {
        const azureConfig = config as AzureConfig;
        const serviceClient =
          CloudExplorerService.createBlobServiceClient(azureConfig);
        const containerClient = serviceClient.getContainerClient(safeBucket);
        await containerClient.create();
      } else if (provider === 'gcs') {
        const gcsConfig = config as GCSConfig;
        const storage = CloudExplorerService.getStorageClient(gcsConfig);
        await storage.createBucket(safeBucket, {
          location: region,
        });
      } else {
        // S3-compatible providers
        let s3Client: S3Client;
        if (provider === 'minio') {
          s3Client = CloudExplorerService.createMinIOClient(
            config as MinIOConfig,
          );
        } else if (provider === 'cloudflare-r2') {
          s3Client = CloudExplorerService.createR2Client(
            config as CloudflareR2Config,
          );
        } else if (provider === 'backblaze-b2') {
          s3Client = CloudExplorerService.createB2Client(
            config as BackblazeB2Config,
          );
        } else if (provider === 'garage') {
          s3Client = CloudExplorerService.createGarageClient(
            config as GarageConfig,
          );
        } else {
          s3Client = CloudExplorerService.createRustfsClient(
            config as RustfsConfig,
          );
        }
        await s3Client.send(new CreateBucketCommand({ Bucket: safeBucket }));
      }

      return { success: true, bucketName: safeBucket };
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('CloudExplorerService.createBucket error:', error);
      throw error;
    }
  }

  static async deleteBucket(
    params: DeleteBucketRequest,
  ): Promise<DeleteBucketResponse> {
    const { provider, config, bucketName } = params;
    const safeBucket = CloudExplorerService.sanitizeInput(bucketName);

    try {
      if (provider === 'aws') {
        const client = CloudExplorerService.createS3Client(config as S3Config);
        // Purge all object versions first (required for versioned buckets)
        await CloudExplorerService.purgeS3BucketVersions(client, safeBucket);
        await client.send(new DeleteBucketCommand({ Bucket: safeBucket }));
      } else if (provider === 'azure') {
        const serviceClient = CloudExplorerService.createBlobServiceClient(
          config as AzureConfig,
        );
        await serviceClient.getContainerClient(safeBucket).delete();
      } else if (provider === 'gcs') {
        const storage = CloudExplorerService.getStorageClient(
          config as GCSConfig,
        );
        const gcsBucket = storage.bucket(safeBucket);
        // Delete all files first, then the bucket
        const [files] = await gcsBucket.getFiles();
        await Promise.all(files.map((f) => f.delete()));
        await gcsBucket.delete();
      } else {
        let s3Client: S3Client;
        const useVersionPurge =
          provider !== 'minio' &&
          provider !== 'garage' &&
          provider !== 'rustfs';

        if (provider === 'minio') {
          s3Client = CloudExplorerService.createMinIOClient(
            config as MinIOConfig,
          );
        } else if (provider === 'cloudflare-r2') {
          s3Client = CloudExplorerService.createR2Client(
            config as CloudflareR2Config,
          );
        } else if (provider === 'backblaze-b2') {
          s3Client = CloudExplorerService.createB2Client(
            config as BackblazeB2Config,
          );
        } else if (provider === 'garage') {
          s3Client = CloudExplorerService.createGarageClient(
            config as GarageConfig,
          );
        } else {
          s3Client = CloudExplorerService.createRustfsClient(
            config as RustfsConfig,
          );
        }

        if (useVersionPurge) {
          // B2/R2: purge all object versions (handles hidden versions)
          await CloudExplorerService.purgeS3BucketVersions(
            s3Client,
            safeBucket,
          );
        } else if (provider === 'rustfs') {
          // RustFS: use ListObjects v1 (does not support v2)
          // eslint-disable-next-line no-console
          console.log('[rustfs] step 1: purging objects...');
          try {
            await CloudExplorerService.purgeRustfsBucketObjects(
              s3Client,
              safeBucket,
            );
            // eslint-disable-next-line no-console
            console.log('[rustfs] step 2: sending DeleteBucketCommand...');
          } catch (purgeErr) {
            // eslint-disable-next-line no-console
            console.error('[rustfs] purge failed:', purgeErr);
            throw purgeErr;
          }
        } else {
          // MinIO/Garage: use regular object listing + individual deletes
          await CloudExplorerService.purgeS3BucketObjects(s3Client, safeBucket);
        }
        await s3Client.send(new DeleteBucketCommand({ Bucket: safeBucket }));
      }
      return { success: true };
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('CloudExplorerService.deleteBucket error:', error);
      throw error;
    }
  }

  private static async purgeS3BucketObjects(
    client: S3Client,
    bucketName: string,
  ): Promise<void> {
    let continuationToken: string | undefined;
    do {
      // eslint-disable-next-line no-await-in-loop
      const listRes = await client.send(
        new ListObjectsV2Command({
          Bucket: bucketName,
          ContinuationToken: continuationToken,
        }),
      );
      const keys = (listRes.Contents || []).map((o) => o.Key!).filter(Boolean);
      // eslint-disable-next-line no-await-in-loop
      await keys.reduce(async (prev, key) => {
        await prev;
        await client.send(
          new DeleteObjectCommand({ Bucket: bucketName, Key: key }),
        );
      }, Promise.resolve());
      continuationToken = listRes.IsTruncated
        ? listRes.NextContinuationToken
        : undefined;
    } while (continuationToken);
  }

  // RustFS does not support ListObjectsV2 — use v1 listing instead.
  // Uses DeleteObjectsCommand (POST /?delete) instead of individual
  // DeleteObjectCommand (DELETE) to avoid CRC32 checksum header rejections
  // introduced in AWS SDK v3.600+ that cause RustFS to return InvalidArgument.
  private static async purgeRustfsBucketObjects(
    client: S3Client,
    bucketName: string,
  ): Promise<void> {
    let marker: string | undefined;
    do {
      // eslint-disable-next-line no-console
      console.log(`[rustfs] listing objects with marker: ${marker ?? 'none'}`);
      // eslint-disable-next-line no-await-in-loop
      const listRes = await client.send(
        new ListObjectsCommand({
          Bucket: bucketName,
          Marker: marker,
        }),
      );
      const keys = (listRes.Contents || []).map((o) => o.Key!).filter(Boolean);
      // eslint-disable-next-line no-console
      console.log(
        `[rustfs] deleting ${keys.length} objects via batch delete...`,
      );

      if (keys.length > 0) {
        // Use batch delete (POST /?delete) — avoids CRC32 header issues on DELETE requests
        // eslint-disable-next-line no-await-in-loop
        await client.send(
          new DeleteObjectsCommand({
            Bucket: bucketName,
            Delete: {
              Objects: keys.map((key) => ({ Key: key })),
              Quiet: true,
            },
          }),
        );
      }

      marker = listRes.IsTruncated
        ? listRes.Contents?.[listRes.Contents.length - 1]?.Key
        : undefined;
    } while (marker);
  }

  private static async purgeS3BucketVersions(
    client: S3Client,
    bucketName: string,
  ): Promise<void> {
    let keyMarker: string | undefined;
    let versionIdMarker: string | undefined;

    do {
      // eslint-disable-next-line no-await-in-loop
      const listRes = await client.send(
        new ListObjectVersionsCommand({
          Bucket: bucketName,
          KeyMarker: keyMarker,
          VersionIdMarker: versionIdMarker,
        }),
      );

      const objects = [
        ...(listRes.Versions || []).map((v) => ({
          Key: v.Key!,
          VersionId: v.VersionId,
        })),
        ...(listRes.DeleteMarkers || []).map((d) => ({
          Key: d.Key!,
          VersionId: d.VersionId,
        })),
      ];

      if (objects.length > 0) {
        // eslint-disable-next-line no-await-in-loop
        await client.send(
          new DeleteObjectsCommand({
            Bucket: bucketName,
            Delete: { Objects: objects, Quiet: true },
          }),
        );
      }

      keyMarker = listRes.IsTruncated ? listRes.NextKeyMarker : undefined;
      versionIdMarker = listRes.IsTruncated
        ? listRes.NextVersionIdMarker
        : undefined;
    } while (keyMarker);
  }

  static async deleteObject(
    params: DeleteObjectRequest,
    webContents?: WebContents,
  ): Promise<DeleteObjectResponse> {
    const { provider, config, bucketName, objectKey, isPrefix } = params;
    const safeBucket = CloudExplorerService.sanitizeInput(bucketName);
    const safeKey = CloudExplorerService.sanitizeInput(objectKey);

    try {
      if (!isPrefix) {
        // Single object delete
        if (provider === 'aws') {
          const client = CloudExplorerService.createS3Client(
            config as S3Config,
          );
          await client.send(
            new DeleteObjectCommand({ Bucket: safeBucket, Key: safeKey }),
          );
        } else if (provider === 'azure') {
          const serviceClient = CloudExplorerService.createBlobServiceClient(
            config as AzureConfig,
          );
          await serviceClient
            .getContainerClient(safeBucket)
            .getBlockBlobClient(safeKey)
            .delete();
        } else if (provider === 'gcs') {
          const storage = CloudExplorerService.getStorageClient(
            config as GCSConfig,
          );
          await storage.bucket(safeBucket).file(safeKey).delete();
        } else {
          let s3Client: S3Client;
          if (provider === 'minio') {
            s3Client = CloudExplorerService.createMinIOClient(
              config as MinIOConfig,
            );
          } else if (provider === 'cloudflare-r2') {
            s3Client = CloudExplorerService.createR2Client(
              config as CloudflareR2Config,
            );
          } else if (provider === 'backblaze-b2') {
            s3Client = CloudExplorerService.createB2Client(
              config as BackblazeB2Config,
            );
          } else if (provider === 'garage') {
            s3Client = CloudExplorerService.createGarageClient(
              config as GarageConfig,
            );
          } else {
            s3Client = CloudExplorerService.createRustfsClient(
              config as RustfsConfig,
            );
          }
          await s3Client.send(
            new DeleteObjectCommand({ Bucket: safeBucket, Key: safeKey }),
          );
        }
        return { success: true, deletedCount: 1 };
      }

      // Prefix (folder) delete — collect all keys then batch-delete
      const allKeys: string[] = [];

      if (provider === 'aws') {
        const client = CloudExplorerService.createS3Client(config as S3Config);
        let continuationToken: string | undefined;
        do {
          // eslint-disable-next-line no-await-in-loop
          const listRes = await client.send(
            new ListObjectsV2Command({
              Bucket: safeBucket,
              Prefix: safeKey,
              ContinuationToken: continuationToken,
            }),
          );
          (listRes.Contents || []).forEach((obj) => {
            if (obj.Key) allKeys.push(obj.Key);
          });
          continuationToken = listRes.IsTruncated
            ? listRes.NextContinuationToken
            : undefined;
        } while (continuationToken);

        // Batch delete in chunks of S3_BATCH_DELETE_LIMIT
        let deletedCount = 0;
        for (let i = 0; i < allKeys.length; i += S3_BATCH_DELETE_LIMIT) {
          const batch = allKeys.slice(i, i + S3_BATCH_DELETE_LIMIT);
          // eslint-disable-next-line no-await-in-loop
          await client.send(
            new DeleteObjectsCommand({
              Bucket: safeBucket,
              Delete: {
                Objects: batch.map((k) => ({ Key: k })),
                Quiet: true,
              },
            }),
          );
          deletedCount += batch.length;
          if (webContents) {
            webContents.send('cloudExplorer:uploadProgress', {
              loaded: deletedCount,
              total: allKeys.length,
              percentage: Math.round((deletedCount / allKeys.length) * 100),
            });
          }
        }
        return { success: true, deletedCount };
      }

      if (provider === 'azure') {
        const serviceClient = CloudExplorerService.createBlobServiceClient(
          config as AzureConfig,
        );
        const containerClient = serviceClient.getContainerClient(safeBucket);
        const blobIterator = containerClient.listBlobsFlat({ prefix: safeKey });
        let blobResult = await blobIterator.next();
        while (!blobResult.done) {
          allKeys.push(blobResult.value.name);
          // eslint-disable-next-line no-await-in-loop
          blobResult = await blobIterator.next();
        }
        let deletedCount = 0;
        // eslint-disable-next-line no-restricted-syntax
        await allKeys.reduce(async (prev, key) => {
          await prev;
          await containerClient.getBlockBlobClient(key).delete();
          deletedCount += 1;
          if (webContents) {
            webContents.send('cloudExplorer:uploadProgress', {
              loaded: deletedCount,
              total: allKeys.length,
              percentage: Math.round((deletedCount / allKeys.length) * 100),
            });
          }
        }, Promise.resolve());
        return { success: true, deletedCount };
      }

      if (provider === 'gcs') {
        const storage = CloudExplorerService.getStorageClient(
          config as GCSConfig,
        );
        const bucket = storage.bucket(safeBucket);
        const [files] = await bucket.getFiles({ prefix: safeKey });
        let deletedCount = 0;
        await files.reduce(async (prev, file) => {
          await prev;
          await file.delete();
          deletedCount += 1;
          if (webContents) {
            webContents.send('cloudExplorer:uploadProgress', {
              loaded: deletedCount,
              total: files.length,
              percentage: Math.round((deletedCount / files.length) * 100),
            });
          }
        }, Promise.resolve());
        return { success: true, deletedCount };
      }

      // S3-compatible prefix delete
      let s3Client: S3Client;
      if (provider === 'minio') {
        s3Client = CloudExplorerService.createMinIOClient(
          config as MinIOConfig,
        );
      } else if (provider === 'cloudflare-r2') {
        s3Client = CloudExplorerService.createR2Client(
          config as CloudflareR2Config,
        );
      } else if (provider === 'backblaze-b2') {
        s3Client = CloudExplorerService.createB2Client(
          config as BackblazeB2Config,
        );
      } else if (provider === 'garage') {
        s3Client = CloudExplorerService.createGarageClient(
          config as GarageConfig,
        );
      } else {
        s3Client = CloudExplorerService.createRustfsClient(
          config as RustfsConfig,
        );
      }
      let continuationToken: string | undefined;
      do {
        // eslint-disable-next-line no-await-in-loop
        const listRes = await s3Client.send(
          new ListObjectsV2Command({
            Bucket: safeBucket,
            Prefix: safeKey,
            ContinuationToken: continuationToken,
          }),
        );
        (listRes.Contents || []).forEach((obj) => {
          if (obj.Key) allKeys.push(obj.Key);
        });
        continuationToken = listRes.IsTruncated
          ? listRes.NextContinuationToken
          : undefined;
      } while (continuationToken);

      let deletedCount = 0;
      await allKeys.reduce(async (prev, key) => {
        await prev;
        await s3Client.send(
          new DeleteObjectCommand({ Bucket: safeBucket, Key: key }),
        );
        deletedCount += 1;
        if (webContents) {
          webContents.send('cloudExplorer:uploadProgress', {
            loaded: deletedCount,
            total: allKeys.length,
            percentage: Math.round((deletedCount / allKeys.length) * 100),
          });
        }
      }, Promise.resolve());
      return { success: true, deletedCount };
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('CloudExplorerService.deleteObject error:', error);
      throw error;
    }
  }

  static async createFolder(
    params: CreateFolderRequest,
  ): Promise<CreateFolderResponse> {
    const { provider, config, bucketName, prefix, folderName } = params;
    const safeBucket = CloudExplorerService.sanitizeInput(bucketName);
    const safePrefix = CloudExplorerService.sanitizeInput(prefix);
    const safeName = CloudExplorerService.sanitizeInput(folderName);
    const objectKey = `${safePrefix}${safeName}/`;
    const emptyBuffer = Buffer.alloc(0);

    try {
      if (provider === 'aws') {
        const client = CloudExplorerService.createS3Client(config as S3Config);
        await client.send(
          new PutObjectCommand({
            Bucket: safeBucket,
            Key: objectKey,
            Body: emptyBuffer,
            ContentLength: 0,
            ContentType: 'application/x-directory',
          }),
        );
      } else if (provider === 'azure') {
        const serviceClient = CloudExplorerService.createBlobServiceClient(
          config as AzureConfig,
        );
        const blockBlobClient = serviceClient
          .getContainerClient(safeBucket)
          .getBlockBlobClient(objectKey);
        await blockBlobClient.upload('', 0, {
          blobHTTPHeaders: { blobContentType: 'application/x-directory' },
        });
      } else if (provider === 'gcs') {
        const storage = CloudExplorerService.getStorageClient(
          config as GCSConfig,
        );
        const file = storage.bucket(safeBucket).file(objectKey);
        await file.save(emptyBuffer, {
          contentType: 'application/x-directory',
        });
      } else {
        // S3-compatible providers
        let s3Client: S3Client;
        if (provider === 'minio') {
          s3Client = CloudExplorerService.createMinIOClient(
            config as MinIOConfig,
          );
        } else if (provider === 'cloudflare-r2') {
          s3Client = CloudExplorerService.createR2Client(
            config as CloudflareR2Config,
          );
        } else if (provider === 'backblaze-b2') {
          s3Client = CloudExplorerService.createB2Client(
            config as BackblazeB2Config,
          );
        } else if (provider === 'garage') {
          s3Client = CloudExplorerService.createGarageClient(
            config as GarageConfig,
          );
        } else {
          s3Client = CloudExplorerService.createRustfsClient(
            config as RustfsConfig,
          );
        }
        await s3Client.send(
          new PutObjectCommand({
            Bucket: safeBucket,
            Key: objectKey,
            Body: emptyBuffer,
            ContentLength: 0,
            ContentType: 'application/x-directory',
          }),
        );
      }

      return { success: true, objectKey };
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('CloudExplorerService.createFolder error:', error);
      throw error;
    }
  }
}

export default CloudExplorerService;
