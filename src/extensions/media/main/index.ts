import * as fs from 'fs';
import path from 'path';
import { shell } from 'electron';
import type {
  ExtensionMainApi,
  ExtensionMainModule,
} from '../../../extensionApi/main';
import {
  getMediaMimeTypeFromExtension,
  isMediaExtension,
} from '../shared/mediaTypes';

const MAX_MEDIA_FILE_BYTES = 250 * 1024 * 1024; // 250 MB

export interface MediaFilePayload {
  data: Uint8Array;
  size: number;
  mimeType: string;
}

/**
 * Main-process half of the Media Viewer extension: reads binary media files
 * for the renderer and opens media files in the OS default application.
 *
 * Files from any location on disk are allowed — the viewer is used not only
 * for project files but also for dragged-in assets from anywhere on the
 * filesystem.  `fs.promises.realpath` is called to resolve symlinks so we
 * always stat and read the actual on-disk file.
 */
const activate = (api: ExtensionMainApi): void => {
  api.ipc.handle(
    'media:readFile',
    async (_event, filePath: string): Promise<MediaFilePayload> => {
      if (!filePath || typeof filePath !== 'string') {
        throw new Error('A valid file path is required.');
      }
      const ext = path.extname(filePath).toLowerCase();
      if (!isMediaExtension(ext)) {
        throw new Error('Unsupported media file type.');
      }

      // Resolve symlinks so we always operate on the real on-disk path.
      const resolvedPath = await fs.promises.realpath(filePath);

      const stats = await fs.promises.stat(resolvedPath);
      if (!stats.isFile()) {
        throw new Error('Selected path is not a file.');
      }
      if (stats.size > MAX_MEDIA_FILE_BYTES) {
        throw new Error(
          'Media file exceeds the 250 MB in-editor preview limit. Open it externally instead.',
        );
      }

      const buffer = await fs.promises.readFile(resolvedPath);
      return {
        data: new Uint8Array(
          buffer.buffer,
          buffer.byteOffset,
          buffer.byteLength,
        ),
        size: stats.size,
        mimeType: getMediaMimeTypeFromExtension(ext),
      };
    },
  );

  api.ipc.handle(
    'media:openExternal',
    async (_event, filePath: string): Promise<string> => {
      if (!filePath || typeof filePath !== 'string') {
        throw new Error('A valid file path is required.');
      }
      const resolvedPath = await fs.promises.realpath(filePath);
      return shell.openPath(resolvedPath);
    },
  );
};

export const mediaMain: ExtensionMainModule = {
  activate,
};
