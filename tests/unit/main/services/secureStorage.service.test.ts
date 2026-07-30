const findCredentials = jest.fn();
const deletePassword = jest.fn();
const execFile = jest.fn();

jest.mock('keytar', () => ({
  __esModule: true,
  default: {
    findCredentials: (...args: unknown[]) => findCredentials(...args),
    deletePassword: (...args: unknown[]) => deletePassword(...args),
  },
}));

jest.mock('child_process', () => ({
  execFile: (...args: unknown[]) => execFile(...args),
}));

jest.mock('../../../../src/main/services/mainDatabase.service', () => ({
  __esModule: true,
  default: {},
}));

import SecureStorageService from '../../../../src/main/services/secureStorage.service';

describe('SecureStorageService.clearAllCredentials', () => {
  const originalPlatform = process.platform;

  beforeEach(() => {
    jest.clearAllMocks();
    Object.defineProperty(process, 'platform', { value: 'linux' });
  });

  afterAll(() => {
    Object.defineProperty(process, 'platform', { value: originalPlatform });
  });

  it('removes every DBT Studio credential, including the reserved environments account', async () => {
    findCredentials
      .mockResolvedValueOnce([
        { account: 'db-password-example', password: 'secret' },
        { account: '__keystore_environments__', password: 'secret' },
      ])
      .mockResolvedValueOnce([]);
    deletePassword.mockResolvedValue(true);

    await SecureStorageService.clearAllCredentials();

    expect(deletePassword).toHaveBeenCalledWith(
      'dbt-studio',
      'db-password-example',
    );
    expect(deletePassword).toHaveBeenCalledWith(
      'dbt-studio',
      '__keystore_environments__',
    );
  });

  it('fails when a credential cannot be deleted', async () => {
    findCredentials.mockResolvedValueOnce([
      { account: 'db-password-example', password: 'secret' },
    ]);
    deletePassword.mockResolvedValue(false);

    await expect(SecureStorageService.clearAllCredentials()).rejects.toThrow(
      'Failed to delete 1 secure credential account(s)',
    );
  });

  it('runs only one native keychain deletion at a time', async () => {
    findCredentials
      .mockResolvedValueOnce([
        { account: 'first', password: 'secret' },
        { account: 'second', password: 'secret' },
        { account: 'third', password: 'secret' },
      ])
      .mockResolvedValueOnce([]);

    let releaseFirst: (deleted: boolean) => void = () => undefined;
    deletePassword
      .mockImplementationOnce(
        () =>
          new Promise<boolean>((resolve) => {
            releaseFirst = resolve;
          }),
      )
      .mockResolvedValue(true);

    const cleanup = SecureStorageService.clearAllCredentials();
    await Promise.resolve();
    await Promise.resolve();

    expect(deletePassword).toHaveBeenCalledTimes(1);
    expect(deletePassword).toHaveBeenLastCalledWith('dbt-studio', 'first');

    releaseFirst(true);
    await cleanup;

    expect(deletePassword).toHaveBeenCalledTimes(3);
    expect(deletePassword.mock.calls).toEqual([
      ['dbt-studio', 'first'],
      ['dbt-studio', 'second'],
      ['dbt-studio', 'third'],
    ]);
  });

  it('deletes the macOS service without reading secret values', async () => {
    Object.defineProperty(process, 'platform', { value: 'darwin' });
    execFile
      .mockImplementationOnce(
        (
          _file: string,
          _args: string[],
          callback: (error: null, stdout: string, stderr: string) => void,
        ) => callback(null, '', ''),
      )
      .mockImplementationOnce(
        (
          _file: string,
          _args: string[],
          callback: (error: Error & { code?: number }) => void,
        ) => {
          const notFound = Object.assign(new Error('item not found'), {
            code: 44,
          });
          callback(notFound);
        },
      );

    await SecureStorageService.clearAllCredentials();

    expect(findCredentials).not.toHaveBeenCalled();
    expect(deletePassword).not.toHaveBeenCalled();
    expect(execFile).toHaveBeenCalledTimes(2);
    expect(execFile).toHaveBeenNthCalledWith(
      1,
      '/usr/bin/security',
      ['delete-generic-password', '-s', 'dbt-studio'],
      expect.any(Function),
    );
  });
});
