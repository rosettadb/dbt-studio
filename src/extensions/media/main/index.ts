import * as fs from 'fs';
import { shell } from 'electron';
import type {
  ExtensionMainApi,
  ExtensionMainModule,
} from '../../../extensionApi/main';
import { getMediaMimeType, isMediaFile } from '../shared/mediaTypes';

const MAX_MEDIA_FILE_BYTES = 250 * 1024 * 1024; // 250 MB

export interface MediaFilePayload {
  data: Uint8Array;
  size: number;
  mimeType: string;
}

/**
 * Main-process half of the Media Viewer extension: reads binary media files
 * for the renderer and opens media files in the OS default application.
 */
const activate = (api: ExtensionMainApi): void => {
  api.ipc.handle(
    'media:readFile',
    async (_event, filePath: string): Promise<MediaFilePayload> => {
      if (!filePath || typeof filePath !== 'string') {
        throw new Error('A valid file path is required.');
      }
      if (!isMediaFile(filePath)) {
        throw new Error(`Unsupported media file type: ${filePath}`);
      }

      const stats = await fs.promises.stat(filePath);
      if (!stats.isFile()) {
        throw new Error('Selected path is not a file.');
      }
      if (stats.size > MAX_MEDIA_FILE_BYTES) {
        throw new Error(
          'Media file exceeds the 250 MB in-editor preview limit. Open it externally instead.',
        );
      }

      const buffer = await fs.promises.readFile(filePath);
      return {
        data: new Uint8Array(
          buffer.buffer,
          buffer.byteOffset,
          buffer.byteLength,
        ),
        size: stats.size,
        mimeType: getMediaMimeType(filePath),
      };
    },
  );

  api.ipc.handle(
    'media:openExternal',
    async (_event, filePath: string): Promise<string> => {
      if (!filePath || typeof filePath !== 'string') {
        throw new Error('A valid file path is required.');
      }
      return shell.openPath(filePath);
    },
  );
};

export const mediaMain: ExtensionMainModule = {
  activate,
};
