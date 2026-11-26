import fs from 'fs-extra';
import os from 'os';
import path from 'path';
import { app, ipcMain, shell } from 'electron';
import { ExtensionHostMain } from '../../../src/extensionHost/main/ExtensionHost.main';
import { ExtensionHostRenderer } from '../../../src/extensionHost/renderer/ExtensionHost.renderer';
import { parseExtensionManifest } from '../../../src/extensionHost/shared/manifest.shared';
import { listFileViews } from '../../../src/renderer/components/fileViews/registry';
import { mediaManifest } from '../../../src/extensions/media/manifest.shared';
import { mediaMain } from '../../../src/extensions/media/main';
import { mediaRenderer } from '../../../src/extensions/media/renderer';
import {
  IMAGE_EXTENSIONS,
  VIDEO_EXTENSIONS,
  formatDuration,
  formatFileSize,
  getMediaKind,
  getMediaMimeType,
  isMediaFile,
} from '../../../src/extensions/media/shared/mediaTypes';

jest.mock('react-markdown', () => ({ __esModule: true, default: () => null }));
jest.mock('remark-gfm', () => () => undefined);
jest.mock('rehype-raw', () => () => undefined);
jest.mock('rehype-highlight', () => () => undefined);
jest.mock('rehype-sanitize', () => () => undefined);

const description = (state: 'active' | 'disabled') => {
  const parsed = parseExtensionManifest(mediaManifest);
  if (!parsed.ok) throw new Error(parsed.errors.join('; '));
  return {
    id: 'rosetta.media',
    manifest: parsed.manifest,
    source: 'builtin' as const,
    enabled: state === 'active',
    state,
  };
};

describe('Media Viewer extension', () => {
  it('has a valid manifest', () => {
    expect(parseExtensionManifest(mediaManifest)).toMatchObject({ ok: true });
  });

  it('recognizes all supported image and video extensions case-insensitively', () => {
    for (const ext of IMAGE_EXTENSIONS) {
      expect(getMediaKind(`/project/assets/file${ext}`)).toBe('image');
      expect(getMediaKind(`/project/assets/file${ext.toUpperCase()}`)).toBe(
        'image',
      );
      expect(isMediaFile(`/project/assets/file${ext}`)).toBe(true);
    }

    for (const ext of VIDEO_EXTENSIONS) {
      expect(getMediaKind(`/project/assets/clip${ext}`)).toBe('video');
      expect(getMediaKind(`/project/assets/clip${ext.toUpperCase()}`)).toBe(
        'video',
      );
      expect(isMediaFile(`/project/assets/clip${ext}`)).toBe(true);
    }

    expect(isMediaFile('/project/models/users.sql')).toBe(false);
    expect(isMediaFile('/project/README.md')).toBe(false);
    expect(getMediaKind('/project/data.csv')).toBeNull();
    expect(getMediaMimeType('/project/logo.PNG')).toBe('image/png');
    expect(getMediaMimeType('/project/demo.mp4')).toBe('video/mp4');
  });

  it('formats file sizes and durations cleanly', () => {
    expect(formatFileSize(512)).toBe('512 B');
    expect(formatFileSize(2048)).toBe('2.0 KB');
    expect(formatFileSize(5 * 1024 * 1024)).toBe('5.0 MB');
    expect(formatDuration(9)).toBe('0:09');
    expect(formatDuration(125)).toBe('2:05');
    expect(formatDuration(3665)).toBe('1:01:05');
  });

  it('registers the media fileView on activate and removes it on disable', async () => {
    const host = new ExtensionHostRenderer();
    host.registerBuiltin(mediaManifest, mediaRenderer);

    await host.apply([description('active')]);

    const view = listFileViews().find((item) => item.id === 'media');
    expect(view).toBeDefined();
    expect(
      view?.matches({ path: '/project/banner.png' } as any),
    ).toBe(true);
    expect(
      view?.matches({ path: '/project/demo.MOV' } as any),
    ).toBe(true);
    expect(
      view?.matches({ path: '/project/model.sql' } as any),
    ).toBe(false);

    await host.apply([description('disabled')]);
    expect(listFileViews().find((item) => item.id === 'media')).toBeUndefined();
  });

  describe('main half', () => {
    let tempDir: string;
    let host: ExtensionHostMain;
    const handlers = new Map<string, (...args: any[]) => any>();

    beforeEach(async () => {
      tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'media-ext-'));
      jest.spyOn(app, 'getPath').mockImplementation((name) => {
        if (name === 'userData') return tempDir;
        return os.tmpdir();
      });
      jest
        .spyOn(ipcMain, 'handle')
        .mockImplementation((channel, handler) => {
          handlers.set(channel, handler as any);
        });
      jest
        .spyOn(ipcMain, 'removeHandler')
        .mockImplementation((channel) => {
          handlers.delete(channel);
        });

      host = new ExtensionHostMain({ studioVersion: '1.8.0' });
      host.registerBuiltin(mediaManifest, mediaMain);
      await host.start();
    });

    afterEach(async () => {
      await host.deactivateAll();
      handlers.clear();
      jest.restoreAllMocks();
      await fs.remove(tempDir);
    });

    it('reads binary media files and opens externally via IPC', async () => {
      expect(host.list()).toMatchObject([{ id: 'rosetta.media', state: 'active' }]);
      expect(handlers.has('media:readFile')).toBe(true);
      expect(handlers.has('media:openExternal')).toBe(true);

      const imagePath = path.join(tempDir, 'sample.png');
      const pngBytes = Buffer.from([0x89, 0x50, 0x4e, 0x47]);
      await fs.writeFile(imagePath, pngBytes);

      const result = await handlers.get('media:readFile')!({}, imagePath);
      expect(result.mimeType).toBe('image/png');
      expect(result.size).toBe(4);
      expect(Array.from(result.data)).toEqual([0x89, 0x50, 0x4e, 0x47]);

      await expect(
        handlers.get('media:readFile')!({}, path.join(tempDir, 'notes.txt')),
      ).rejects.toThrow('Unsupported media file type');

      const openPathSpy = jest
        .spyOn(shell, 'openPath')
        .mockResolvedValue('');
      await handlers.get('media:openExternal')!({}, imagePath);
      expect(openPathSpy).toHaveBeenCalledWith(imagePath);

      await host.deactivateAll();
      expect(handlers.has('media:readFile')).toBe(false);
      expect(handlers.has('media:openExternal')).toBe(false);
    });
  });
});
