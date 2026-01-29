import CloudExplorerService from '../../../../src/renderer/services/cloudExplorer.service';

jest.mock('../../../../src/renderer/config/client', () => {
  return {
    client: {
      get: jest.fn(),
      post: jest.fn(),
    },
  };
});

describe('renderer/services/cloudExplorer.service', () => {
  const { client } = require('../../../../src/renderer/config/client');

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('listBuckets should call client.post with cloudExplorer:listBuckets and payload', async () => {
    client.post.mockResolvedValue({ data: [{ name: 'b1' }] });

    const config = { region: 'us-east-1' } as any;
    const result = await CloudExplorerService.listBuckets('aws', config);

    expect(client.post).toHaveBeenCalledWith('cloudExplorer:listBuckets', {
      provider: 'aws',
      config,
    });
    expect(result).toEqual([{ name: 'b1' }]);
  });

  it('listObjects should call client.post with cloudExplorer:listObjects and include prefix/token', async () => {
    client.post.mockResolvedValue({
      data: { objects: [], continuationToken: 'next' },
    });

    const config = { account: 'x' } as any;
    const result = await CloudExplorerService.listObjects(
      'azure',
      config,
      'bucket',
      'token',
      'path/',
    );

    expect(client.post).toHaveBeenCalledWith('cloudExplorer:listObjects', {
      provider: 'azure',
      config,
      bucketName: 'bucket',
      continuationToken: 'token',
      prefix: 'path/',
    });
    expect(result).toEqual({ objects: [], continuationToken: 'next' });
  });

  it('getDownloadUrl should call client.post with cloudExplorer:getDownloadUrl', async () => {
    client.post.mockResolvedValue({ data: 'https://signed.example' });

    const config = { projectId: 'p' } as any;
    const result = await CloudExplorerService.getDownloadUrl(
      'gcs',
      config,
      'bucket',
      'obj.csv',
    );

    expect(client.post).toHaveBeenCalledWith('cloudExplorer:getDownloadUrl', {
      provider: 'gcs',
      config,
      bucketName: 'bucket',
      objectName: 'obj.csv',
    });
    expect(result).toBe('https://signed.example');
  });

  it('testConnection should call client.post with cloudExplorer:testConnection', async () => {
    client.post.mockResolvedValue({ data: true });

    const config = { key: 'k' } as any;
    const result = await CloudExplorerService.testConnection('aws', config);

    expect(client.post).toHaveBeenCalledWith('cloudExplorer:testConnection', {
      provider: 'aws',
      config,
    });
    expect(result).toBe(true);
  });

  it('previewData should call client.post with cloudExplorer:previewData and defaults', async () => {
    client.post.mockResolvedValue({ data: { rows: [] } });

    const config = { key: 'k' } as any;
    const result = await CloudExplorerService.previewData(
      'aws',
      config,
      'bucket',
      'obj.csv',
    );

    expect(client.post).toHaveBeenCalledWith('cloudExplorer:previewData', {
      provider: 'aws',
      config,
      bucketName: 'bucket',
      objectName: 'obj.csv',
      previewType: 'sample',
      limit: 100,
    });
    expect(result).toEqual({ rows: [] });
  });
});
