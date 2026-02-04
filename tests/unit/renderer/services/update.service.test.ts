import {
  checkForUpdates,
  checkForSettingsUpdates,
  downloadUpdate,
  restartUpdate,
  rejectUpdateVersion,
} from '../../../../src/renderer/services/update.service';

describe('renderer/services/update.service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('checkForUpdates should invoke updates:check', async () => {
    const invokeMock = (window as any).electron.ipcRenderer.invoke as jest.Mock;
    invokeMock.mockResolvedValue(undefined);

    await checkForUpdates();

    expect(invokeMock).toHaveBeenCalledWith('updates:check');
  });

  it('checkForSettingsUpdates should invoke updates:check-settings', async () => {
    const invokeMock = (window as any).electron.ipcRenderer.invoke as jest.Mock;
    invokeMock.mockResolvedValue(undefined);

    await checkForSettingsUpdates();

    expect(invokeMock).toHaveBeenCalledWith('updates:check-settings');
  });

  it('downloadUpdate should invoke updates:download', async () => {
    const invokeMock = (window as any).electron.ipcRenderer.invoke as jest.Mock;
    invokeMock.mockResolvedValue(undefined);

    await downloadUpdate();

    expect(invokeMock).toHaveBeenCalledWith('updates:download');
  });

  it('restartUpdate should invoke updates:restart', async () => {
    const invokeMock = (window as any).electron.ipcRenderer.invoke as jest.Mock;
    invokeMock.mockResolvedValue(undefined);

    await restartUpdate();

    expect(invokeMock).toHaveBeenCalledWith('updates:restart');
  });

  it('rejectUpdateVersion should invoke updates:reject-version with version', async () => {
    const invokeMock = (window as any).electron.ipcRenderer.invoke as jest.Mock;
    invokeMock.mockResolvedValue(undefined);

    await rejectUpdateVersion('1.2.3');

    expect(invokeMock).toHaveBeenCalledWith('updates:reject-version', '1.2.3');
  });
});
