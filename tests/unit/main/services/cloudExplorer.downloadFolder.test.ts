import fs from 'fs';
import os from 'os';
import path from 'path';
import { Readable } from 'stream';
import { setImmediate, clearImmediate } from 'timers';
import AdmZip from 'adm-zip';
import { net } from 'electron';
import CloudExplorerService from '../../../../src/main/services/cloudExplorer.service';
import { TaskManagerService } from '../../../../src/main/services/taskManager.service';

jest.mock('@aws-sdk/client-s3', () => ({}));
jest.mock('@aws-sdk/s3-request-presigner', () => ({}));

jest.mock('electron', () => ({ net: { fetch: jest.fn() } }));
jest.mock('../../../../src/main/services/taskManager.service', () => ({
  TaskManagerService: {
    create: jest.fn(),
    registerCanceller: jest.fn(),
    updateProgress: jest.fn(),
    complete: jest.fn(),
    fail: jest.fn(),
  },
}));

// Main-process code uses Node buffers; jsdom's Uint8Array is a different realm.
const browserUint8Array = global.Uint8Array;
beforeAll(() =>
  Object.assign(global, {
    setImmediate,
    clearImmediate,
    Uint8Array: Object.getPrototypeOf(Buffer.prototype).constructor,
  }),
);
afterAll(() => {
  global.Uint8Array = browserUint8Array;
});

let directory: string;
const config = { region: 'us-east-1' };
const file = (name: string) => ({ name, size: 5, isDirectory: false });
const folder = (name: string) => ({ name, size: 0, isDirectory: true });
const download = () =>
  CloudExplorerService.downloadFolder({
    provider: 'aws',
    config,
    bucketName: 'bucket',
    prefix: 'parent/reports/',
    destinationPath: path.join(directory, 'reports.zip'),
    taskId: 'zip-task',
  });

beforeEach(() => {
  directory = fs.mkdtempSync(path.join(os.tmpdir(), 'cloud-zip-test-'));
  jest
    .spyOn(CloudExplorerService, 'getDownloadUrl')
    .mockResolvedValue('https://example.com/object');
  (net.fetch as jest.Mock).mockImplementation(async () => ({
    ok: true,
    body: Readable.toWeb(Readable.from([Buffer.from('hello')])),
  }));
});
afterEach(() => {
  jest.restoreAllMocks();
  jest.clearAllMocks();
  fs.rmSync(directory, { recursive: true, force: true });
});

it('includes all pages, nested files and empty folders in a readable ZIP', async () => {
  const list = jest
    .spyOn(CloudExplorerService, 'listObjects')
    .mockImplementation(async (_provider, _config, _bucket, token, prefix) => {
      if (prefix === 'parent/reports/empty/') return { objects: [] };
      if (prefix === 'parent/reports/nested/')
        return { objects: [file('parent/reports/nested/data.csv')] };
      if (token === 'page2')
        return { objects: [file('parent/reports/last.txt')] };
      return {
        objects: [
          folder('parent/reports/empty/'),
          folder('parent/reports/nested/'),
          file('parent/reports/first.txt'),
        ],
        nextPageToken: 'page2',
      };
    });
  await expect(download()).resolves.toMatchObject({ success: true });
  const zip = new AdmZip(path.join(directory, 'reports.zip'));
  expect(zip.getEntries().map((entry) => entry.entryName)).toEqual(
    expect.arrayContaining([
      'reports/',
      'reports/empty/',
      'reports/nested/',
      'reports/nested/data.csv',
      'reports/first.txt',
      'reports/last.txt',
    ]),
  );
  expect(zip.readAsText('reports/nested/data.csv')).toBe('hello');
  expect(list).toHaveBeenCalledWith(
    'aws',
    config,
    'bucket',
    'page2',
    'parent/reports/',
  );
  expect(TaskManagerService.complete).toHaveBeenCalledWith('zip-task');
  expect(fs.readdirSync(directory)).toEqual(['reports.zip']);
});

it('downloads an empty folder', async () => {
  jest
    .spyOn(CloudExplorerService, 'listObjects')
    .mockResolvedValue({ objects: [] });
  await download();
  expect(
    new AdmZip(path.join(directory, 'reports.zip'))
      .getEntries()
      .map((entry) => entry.entryName),
  ).toEqual(['reports/']);
});

it.each([
  'parent/reports/../escape',
  'outside/file',
  'parent/reports/a\\b',
  'parent/reports/C:drive',
])(
  'rejects unsafe key %s and preserves an existing destination',
  async (key) => {
    fs.writeFileSync(path.join(directory, 'reports.zip'), 'original');
    jest
      .spyOn(CloudExplorerService, 'listObjects')
      .mockResolvedValue({ objects: [file(key)] });
    await expect(download()).rejects.toThrow();
    expect(fs.readFileSync(path.join(directory, 'reports.zip'), 'utf8')).toBe(
      'original',
    );
    expect(fs.readdirSync(directory)).toEqual(['reports.zip']);
    expect(TaskManagerService.fail).toHaveBeenCalled();
  },
);

it('removes incomplete output after a failed object download', async () => {
  jest
    .spyOn(CloudExplorerService, 'listObjects')
    .mockResolvedValue({ objects: [file('parent/reports/file')] });
  (net.fetch as jest.Mock).mockResolvedValue({ ok: false, status: 403 });
  await expect(download()).rejects.toThrow('Download error 403');
  expect(fs.readdirSync(directory)).toEqual([]);
});

it('cancels during listing without saving a partial archive', async () => {
  jest
    .spyOn(CloudExplorerService, 'listObjects')
    .mockImplementation(async () => {
      const cancel = (TaskManagerService.registerCanceller as jest.Mock).mock
        .calls[0][1];
      cancel();
      return { objects: [] };
    });
  await expect(download()).rejects.toThrow('Download cancelled');
  expect(TaskManagerService.complete).not.toHaveBeenCalled();
  expect(TaskManagerService.fail).not.toHaveBeenCalled();
  expect(fs.readdirSync(directory)).toEqual([]);
});
