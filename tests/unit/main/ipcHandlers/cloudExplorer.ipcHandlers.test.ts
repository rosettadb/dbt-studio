describe('cloudExplorer.ipcHandlers', () => {
  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
  });

  const getHandleHandler = (ipcMain: any, channel: string) => {
    const call = (ipcMain.handle as jest.Mock).mock.calls.find(
      ([c]) => c === channel,
    );
    if (!call) {
      throw new Error(`No handler registered for channel: ${channel}`);
    }
    return call[1] as (...args: any[]) => any;
  };

  it('registers Cloud Explorer channels and removes previous handlers', async () => {
    const { ipcMain } = await import('electron');

    jest.doMock('../../../../src/main/services', () => ({
      CloudExplorerService: {
        listBuckets: jest.fn(),
        listObjects: jest.fn(),
        getDownloadUrl: jest.fn(),
        testConnection: jest.fn(),
      },
      CloudPreviewService: {
        getCloudUrl: jest.fn(),
        previewCloudData: jest.fn(),
      },
    }));

    const registerCloudExplorerHandlers = (
      await import('../../../../src/main/ipcHandlers/cloudExplorer.ipcHandlers')
    ).default;

    registerCloudExplorerHandlers();

    expect(ipcMain.removeHandler).toHaveBeenCalledWith(
      'cloudExplorer:listBuckets',
    );
    expect(ipcMain.removeHandler).toHaveBeenCalledWith(
      'cloudExplorer:previewData',
    );

    expect(ipcMain.handle).toHaveBeenCalledWith(
      'cloudExplorer:listBuckets',
      expect.any(Function),
    );
    expect(ipcMain.handle).toHaveBeenCalledWith(
      'cloudExplorer:testConnection',
      expect.any(Function),
    );
    expect(ipcMain.handle).toHaveBeenCalledWith(
      'cloudExplorer:previewData',
      expect.any(Function),
    );
  });

  it('delegates cloudExplorer:listBuckets to CloudExplorerService.listBuckets', async () => {
    const { ipcMain } = await import('electron');

    const listBuckets = jest.fn().mockResolvedValue(['bucket-1']);

    jest.doMock('../../../../src/main/services', () => ({
      CloudExplorerService: {
        listBuckets,
        listObjects: jest.fn(),
        getDownloadUrl: jest.fn(),
        testConnection: jest.fn(),
      },
      CloudPreviewService: {
        getCloudUrl: jest.fn(),
        previewCloudData: jest.fn(),
      },
    }));

    const registerCloudExplorerHandlers = (
      await import('../../../../src/main/ipcHandlers/cloudExplorer.ipcHandlers')
    ).default;

    registerCloudExplorerHandlers();

    const handler = getHandleHandler(ipcMain, 'cloudExplorer:listBuckets');

    const payload = { provider: 'aws', config: { region: 'us-east-1' } as any };
    await expect(handler(null, payload)).resolves.toEqual(['bucket-1']);
    expect(listBuckets).toHaveBeenCalledWith('aws', payload.config);
  });

  it('exposes background folder totals through a separate IPC request', async () => {
    const { ipcMain } = await import('electron');
    const metadata = { size: 1024, updated: new Date('2026-10-06') };
    const getFolderMetadata = jest.fn().mockResolvedValue(metadata);
    jest.doMock('../../../../src/main/services', () => ({
      CloudExplorerService: { getFolderMetadata },
      CloudPreviewService: {},
    }));
    const registerCloudExplorerHandlers = (
      await import('../../../../src/main/ipcHandlers/cloudExplorer.ipcHandlers')
    ).default;
    registerCloudExplorerHandlers();
    const handler = getHandleHandler(
      ipcMain,
      'cloudExplorer:getFolderMetadata',
    );
    const config = {
      authMode: 'public',
      bucket: 'public-data',
      region: 'us-east-1',
    };
    await expect(
      handler(null, {
        provider: 'aws',
        config,
        bucketName: 'public-data',
        prefix: 'outer/',
      }),
    ).resolves.toEqual(metadata);
    expect(getFolderMetadata).toHaveBeenCalledWith(
      'aws',
      config,
      'public-data',
      'outer/',
    );
    expect(ipcMain.removeHandler).toHaveBeenCalledWith(
      'cloudExplorer:getFolderMetadata',
    );
  });

  const registerTestConnectionHandler = async () => {
    const { ipcMain } = await import('electron');
    const testConnection = jest.fn().mockResolvedValue(true);
    jest.doMock('../../../../src/main/services', () => ({
      CloudExplorerService: { testConnection },
      CloudPreviewService: {},
    }));
    const registerCloudExplorerHandlers = (
      await import('../../../../src/main/ipcHandlers/cloudExplorer.ipcHandlers')
    ).default;
    registerCloudExplorerHandlers();
    return {
      handler: getHandleHandler(ipcMain, 'cloudExplorer:testConnection'),
      testConnection,
    };
  };

  it('passes a public S3 connection without credentials through IPC', async () => {
    const { handler, testConnection } = await registerTestConnectionHandler();
    const config = {
      authMode: 'public',
      bucket: 'samples.dremio.com',
      region: 'us-west-2',
    };
    await expect(handler(null, { provider: 'aws', config })).resolves.toBe(
      true,
    );
    expect(testConnection).toHaveBeenCalledWith('aws', config);
  });

  it.each([
    { authMode: 'public', bucket: '', region: 'us-west-2' },
    { authMode: 'public', bucket: '   ', region: 'us-west-2' },
    { authMode: 'public', bucket: 'samples.dremio.com' },
    { region: 'us-west-2' },
    { region: 'us-west-2', accessKeyId: 'test-key' },
    {
      authMode: 'credentials',
      region: 'us-west-2',
      secretAccessKey: 'test-secret',
    },
  ])('rejects incomplete AWS configuration %j', async (config) => {
    const { handler, testConnection } = await registerTestConnectionHandler();
    await expect(handler(null, { provider: 'aws', config })).rejects.toThrow(
      'Invalid AWS config: missing required fields.',
    );
    expect(testConnection).not.toHaveBeenCalled();
  });

  it('keeps credential-based S3 connection testing working', async () => {
    const { handler, testConnection } = await registerTestConnectionHandler();
    const config = {
      region: 'us-west-2',
      accessKeyId: 'test-key',
      secretAccessKey: 'test-secret',
    };
    await expect(handler(null, { provider: 'aws', config })).resolves.toBe(
      true,
    );
    expect(testConnection).toHaveBeenCalledWith('aws', config);
  });
});
