const mockSend = jest.fn();
const mockDestroy = jest.fn();

jest.mock('@aws-sdk/client-s3', () => ({
  S3Client: jest
    .fn()
    .mockImplementation(() => ({ send: mockSend, destroy: mockDestroy })),
  ListObjectsV2Command: jest.fn().mockImplementation((input) => ({ input })),
}));
jest.mock('@aws-sdk/s3-request-presigner', () => ({ getSignedUrl: jest.fn() }));

import CloudExplorerService from '../../../../src/main/services/cloudExplorer.service';
import type {
  CloudProvider,
  CloudStorageConfig,
} from '../../../../src/types/frontend';

const config = {
  region: 'us-east-1',
  accessKeyId: 'test-key',
  secretAccessKey: 'test-secret',
};
const providers: Array<[CloudProvider, CloudStorageConfig]> = [
  ['aws', config],
  ['minio', { ...config, endpoint: 'localhost:9000' }],
  ['cloudflare-r2', { ...config, accountId: 'a'.repeat(32) }],
  [
    'backblaze-b2',
    { applicationKeyId: 'test-key', applicationKey: 'test-secret' },
  ],
  ['rustfs', { ...config, endpoint: 'localhost:9000' }],
  ['garage', { ...config, endpoint: 'localhost:9000' }],
];

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('Cloud Explorer directory listing and background totals', () => {
  beforeEach(() => {
    mockSend.mockReset();
    mockDestroy.mockClear();
  });

  it.each(providers)(
    'lists %s immediately without scanning descendants',
    async (provider, storageConfig) => {
      mockSend.mockImplementation(async (command) => {
        if (!command.input.Delimiter) return new Promise(() => {});
        return {
          CommonPrefixes: [{ Prefix: 'outer/inner/' }],
          Contents: [{ Key: 'outer/file.bin', Size: 1024 ** 3 }],
          IsTruncated: true,
          NextContinuationToken: 'next-page',
        };
      });
      const result = await CloudExplorerService.listObjects(
        provider,
        storageConfig,
        'bucket',
        'page',
        'outer/',
      );
      expect(mockSend).toHaveBeenCalledTimes(1);
      expect(mockSend.mock.calls[0][0].input).toMatchObject({
        Prefix: 'outer/',
        Delimiter: '/',
        ContinuationToken: 'page',
      });
      expect(result.nextPageToken).toBe('next-page');
      expect(result.objects[0]).toMatchObject({
        name: 'outer/inner/',
        isDirectory: true,
        folderMetadataStatus: 'pending',
      });
      expect(result.objects[1]).toMatchObject({
        name: 'outer/file.bin',
        size: 1024 ** 3,
        isDirectory: false,
      });
    },
  );

  it('calculates total size and latest modified date across all metadata pages', async () => {
    mockSend
      .mockResolvedValueOnce({
        Contents: [{ Size: 1024 ** 3, LastModified: new Date('2026-01-01') }],
        IsTruncated: true,
        NextContinuationToken: 'second-page',
      })
      .mockResolvedValueOnce({
        Contents: [{ Size: 9, LastModified: new Date('2026-10-06') }],
        IsTruncated: false,
      });
    await expect(
      CloudExplorerService.getFolderMetadata('aws', config, 'bucket', 'outer/'),
    ).resolves.toEqual({
      size: 1024 ** 3 + 9,
      updated: new Date('2026-10-06'),
    });
    expect(mockSend.mock.calls.map(([command]) => command.input)).toEqual([
      {
        Bucket: 'bucket',
        Prefix: 'outer/',
        ContinuationToken: undefined,
        MaxKeys: 1000,
      },
      {
        Bucket: 'bucket',
        Prefix: 'outer/',
        ContinuationToken: 'second-page',
        MaxKeys: 1000,
      },
    ]);
    expect(mockDestroy).toHaveBeenCalledTimes(1);
  });

  it('limits scans to two, releases a failed slot, and keeps navigation independent', async () => {
    const gates = Array.from({ length: 4 }, () => deferred<any>());
    let started = 0;
    mockSend.mockImplementation((command) => {
      if (command.input.Delimiter)
        return Promise.resolve({ CommonPrefixes: [{ Prefix: 'next/' }] });
      const gate = gates[started];
      started += 1;
      return gate.promise;
    });
    const scans = gates.map((_, index) =>
      CloudExplorerService.getFolderMetadata(
        'aws',
        config,
        'bucket',
        `folder-${index}/`,
      ),
    );
    const results = Promise.allSettled(scans);
    await tick();
    expect(started).toBe(2);
    await expect(
      CloudExplorerService.listS3Objects(config, 'bucket'),
    ).resolves.toMatchObject({
      objects: [{ name: 'next/', folderMetadataStatus: 'pending' }],
    });
    expect(started).toBe(2);
    gates[0].reject(new Error('AccessDenied'));
    await tick();
    expect(started).toBe(3);
    gates[1].resolve({ Contents: [] });
    await tick();
    expect(started).toBe(4);
    gates[2].resolve({ Contents: [] });
    gates[3].resolve({ Contents: [] });
    const outcomes = await results;
    expect(outcomes[0].status).toBe('rejected');
    expect(
      outcomes.slice(1).every((result) => result.status === 'fulfilled'),
    ).toBe(true);
    expect(mockDestroy).toHaveBeenCalledTimes(4);
  });

  it('rejects an empty prefix instead of scanning the entire bucket', async () => {
    await expect(
      CloudExplorerService.getFolderMetadata('aws', config, 'bucket', ''),
    ).rejects.toThrow('folder prefix');
    expect(mockSend).not.toHaveBeenCalled();
  });
});
