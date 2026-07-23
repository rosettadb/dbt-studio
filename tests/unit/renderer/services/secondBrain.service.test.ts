import * as secondBrainService from '../../../../src/renderer/services/secondBrain.service';

describe('renderer/services/secondBrain.service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('uses typed page IDs and hashes for read and write operations', async () => {
    const invoke = (window as any).electron.ipcRenderer.invoke as jest.Mock;
    invoke.mockResolvedValue({ pageId: 'memory.md' });

    await secondBrainService.readPage('memory.md');
    await secondBrainService.writePage({
      pageId: 'memory.md',
      content: '# Memory',
      expectedHash: 'a'.repeat(64),
    });

    expect(invoke).toHaveBeenNthCalledWith(1, 'second-brain:read', {
      pageId: 'memory.md',
      archived: false,
    });
    expect(invoke).toHaveBeenNthCalledWith(2, 'second-brain:write', {
      pageId: 'memory.md',
      content: '# Memory',
      expectedHash: 'a'.repeat(64),
    });
  });

  it('opens the wiki without accepting or sending a filesystem path', async () => {
    const invoke = (window as any).electron.ipcRenderer.invoke as jest.Mock;
    invoke.mockResolvedValue(undefined);

    await secondBrainService.openWikiFolder();
    expect(invoke).toHaveBeenCalledWith('second-brain:open-wiki-folder');
  });

  it('opens a terminal without accepting or sending a filesystem path', async () => {
    const invoke = (window as any).electron.ipcRenderer.invoke as jest.Mock;
    invoke.mockResolvedValue(undefined);

    await secondBrainService.openWikiTerminal();
    expect(invoke).toHaveBeenCalledWith('second-brain:open-wiki-terminal');
  });

  it('owns progress subscription and returns the preload unsubscribe function', () => {
    const unsubscribe = jest.fn();
    const on = (window as any).electron.ipcRenderer.on as jest.Mock;
    on.mockReturnValue(unsubscribe);
    const callback = jest.fn();

    const returned = secondBrainService.onProgress(callback);
    const listener = on.mock.calls[0][1];
    const progress = {
      operationId: 'operation-1',
      stage: 'collecting',
      completed: 1,
      message: 'Collecting evidence.',
      timestamp: '2026-07-15T12:00:00.000Z',
      cancellable: true,
    };
    listener(progress);

    expect(on).toHaveBeenCalledWith(
      'second-brain:progress',
      expect.any(Function),
    );
    expect(callback).toHaveBeenCalledWith(progress);
    expect(returned).toBe(unsubscribe);
  });

  it('uses path-free support status, clear, preview, and export channels', async () => {
    const invoke = (window as any).electron.ipcRenderer.invoke as jest.Mock;
    invoke.mockResolvedValue({});

    await secondBrainService.getSupportStatus();
    await secondBrainService.clearSupportData();
    await secondBrainService.previewSupportExport();
    await secondBrainService.exportSupportData();

    expect(invoke.mock.calls).toEqual([
      ['second-brain:support-status'],
      ['second-brain:support-clear'],
      ['second-brain:support-export-preview'],
      ['second-brain:support-export'],
    ]);
  });
});
