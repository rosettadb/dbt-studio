/**
 * Extension API, the part both processes share. An extension imports from
 * `extensionApi/shared`, `extensionApi/main` and `extensionApi/renderer` and
 * from nothing else in Studio.
 */
export type {
  ExtensionManifest,
  ExtensionDescription,
  ExtensionSource,
  ExtensionState,
} from '../extensionHost/shared/manifest.shared';
export { extensionIdOf } from '../extensionHost/shared/manifest.shared';
export type {
  Disposable,
  FileDidSaveEvent,
  FileSaveSource,
} from '../extensionHost/shared/protocol.shared';
export { toDisposable } from '../extensionHost/shared/protocol.shared';

export interface ExtensionLogger {
  info: (...args: unknown[]) => void;
  warn: (...args: unknown[]) => void;
  error: (...args: unknown[]) => void;
}
