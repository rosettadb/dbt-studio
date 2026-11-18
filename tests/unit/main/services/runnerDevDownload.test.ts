import AdmZip from 'adm-zip';
import fs from 'fs-extra';
import os from 'os';
import path from 'path';
import { app } from 'electron';
import RunnerService from '../../../../src/main/services/runner.service';
import { downloadForInstall } from '../../../../src/main/utils/installTask';

jest.mock('../../../../src/main/services/settings.service', () => ({
  __esModule: true,
  default: { loadSettings: jest.fn(), saveSettings: jest.fn() },
}));

jest.mock('../../../../src/main/utils/installTask', () => ({
  downloadForInstall: jest.fn(),
}));

const download = downloadForInstall as jest.Mock;
const RELEASE_URL =
  'https://github.com/rosettadb/dbt-studio/releases/latest/download';

// Tests run as Linux x64 so the expected file names don't depend on the
// machine running them.
describe('RunnerService.downloadRunnerForDevelopment', () => {
  // Under jsdom a Buffer is not `instanceof Uint8Array` (jsdom has its own),
  // so adm-zip would silently read the downloaded zip as an empty archive.
  // Use Node's Uint8Array, as in the real main process.
  const jsdomUint8Array = global.Uint8Array;
  beforeAll(() => {
    global.Uint8Array = Object.getPrototypeOf(Buffer.prototype).constructor;
  });
  afterAll(() => {
    global.Uint8Array = jsdomUint8Array;
  });

  const originalPlatform = process.platform;
  const originalArch = process.arch;
  let tempDir: string;
  let projectRunnerDir: string;
  let onDownloadStart: jest.Mock;

  const pluginsZip = () => {
    const zip = new AdmZip();
    zip.addFile('plugins.json', Buffer.from('{}'));
    zip.addFile('plugins/dbt_v1.sh', Buffer.from('echo dbt'));
    return zip.toBuffer();
  };

  // Answers each release download the way GitHub would.
  const serveRelease = (pluginsData: Buffer = pluginsZip()) =>
    download.mockImplementation(async (url: string) => ({
      data: url.endsWith('rosetta-runner-plugins.zip')
        ? pluginsData
        : Buffer.from('downloaded runner'),
    }));

  const setPlatform = (platform: string, arch: string) => {
    Object.defineProperty(process, 'platform', { value: platform });
    Object.defineProperty(process, 'arch', { value: arch });
  };

  const setIsPackaged = (isPackaged: boolean) =>
    Object.defineProperty(app, 'isPackaged', {
      value: isPackaged,
      configurable: true,
    });

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'runner-download-'));
    const projectDir = path.join(tempDir, 'project');
    projectRunnerDir = path.join(projectDir, 'resources', 'runner');
    setPlatform('linux', 'x64');
    setIsPackaged(false);
    Object.defineProperty(app, 'getAppPath', {
      value: () => projectDir,
      configurable: true,
    });
    onDownloadStart = jest.fn(async () => {});
    download.mockReset();
  });

  afterEach(async () => {
    setPlatform(originalPlatform, originalArch);
    Reflect.deleteProperty(app, 'isPackaged');
    Reflect.deleteProperty(app, 'getAppPath');
    await fs.remove(tempDir);
  });

  it('downloads the runner and its plugins into the project under npm start', async () => {
    serveRelease();

    await RunnerService.downloadRunnerForDevelopment(onDownloadStart);

    expect(onDownloadStart).toHaveBeenCalledTimes(1);
    expect(download.mock.calls.map(([url]) => url).sort()).toEqual([
      `${RELEASE_URL}/rosetta-runner-linux-amd64`,
      `${RELEASE_URL}/rosetta-runner-plugins.zip`,
    ]);
    const binaryPath = path.join(projectRunnerDir, 'rosetta-runner');
    expect(await fs.readFile(binaryPath, 'utf8')).toBe('downloaded runner');
    expect(
      await fs.pathExists(
        path.join(projectRunnerDir, 'plugins-home', 'plugins.json'),
      ),
    ).toBe(true);
    expect(
      await fs.pathExists(
        path.join(projectRunnerDir, 'plugins-home', 'plugins', 'dbt_v1.sh'),
      ),
    ).toBe(true);
    // Windows has no executable bit to check.
    const isExecutable =
      originalPlatform === 'win32' ||
      // eslint-disable-next-line no-bitwise
      ((await fs.stat(binaryPath)).mode & 0o111) !== 0;
    expect(isExecutable).toBe(true);
  });

  it('downloads nothing in an installed app', async () => {
    setIsPackaged(true);

    await RunnerService.downloadRunnerForDevelopment(onDownloadStart);

    expect(download).not.toHaveBeenCalled();
    expect(onDownloadStart).not.toHaveBeenCalled();
  });

  it('downloads nothing when the project already has a runner', async () => {
    await fs.outputFile(path.join(projectRunnerDir, 'rosetta-runner'), 'kept');

    await RunnerService.downloadRunnerForDevelopment(onDownloadStart);

    expect(download).not.toHaveBeenCalled();
    expect(
      await fs.readFile(path.join(projectRunnerDir, 'rosetta-runner'), 'utf8'),
    ).toBe('kept');
  });

  it('downloads nothing on a machine with no runner build', async () => {
    setPlatform('linux', 'arm64');

    await RunnerService.downloadRunnerForDevelopment(onDownloadStart);

    expect(download).not.toHaveBeenCalled();
    expect(onDownloadStart).not.toHaveBeenCalled();
  });

  it('leaves no runner behind when the plugins are broken, and the next start downloads again', async () => {
    serveRelease(Buffer.from('not a zip file'));

    await expect(
      RunnerService.downloadRunnerForDevelopment(onDownloadStart),
    ).rejects.toThrow();
    expect(
      await fs.pathExists(path.join(projectRunnerDir, 'rosetta-runner')),
    ).toBe(false);

    serveRelease();
    await RunnerService.downloadRunnerForDevelopment(onDownloadStart);

    expect(
      await fs.readFile(path.join(projectRunnerDir, 'rosetta-runner'), 'utf8'),
    ).toBe('downloaded runner');
    expect(await fs.pathExists(`${projectRunnerDir}.partial`)).toBe(false);
  });
});
