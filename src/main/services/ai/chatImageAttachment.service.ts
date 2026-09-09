import crypto from 'crypto';
import fs from 'fs/promises';
import {
  BrowserWindow,
  dialog,
  IpcMainInvokeEvent,
  OpenDialogOptions,
} from 'electron';
import MainDatabaseService from '../mainDatabase.service';
import type { ChatImageAttachment } from '../../../types/chatAttachments';
import {
  MAX_CHAT_IMAGE_BYTES,
  MAX_CHAT_IMAGES_PER_MESSAGE,
} from '../../../types/chatAttachments';

type ImageInfo = {
  mediaType: ChatImageAttachment['mediaType'];
  width: number;
  height: number;
};

type StagedAttachment = ChatImageAttachment & {
  storageKey: string;
  dataUrl: string | null;
};

const MAX_IMAGE_PIXELS = 20_000_000;

const readImageInfo = (bytes: Buffer): ImageInfo => {
  if (
    bytes.length >= 24 &&
    bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
  ) {
    return {
      mediaType: 'image/png',
      width: bytes.readUInt32BE(16),
      height: bytes.readUInt32BE(20),
    };
  }

  if (bytes.length >= 4 && bytes[0] === 0xff && bytes[1] === 0xd8) {
    let offset = 2;
    while (offset + 9 < bytes.length) {
      if (bytes[offset] !== 0xff) break;
      const marker = bytes[offset + 1];
      const length = bytes.readUInt16BE(offset + 2);
      if (length < 2 || offset + length + 2 > bytes.length) break;
      if (marker >= 0xc0 && marker <= 0xc3) {
        return {
          mediaType: 'image/jpeg',
          height: bytes.readUInt16BE(offset + 5),
          width: bytes.readUInt16BE(offset + 7),
        };
      }
      offset += length + 2;
    }
  }

  if (
    bytes.length >= 30 &&
    bytes.subarray(0, 4).toString('ascii') === 'RIFF' &&
    bytes.subarray(8, 12).toString('ascii') === 'WEBP' &&
    bytes.subarray(12, 16).toString('ascii') === 'VP8X'
  ) {
    return {
      mediaType: 'image/webp',
      width: 1 + bytes.readUIntLE(24, 3),
      height: 1 + bytes.readUIntLE(27, 3),
    };
  }

  if (
    bytes.length >= 30 &&
    bytes.subarray(0, 4).toString('ascii') === 'RIFF' &&
    bytes.subarray(8, 12).toString('ascii') === 'WEBP' &&
    bytes.subarray(12, 16).toString('ascii') === 'VP8 '
  ) {
    return {
      mediaType: 'image/webp',
      width: bytes.readUInt16LE(26) % 0x4000,
      height: bytes.readUInt16LE(28) % 0x4000,
    };
  }

  throw new Error('Only PNG, JPEG, and WebP images are supported.');
};

const assertImageInfo = (bytes: Buffer): ImageInfo => {
  if (bytes.length === 0 || bytes.length > MAX_CHAT_IMAGE_BYTES) {
    throw new Error('Images must be no larger than 5 MiB.');
  }
  const info = readImageInfo(bytes);
  if (
    !info.width ||
    !info.height ||
    info.width * info.height > MAX_IMAGE_PIXELS
  ) {
    throw new Error('Image dimensions exceed the 20 megapixel limit.');
  }
  return info;
};

export default class ChatImageAttachmentService {
  static isAvailable(attachment: { dataUrl: string | null }): boolean {
    return !!attachment.dataUrl;
  }

  static async selectAndStage(
    event: IpcMainInvokeEvent,
    conversationId: number,
    maxImages = MAX_CHAT_IMAGES_PER_MESSAGE,
  ): Promise<ChatImageAttachment[]> {
    const dialogOptions: OpenDialogOptions = {
      title: 'Upload images for AI Agent',
      properties: ['openFile', 'multiSelections'],
      filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp'] }],
    };
    const parent = BrowserWindow.fromWebContents(event.sender);
    const result = parent
      ? await dialog.showOpenDialog(parent, dialogOptions)
      : await dialog.showOpenDialog(dialogOptions);
    if (result.canceled) return [];
    const allowedImages = Math.max(
      0,
      Math.min(MAX_CHAT_IMAGES_PER_MESSAGE, Math.trunc(maxImages)),
    );
    if (result.filePaths.length > allowedImages) {
      throw new Error(
        `Attach at most ${allowedImages} more image${allowedImages === 1 ? '' : 's'}.`,
      );
    }
    const stageSource = async (
      sourcePath: string,
    ): Promise<StagedAttachment> => {
      const source = await fs.lstat(sourcePath);
      if (!source.isFile() || source.isSymbolicLink()) {
        throw new Error('Select a regular image file.');
      }
      if (source.size > MAX_CHAT_IMAGE_BYTES) {
        throw new Error('Images must be no larger than 5 MiB.');
      }
      const bytes = await fs.readFile(sourcePath);
      const info = assertImageInfo(bytes);
      const id = crypto.randomUUID();
      return (await MainDatabaseService.createChatImageAttachment({
        id,
        conversationId,
        messageId: null,
        name: sourcePath.split(/[\\/]/).pop() || 'image',
        mediaType: info.mediaType,
        byteSize: bytes.length,
        width: info.width,
        height: info.height,
        storageKey: id,
        dataUrl: `data:${info.mediaType};base64,${bytes.toString('base64')}`,
      })) as StagedAttachment;
    };

    const staged: StagedAttachment[] = [];
    try {
      await Promise.all(
        result.filePaths.map(async (sourcePath) => {
          staged.push(await stageSource(sourcePath));
        }),
      );
      return staged.map((image) => ({
        id: image.id,
        conversationId: image.conversationId,
        messageId: image.messageId,
        name: image.name,
        mediaType: image.mediaType,
        byteSize: image.byteSize,
        width: image.width,
        height: image.height,
        createdAt: image.createdAt,
      }));
    } catch (error) {
      await MainDatabaseService.releaseStagedChatImageAttachments(
        conversationId,
        staged.map((image) => image.id),
      );
      throw error;
    }
  }

  static async readForModel(attachment: {
    dataUrl: string | null;
    mediaType: string;
  }): Promise<Uint8Array> {
    if (!attachment.dataUrl) throw new Error('Image attachment not found.');
    const base64 = attachment.dataUrl.split(',', 2)[1];
    if (!base64) throw new Error('Image attachment not found.');
    const bytes = Buffer.from(base64, 'base64');
    assertImageInfo(bytes);
    return bytes;
  }

  /**
   * Returns a base64 data URL for renderer thumbnail/lightbox use.
   * Looks up the attachment by ID to avoid accepting an arbitrary path.
   */
  static async previewAttachment(
    id: string,
    conversationId: number,
  ): Promise<{ dataUrl: string; mediaType: string }> {
    const attachment = await MainDatabaseService.getChatImageAttachmentById(id);
    if (!attachment) throw new Error('Image attachment not found.');
    if (attachment.conversationId !== conversationId) {
      throw new Error('Image attachment not found.');
    }
    if (!attachment.dataUrl) {
      return { dataUrl: '', mediaType: attachment.mediaType };
    }
    await this.readForModel(attachment);
    return { dataUrl: attachment.dataUrl, mediaType: attachment.mediaType };
  }

  static async releaseStaged(
    conversationId: number,
    ids: string[],
  ): Promise<void> {
    await MainDatabaseService.releaseStagedChatImageAttachments(
      conversationId,
      ids,
    );
  }

  static async deleteForConversation(conversationId: number): Promise<void> {
    await MainDatabaseService.deleteConversation(conversationId);
  }
}
