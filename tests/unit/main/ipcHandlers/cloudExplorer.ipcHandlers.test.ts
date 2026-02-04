describe('cloudExplorer.ipcHandlers', () => {
  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
  });

  const getHandleHandler = (ipcMain: any, channel: string) => {
    const call = (ipcMain.handle as jest.Mock).mock.calls.find(([c]) => c === channel);
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

    const registerCloudExplorerHandlers = (await import(
      '../../../../src/main/ipcHandlers/cloudExplorer.ipcHandlers'
    )).default;

    registerCloudExplorerHandlers();

    expect(ipcMain.removeHandler).toHaveBeenCalledWith('cloudExplorer:listBuckets');
    expect(ipcMain.removeHandler).toHaveBeenCalledWith('cloudExplorer:previewData');

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

    const registerCloudExplorerHandlers = (await import(
      '../../../../src/main/ipcHandlers/cloudExplorer.ipcHandlers'
    )).default;

    registerCloudExplorerHandlers();

    const handler = getHandleHandler(ipcMain, 'cloudExplorer:listBuckets');

    const payload = { provider: 'aws', config: { region: 'us-east-1' } as any };
    await expect(handler(null, payload)).resolves.toEqual(['bucket-1']);
    expect(listBuckets).toHaveBeenCalledWith('aws', payload.config);
  });
});
