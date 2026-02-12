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
  MinIOConfig,
  CloudflareR2Config,
  BackblazeB2Config,
  RustfsConfig,
  CloudStorageConfig,
  CloudProvider,
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
      default:
        throw new Error(`Unsupported provider: ${provider}`);
    }
  }
}

export default CloudExplorerService;
