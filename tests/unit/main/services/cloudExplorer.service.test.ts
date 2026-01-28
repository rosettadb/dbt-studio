const s3Send = jest.fn();
const getSignedUrl = jest.fn();

jest.mock('@aws-sdk/client-s3', () => {
  return {
    S3Client: jest.fn().mockImplementation(() => ({ send: (...args: any[]) => s3Send(...args) })),
    ListBucketsCommand: jest.fn().mockImplementation((input) => ({ input, __type: 'ListBucketsCommand' })),
    ListObjectsV2Command: jest
      .fn()
      .mockImplementation((input) => ({ input, __type: 'ListObjectsV2Command' })),
    GetObjectCommand: jest.fn().mockImplementation((input) => ({ input, __type: 'GetObjectCommand' })),
  };
});

jest.mock('@aws-sdk/s3-request-presigner', () => ({
  getSignedUrl: (...args: any[]) => getSignedUrl(...args),
}));

const storageGetBuckets = jest.fn();
jest.mock('@google-cloud/storage', () => ({
  Storage: jest.fn().mockImplementation(() => ({
    getBuckets: (...args: any[]) => storageGetBuckets(...args),
    bucket: jest.fn(),
  })),
}));

jest.mock('@azure/storage-blob', () => ({
  BlobServiceClient: {
    fromConnectionString: jest.fn(),
  },
  StorageSharedKeyCredential: jest.fn(),
  generateBlobSASQueryParameters: jest.fn(),
  BlobSASPermissions: { parse: jest.fn() },
  SASProtocol: { Https: 'Https' },
}));

import CloudExplorerService from '../../../../src/main/services/cloudExplorer.service';

describe('CloudExplorerService (main)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('AWS', () => {
    it('throws when AWS credentials are missing', async () => {
      await expect(
        CloudExplorerService.listBuckets('aws', { region: 'us-east-1' } as any),
      ).rejects.toThrow('AWS credentials are required');
    });

    it('listBuckets(aws) uses S3 client ListBucketsCommand', async () => {
      s3Send.mockResolvedValue({
        Buckets: [{ Name: 'b1', CreationDate: new Date('2020-01-01') }],
      });

      const result = await CloudExplorerService.listBuckets('aws', {
        region: 'us-east-1',
        accessKeyId: 'ak',
        secretAccessKey: 'sk',
      } as any);

      expect(s3Send).toHaveBeenCalledWith(
        expect.objectContaining({ __type: 'ListBucketsCommand' }),
      );
      expect(result).toEqual([
        {
          name: 'b1',
          created: new Date('2020-01-01'),
          location: 'us-east-1',
        },
      ]);
    });

    it('getDownloadUrl(aws) returns signed URL', async () => {
      getSignedUrl.mockResolvedValue('https://signed.example');

      const url = await CloudExplorerService.getDownloadUrl(
        'aws',
        {
          region: 'us-east-1',
          accessKeyId: 'ak',
          secretAccessKey: 'sk',
        } as any,
        'bucket',
        'file.csv',
      );

      expect(getSignedUrl).toHaveBeenCalledWith(
        expect.any(Object),
        expect.objectContaining({ __type: 'GetObjectCommand' }),
        { expiresIn: 3600 },
      );
      expect(url).toBe('https://signed.example');
    });
  });

  describe('GCS', () => {
    it('listBuckets(gcs) calls Storage.getBuckets and maps results', async () => {
      storageGetBuckets.mockResolvedValue([
        [
          {
            name: 'g1',
            metadata: { timeCreated: '2020-01-01T00:00:00Z', location: 'EU' },
          },
        ],
      ]);

      const result = await CloudExplorerService.listBuckets('gcs', {
        projectId: 'p',
        credentials: '{"client_email":"x","private_key":"y"}',
      } as any);

      expect(storageGetBuckets).toHaveBeenCalled();
      expect(result).toEqual([
        {
          name: 'g1',
          created: new Date('2020-01-01T00:00:00Z'),
          location: 'EU',
        },
      ]);
    });

    it('throws when GCS credentials are missing', async () => {
      await expect(
        CloudExplorerService.listBuckets('gcs', { projectId: 'p' } as any),
      ).rejects.toThrow('GCS credentials are required');
    });
  });
});
