import { randomUUID } from 'crypto';
import * as fs from 'fs';

const MAX_ROLLBACK_ENTRIES = 100;
const MAX_ROLLBACK_ENTRY_BYTES = 1_000_000;
const MAX_ROLLBACK_TOTAL_BYTES = 10_000_000;
const ROLLBACK_TTL_MS = 60 * 60 * 1000;

interface RollbackEntry {
  filePath: string;
  previousContent: string;
  bytes: number;
  createdAt: number;
}

export interface FileWriteState {
  created: boolean;
  mutationId?: string;
}

const entries = new Map<string, RollbackEntry>();
let totalBytes = 0;

const removeEntry = (mutationId: string): void => {
  const entry = entries.get(mutationId);
  if (!entry) return;
  entries.delete(mutationId);
  totalBytes -= entry.bytes;
};

const pruneExpiredEntries = (): void => {
  const expiresBefore = Date.now() - ROLLBACK_TTL_MS;
  entries.forEach((entry, mutationId) => {
    if (entry.createdAt < expiresBefore) removeEntry(mutationId);
  });
};

const readBoundedFile = (filePath: string): Buffer => {
  const descriptor = fs.openSync(filePath, 'r');
  try {
    const before = fs.fstatSync(descriptor);
    if (!before.isFile()) {
      throw new Error(
        'Only regular files can be updated with rollback support.',
      );
    }
    if (before.size > MAX_ROLLBACK_ENTRY_BYTES) {
      throw new Error(
        `Existing file is too large to update safely (${before.size} bytes).`,
      );
    }

    const buffer = Buffer.alloc(before.size);
    let offset = 0;
    while (offset < buffer.length) {
      const bytesRead = fs.readSync(
        descriptor,
        buffer,
        offset,
        buffer.length - offset,
        offset,
      );
      if (bytesRead === 0) break;
      offset += bytesRead;
    }

    const after = fs.fstatSync(descriptor);
    if (after.size !== before.size || after.mtimeMs !== before.mtimeMs) {
      throw new Error(
        'Existing file changed while rollback data was captured.',
      );
    }
    return buffer.subarray(0, offset);
  } finally {
    fs.closeSync(descriptor);
  }
};

export default class FileMutationRollbackService {
  static capture(filePath: string): FileWriteState {
    if (!fs.existsSync(filePath)) return { created: true };

    pruneExpiredEntries();
    const previousContent = readBoundedFile(filePath);
    if (
      entries.size >= MAX_ROLLBACK_ENTRIES ||
      totalBytes + previousContent.length > MAX_ROLLBACK_TOTAL_BYTES
    ) {
      throw new Error(
        'Rollback storage is full. Keep or discard existing agent file changes before updating more files.',
      );
    }

    const mutationId = randomUUID();
    entries.set(mutationId, {
      filePath,
      previousContent: previousContent.toString('utf8'),
      bytes: previousContent.length,
      createdAt: Date.now(),
    });
    totalBytes += previousContent.length;
    return { created: false, mutationId };
  }

  static restore(mutationId: string): { path: string } {
    pruneExpiredEntries();
    const entry = entries.get(mutationId);
    if (!entry) {
      throw new Error('Rollback data is unavailable or has expired.');
    }

    fs.writeFileSync(entry.filePath, entry.previousContent, 'utf8');
    removeEntry(mutationId);
    return { path: entry.filePath };
  }

  static release(mutationIds: string[]): void {
    mutationIds.forEach(removeEntry);
  }

  static clear(): void {
    entries.clear();
    totalBytes = 0;
  }
}
