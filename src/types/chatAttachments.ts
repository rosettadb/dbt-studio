export type ChatImageMediaType = 'image/png' | 'image/jpeg' | 'image/webp';

export interface ChatImageAttachment {
  id: string;
  conversationId: number;
  messageId: number | null;
  name: string;
  mediaType: ChatImageMediaType;
  byteSize: number;
  width: number;
  height: number;
  createdAt: string | null;
}

export const MAX_CHAT_IMAGE_BYTES = 5 * 1024 * 1024;
export const MAX_CHAT_IMAGES_PER_MESSAGE = 4;
export const CHAT_IMAGE_TOKEN_ESTIMATE = 1_024;
