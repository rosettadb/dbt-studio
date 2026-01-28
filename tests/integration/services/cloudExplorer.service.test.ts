import { mockClient } from 'aws-sdk-client-mock';
import {
  S3Client,
  ListBucketsCommand,
  ListObjectsV2Command,
} from '@aws-sdk/client-s3';
import CloudExplorerService from '../../../src/main/services/cloudExplorer.service';

// Mock AWS SDK
const s3Mock = mockClient(S3Client);

// Mock Azure Storage Blob - simplified for testing
jest.mock('@azure/storage-blob');

// Mock Google Cloud Storage - simplified for testing
jest.mock('@google-cloud/storage');

describe('CloudExplorer Service Integration', () => {
  beforeEach(() => {
    s3Mock.reset();
    jest.clearAllMocks();
  });

  describe('AWS S3', () => {
    const s3Config = {
      accessKeyId: 'test-access-key',
      secretAccessKey: 'test-secret-key',
      region: 'us-east-1',
    };

    describe('listS3Buckets', () => {
      it('should list S3 buckets successfully', async () => {
        s3Mock.on(ListBucketsCommand).resolves({
          Buckets: [
            {
              Name: 'bucket-1',
              CreationDate: new Date('2024-01-01'),
            },
            {
              Name: 'bucket-2',
              CreationDate: new Date('2024-01-02'),
            },
          ],
        });

        const buckets = await CloudExplorerService.listS3Buckets(s3Config);

        expect(buckets).toHaveLength(2);
        expect(buckets[0].name).toBe('bucket-1');
        expect(buckets[1].name).toBe('bucket-2');
        expect(buckets[0].location).toBe('us-east-1');
      });

      it('should handle empty bucket list', async () => {
        s3Mock.on(ListBucketsCommand).resolves({
          Buckets: [],
        });

        const buckets = await CloudExplorerService.listS3Buckets(s3Config);

        expect(buckets).toHaveLength(0);
      });

      it('should throw error on S3 failure', async () => {
        s3Mock.on(ListBucketsCommand).rejects(new Error('S3 Error'));

        await expect(
          CloudExplorerService.listS3Buckets(s3Config),
        ).rejects.toThrow('Error listing S3 buckets');
      });

      it('should require credentials', async () => {
        const invalidConfig = {
          accessKeyId: '',
          secretAccessKey: '',
          region: 'us-east-1',
        };

        await expect(
          CloudExplorerService.listS3Buckets(invalidConfig),
        ).rejects.toThrow('AWS credentials are required');
      });
    });

    describe('listS3Objects', () => {
      it('should list objects in S3 bucket', async () => {
        s3Mock.on(ListObjectsV2Command).resolves({
          Contents: [
            {
              Key: 'file1.txt',
              Size: 1024,
              LastModified: new Date('2024-01-01'),
            },
            {
              Key: 'file2.csv',
              Size: 2048,
              LastModified: new Date('2024-01-02'),
            },
          ],
          CommonPrefixes: [
            {
              Prefix: 'folder1/',
            },
          ],
          IsTruncated: false,
        });

        const result = await CloudExplorerService.listS3Objects(
          s3Config,
          'test-bucket',
        );

        expect(result.objects).toHaveLength(3);
        expect(result.objects[0].isDirectory).toBe(true);
        expect(result.objects[0].name).toBe('folder1/');
        expect(result.objects[1].name).toBe('file1.txt');
        expect(result.objects[1].size).toBe(1024);
        expect(result.nextPageToken).toBeUndefined();
      });

      it('should handle pagination', async () => {
        s3Mock.on(ListObjectsV2Command).resolves({
          Contents: [
            {
              Key: 'file1.txt',
              Size: 1024,
              LastModified: new Date('2024-01-01'),
            },
          ],
          IsTruncated: true,
          NextContinuationToken: 'next-token-123',
        });

        const result = await CloudExplorerService.listS3Objects(
          s3Config,
          'test-bucket',
        );

        expect(result.nextPageToken).toBe('next-token-123');
      });

      it('should handle prefix filtering', async () => {
        s3Mock.on(ListObjectsV2Command).resolves({
          Contents: [
            {
              Key: 'data/file1.txt',
              Size: 1024,
              LastModified: new Date('2024-01-01'),
            },
          ],
          IsTruncated: false,
        });

        const result = await CloudExplorerService.listS3Objects(
          s3Config,
          'test-bucket',
          undefined,
          'data/',
        );

        expect(result.objects).toHaveLength(1);
        expect(result.objects[0].name).toBe('data/file1.txt');
      });

      it('should filter out prefix from results', async () => {
        s3Mock.on(ListObjectsV2Command).resolves({
          Contents: [
            {
              Key: 'data/',
              Size: 0,
              LastModified: new Date('2024-01-01'),
            },
            {
              Key: 'data/file1.txt',
              Size: 1024,
              LastModified: new Date('2024-01-01'),
            },
          ],
          IsTruncated: false,
        });

        const result = await CloudExplorerService.listS3Objects(
          s3Config,
          'test-bucket',
          undefined,
          'data/',
        );

        // Should filter out the prefix itself
        expect(result.objects).toHaveLength(1);
        expect(result.objects[0].name).toBe('data/file1.txt');
      });
    });

    describe('getS3DownloadUrl', () => {
      it('should generate signed URL', async () => {
        // The getSignedUrl function is mocked by aws-sdk-client-mock
        const url = await CloudExplorerService.getS3DownloadUrl(
          s3Config,
          'test-bucket',
          'file.txt',
        );

        expect(url).toBeDefined();
        expect(typeof url).toBe('string');
      });
    });

    describe('testS3Connection', () => {
      it('should return true for valid connection', async () => {
        s3Mock.on(ListBucketsCommand).resolves({
          Buckets: [],
        });

        const result = await CloudExplorerService.testS3Connection(s3Config);

        expect(result).toBe(true);
      });

      it('should throw user-friendly error for invalid access key', async () => {
        const error: any = new Error('InvalidAccessKeyId');
        error.name = 'InvalidAccessKeyId';
        s3Mock.on(ListBucketsCommand).rejects(error);

        await expect(
          CloudExplorerService.testS3Connection(s3Config),
        ).rejects.toThrow('Invalid AWS Access Key ID');
      });

      it('should throw user-friendly error for invalid secret key', async () => {
        const error: any = new Error('SignatureDoesNotMatch');
        error.name = 'SignatureDoesNotMatch';
        s3Mock.on(ListBucketsCommand).rejects(error);

        await expect(
          CloudExplorerService.testS3Connection(s3Config),
        ).rejects.toThrow('Invalid AWS Secret Access Key');
      });

      it('should throw user-friendly error for access denied', async () => {
        const error: any = new Error('AccessDenied');
        error.name = 'AccessDenied';
        s3Mock.on(ListBucketsCommand).rejects(error);

        await expect(
          CloudExplorerService.testS3Connection(s3Config),
        ).rejects.toThrow('lack permissions to list buckets');
      });

      it('should throw user-friendly error for network issues', async () => {
        const error: any = new Error('ENOTFOUND');
        s3Mock.on(ListBucketsCommand).rejects(error);

        await expect(
          CloudExplorerService.testS3Connection(s3Config),
        ).rejects.toThrow('Cannot reach AWS S3');
      });
    });
  });

  describe('Generic Provider Methods', () => {
    describe('listBuckets', () => {
      it('should route to correct provider - AWS', async () => {
        s3Mock.on(ListBucketsCommand).resolves({
          Buckets: [{ Name: 'test-bucket', CreationDate: new Date() }],
        });

        const buckets = await CloudExplorerService.listBuckets('aws', {
          accessKeyId: 'test',
          secretAccessKey: 'test',
          region: 'us-east-1',
        });

        expect(buckets).toHaveLength(1);
        expect(buckets[0].name).toBe('test-bucket');
      });

      it('should throw error for unsupported provider', async () => {
        await expect(
          CloudExplorerService.listBuckets('unknown' as any, {} as any),
        ).rejects.toThrow('Unsupported provider');
      });
    });

    describe('listObjects', () => {
      it('should route to correct provider - AWS', async () => {
        s3Mock.on(ListObjectsV2Command).resolves({
          Contents: [
            {
              Key: 'file.txt',
              Size: 100,
              LastModified: new Date(),
            },
          ],
          IsTruncated: false,
        });

        const result = await CloudExplorerService.listObjects(
          'aws',
          {
            accessKeyId: 'test',
            secretAccessKey: 'test',
            region: 'us-east-1',
          },
          'test-bucket',
        );

        expect(result.objects).toHaveLength(1);
      });

      it('should throw error for unsupported provider', async () => {
        await expect(
          CloudExplorerService.listObjects(
            'unknown' as any,
            {} as any,
            'bucket',
          ),
        ).rejects.toThrow('Unsupported provider');
      });
    });

    describe('getDownloadUrl', () => {
      it('should route to correct provider - AWS', async () => {
        const url = await CloudExplorerService.getDownloadUrl(
          'aws',
          {
            accessKeyId: 'test',
            secretAccessKey: 'test',
            region: 'us-east-1',
          },
          'test-bucket',
          'file.txt',
        );

        expect(url).toBeDefined();
        expect(typeof url).toBe('string');
      });

      it('should throw error for unsupported provider', async () => {
        await expect(
          CloudExplorerService.getDownloadUrl(
            'unknown' as any,
            {} as any,
            'bucket',
            'file',
          ),
        ).rejects.toThrow('Unsupported provider');
      });
    });

    describe('testConnection', () => {
      it('should route to correct provider - AWS', async () => {
        s3Mock.on(ListBucketsCommand).resolves({ Buckets: [] });

        const result = await CloudExplorerService.testConnection('aws', {
          accessKeyId: 'test',
          secretAccessKey: 'test',
          region: 'us-east-1',
        });

        expect(result).toBe(true);
      });

      it('should throw error for unsupported provider', async () => {
        await expect(
          CloudExplorerService.testConnection('unknown' as any, {} as any),
        ).rejects.toThrow('Unsupported provider');
      });
    });
  });
});
