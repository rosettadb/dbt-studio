import fs from 'fs-extra';
import os from 'os';
import path from 'path';
import { app } from 'electron';
import RunnerService from '../../../../src/main/services/runner.service';
import SettingsService from '../../../../src/main/services/settings.service';

jest.mock('../../../../src/main/services/settings.service', () => ({
  __esModule: true,
  default: { loadSettings: jest.fn(), saveSettings: jest.fn() },
}));

const loadSettings = SettingsService.loadSettings as jest.Mock;
const saveSettings = SettingsService.saveSettings as jest.Mock;
const binaryName =
  process.platform === 'win32' ? 'rosetta-runner.exe' : 'rosetta-runner';

describe('RunnerService.copyBundledRunnerToUserData', () => {
  const originalResourcesPath = process.resourcesPath;
  let tempDir: string;
  let bundledRunnerDir: string;
  let projectDir: string;
  let runnerRoot: string;

  const setIsPackaged = (isPackaged: boolean) =>
    Object.defineProperty(app, 'isPackaged', {
      value: isPackaged,
      configurable: true,
    });

  // A runner as the publish workflow lays it out: inside the installed app,
  // or by default in bundledRunnerDir.
  const addBundledRunner = async (runnerDir = bundledRunnerDir) => {
    await fs.outputFile(path.join(runnerDir, binaryName), 'new runner');
    await fs.outputJson(
      path.join(runnerDir, 'plugins-home', 'plugins.json'),
      {},
    );
  };

  // A runner folder already in userData, as an older Studio left it.
  const addInstalledRunner = (version: string) =>
    fs.outputFile(path.join(runnerRoot, version, binaryName), 'old runner');

  const installedRunnerFolders = async () =>
    (await fs.readdir(runnerRoot)).sort();

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'runner-copy-'));
    const resourcesPath = path.join(tempDir, 'resources');
    bundledRunnerDir = path.join(resourcesPath, 'resources', 'runner');
    projectDir = path.join(tempDir, 'project');
    const userDataPath = path.join(tempDir, 'userData');
    runnerRoot = path.join(userDataPath, 'runner');

    Object.defineProperty(process, 'resourcesPath', {
      value: resourcesPath,
      configurable: true,
    });
    setIsPackaged(true);
    Object.defineProperty(app, 'getAppPath', {
      value: () => projectDir,
      configurable: true,
    });
    (app.getPath as jest.Mock).mockReturnValue(userDataPath);
    (app.getVersion as jest.Mock).mockReturnValue('1.7.7');
    loadSettings.mockReset();
    saveSettings.mockReset();
  });

  afterEach(async () => {
    Object.defineProperty(process, 'resourcesPath', {
      value: originalResourcesPath,
      configurable: true,
    });
    Reflect.deleteProperty(app, 'isPackaged');
    Reflect.deleteProperty(app, 'getAppPath');
    await fs.remove(tempDir);
  });

  it('copies the bundled runner after an update and deletes every other runner folder', async () => {
    await addBundledRunner();
    await addInstalledRunner('1.7.6');
    await addInstalledRunner('1.7.2');
    await addInstalledRunner('1.7.6-backup');
    loadSettings.mockResolvedValue({
      runnerVersion: '1.7.6',
      runnerPath: path.join(runnerRoot, '1.7.6', binaryName),
    });

    await RunnerService.copyBundledRunnerToUserData();

    const copiedBinary = path.join(runnerRoot, '1.7.7', binaryName);
    expect(await fs.readFile(copiedBinary, 'utf8')).toBe('new runner');
    expect(saveSettings).toHaveBeenCalledWith({
      runnerVersion: '1.7.7',
      runnerPath: copiedBinary,
      runnerHome: path.join(runnerRoot, '1.7.7', 'plugins-home'),
    });
    expect(await installedRunnerFolders()).toEqual(['1.7.7']);
  });

  it('does nothing when the runner for this app version is already in place', async () => {
    await addBundledRunner();
    await addInstalledRunner('1.7.7');
    await addInstalledRunner('1.7.2');
    loadSettings.mockResolvedValue({
      runnerVersion: '1.7.7',
      runnerPath: path.join(runnerRoot, '1.7.7', binaryName),
    });

    await RunnerService.copyBundledRunnerToUserData();

    expect(saveSettings).not.toHaveBeenCalled();
    expect(
      await fs.readFile(path.join(runnerRoot, '1.7.7', binaryName), 'utf8'),
    ).toBe('old runner');
    expect(await installedRunnerFolders()).toEqual(['1.7.2', '1.7.7']);
  });

  it('copies again when settings point at this version but the files are gone', async () => {
    await addBundledRunner();
    loadSettings.mockResolvedValue({
      runnerVersion: '1.7.7',
      runnerPath: path.join(runnerRoot, '1.7.7', binaryName),
    });

    await RunnerService.copyBundledRunnerToUserData();

    expect(
      await fs.readFile(path.join(runnerRoot, '1.7.7', binaryName), 'utf8'),
    ).toBe('new runner');
    expect(saveSettings).toHaveBeenCalledTimes(1);
  });

  it('leaves no runner behind when a copy fails halfway, so the next start copies again', async () => {
    await addBundledRunner();
    loadSettings.mockResolvedValue({
      runnerVersion: '1.7.7',
      runnerPath: path.join(runnerRoot, '1.7.7', binaryName),
    });
    // The first copy writes the binary, then fails before the plugins.
    const copySpy = jest.spyOn(fs, 'copy').mockImplementationOnce((async (
      _source: string,
      destination: string,
    ) => {
      await fs.outputFile(path.join(destination, binaryName), 'partial');
      throw new Error('disk full');
    }) as never);
    const copiedBinary = path.join(runnerRoot, '1.7.7', binaryName);

    await expect(RunnerService.copyBundledRunnerToUserData()).rejects.toThrow(
      'disk full',
    );
    expect(await fs.pathExists(copiedBinary)).toBe(false);
    expect(saveSettings).not.toHaveBeenCalled();

    await RunnerService.copyBundledRunnerToUserData();
    copySpy.mockRestore();

    expect(await fs.readFile(copiedBinary, 'utf8')).toBe('new runner');
    expect(
      await fs.pathExists(
        path.join(runnerRoot, '1.7.7', 'plugins-home', 'plugins.json'),
      ),
    ).toBe(true);
    expect(saveSettings).toHaveBeenCalledTimes(1);
    expect(await installedRunnerFolders()).toEqual(['1.7.7']);
  });

  it('keeps the saved runner when the app has no bundled runner', async () => {
    await addInstalledRunner('1.7.6');

    await RunnerService.copyBundledRunnerToUserData();

    expect(loadSettings).not.toHaveBeenCalled();
    expect(saveSettings).not.toHaveBeenCalled();
    expect(await installedRunnerFolders()).toEqual(['1.7.6']);
  });

  it('under npm start, sets up the runner a developer copied into the project', async () => {
    setIsPackaged(false);
    await addBundledRunner(path.join(projectDir, 'resources', 'runner'));
    loadSettings.mockResolvedValue({});

    await RunnerService.copyBundledRunnerToUserData();

    const copiedBinary = path.join(runnerRoot, '1.7.7', binaryName);
    expect(await fs.readFile(copiedBinary, 'utf8')).toBe('new runner');
    expect(saveSettings).toHaveBeenCalledWith({
      runnerVersion: '1.7.7',
      runnerPath: copiedBinary,
      runnerHome: path.join(runnerRoot, '1.7.7', 'plugins-home'),
    });
  });
});
