/** @jest-environment-options {"customExportConditions": ["node", "node-addons"]} */
import { Readable } from 'stream';
import { ListObjectsV2Command, S3Client } from '@aws-sdk/client-s3';
import CloudExplorerService from '../../../../src/main/services/cloudExplorer.service';
import { buildCloudSecretQuery } from '../../../../src/main/helpers/cloudAuth.helper';
import type { S3Config } from '../../../../src/types/frontend';

const config: S3Config = {
  authMode: 'public',
  bucket: 'public-data',
  region: 'us-west-2',
};

describe('Public S3 connections', () => {
  afterEach(() => jest.restoreAllMocks());

  it('offers the named bucket without calling account-level ListBuckets', async () => {
    const send = jest.spyOn(S3Client.prototype, 'send');
    await expect(CloudExplorerService.listS3Buckets(config)).resolves.toEqual([
      { name: 'public-data', location: 'us-west-2' },
    ]);
    expect(send).not.toHaveBeenCalled();
    await expect(
      CloudExplorerService.listS3Buckets({ ...config, bucket: '' }),
    ).rejects.toThrow('bucket name is required');
  });

  it('tests anonymous bucket listing and explains access denial', async () => {
    const send = jest
      .spyOn(S3Client.prototype, 'send')
      .mockResolvedValue({} as never);
    await expect(CloudExplorerService.testS3Connection(config)).resolves.toBe(
      true,
    );
    expect(send).toHaveBeenCalledWith(
      expect.objectContaining({
        input: { Bucket: 'public-data', MaxKeys: 1 },
      }),
    );
    send.mockImplementation(async () => {
      throw Object.assign(new Error('AccessDenied'), { name: 'AccessDenied' });
    });
    jest.spyOn(console, 'error').mockImplementation(() => {});
    await expect(CloudExplorerService.testS3Connection(config)).rejects.toThrow(
      'anonymous listing permission',
    );
  });

  it('sends unsigned SDK requests even when supplied credentials exist', async () => {
    const client: S3Client = (CloudExplorerService as any).createS3Client({
      ...config,
      accessKeyId: 'ignored-key',
      secretAccessKey: 'ignored-secret',
      sessionToken: 'ignored-token',
    });
    const handle = jest.fn(async (_request: any) => ({
      response: {
        statusCode: 200,
        headers: { 'content-type': 'application/xml' },
        body: Readable.from([
          '<ListBucketResult><IsTruncated>false</IsTruncated></ListBucketResult>',
        ]),
      },
    }));
    const credentials = jest.fn(async () => {
      throw new Error('Credential chain must not run');
    });
    client.config.credentials = credentials;
    client.config.requestHandler = { handle } as any;
    try {
      await client.send(new ListObjectsV2Command({ Bucket: config.bucket }));
      const request = handle.mock.calls[0][0] as any;
      expect(request.hostname).toContain('s3.us-west-2.amazonaws.com');
      expect(credentials).not.toHaveBeenCalled();
      expect(request.headers.authorization).toBeUndefined();
      expect(request.headers['x-amz-security-token']).toBeUndefined();
      expect(request.query['X-Amz-Credential']).toBeUndefined();
    } finally {
      client.destroy();
    }
  });

  it('returns an unsigned download URL with encoded object keys', async () => {
    await expect(
      CloudExplorerService.getS3DownloadUrl(
        config,
        'public-data',
        'folder/a b+#?.csv',
      ),
    ).resolves.toBe(
      'https://s3.us-west-2.amazonaws.com/public-data/folder/a%20b%2B%23%3F.csv',
    );
  });

  it('clears prior DuckDB secrets and configures anonymous previews with the region', async () => {
    const sql = await buildCloudSecretQuery('aws', {
      ...config,
      accessKeyId: 'ignored-key',
      secretAccessKey: 'ignored-secret',
      sessionToken: 'ignored-token',
    });
    expect(sql).toContain('DROP SECRET IF EXISTS s3_secret');
    expect(sql).toContain("KEY_ID ''");
    expect(sql).toContain("SECRET ''");
    expect(sql).toContain("SESSION_TOKEN ''");
    expect(sql).toContain("REGION 'us-west-2'");
    expect(sql).toContain("ENDPOINT 's3.us-west-2.amazonaws.com'");
    expect(sql).not.toContain('ignored-');
  });

  it('uses path-style DuckDB URLs for public buckets containing dots', async () => {
    const sql = await buildCloudSecretQuery('aws', {
      authMode: 'public',
      bucket: 'samples.dremio.com',
      region: 'us-west-2',
    });
    expect(sql).toContain("URL_STYLE 'path'");
    expect(sql).toContain("ENDPOINT 's3.us-west-2.amazonaws.com'");
    expect(sql).not.toMatch(/ssl_verify\s*=\s*false/i);
  });
});
