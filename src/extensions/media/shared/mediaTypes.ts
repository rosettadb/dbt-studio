export type MediaKind = 'image' | 'video';

export const IMAGE_EXTENSIONS = [
  '.png',
  '.jpg',
  '.jpeg',
  '.gif',
  '.webp',
  '.svg',
  '.bmp',
  '.ico',
] as const;

export const VIDEO_EXTENSIONS = ['.mp4', '.webm', '.mov', '.avi'] as const;

const MIME_BY_EXTENSION: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.bmp': 'image/bmp',
  '.ico': 'image/x-icon',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.mov': 'video/quicktime',
  '.avi': 'video/x-msvideo',
};

export const getMediaKindFromExtension = (ext: string): MediaKind | null => {
  const lower = ext.toLowerCase();
  if ((IMAGE_EXTENSIONS as readonly string[]).includes(lower)) return 'image';
  if ((VIDEO_EXTENSIONS as readonly string[]).includes(lower)) return 'video';
  return null;
};

export const isMediaExtension = (ext: string): boolean =>
  getMediaKindFromExtension(ext) !== null;

export const getMediaMimeTypeFromExtension = (ext: string): string =>
  MIME_BY_EXTENSION[ext.toLowerCase()] ?? 'application/octet-stream';

export const formatFileSize = (bytes: number): string => {
  if (!Number.isFinite(bytes) || bytes < 0) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  const units = ['KB', 'MB', 'GB'];
  let value = bytes / 1024;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  return `${value.toFixed(value >= 100 ? 0 : 1)} ${units[unitIndex]}`;
};

export const formatDuration = (seconds: number): string => {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
  const totalSeconds = Math.floor(seconds);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const secs = totalSeconds % 60;
  const paddedSecs = secs.toString().padStart(2, '0');
  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, '0')}:${paddedSecs}`;
  }
  return `${minutes}:${paddedSecs}`;
};
