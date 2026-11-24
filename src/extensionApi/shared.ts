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

export type {
  ConnectionCapabilities,
  ConnectionDescriptor,
  SecretFieldSpec,
  SqlRules,
} from '../connections/core/descriptor.shared';
export { DEFAULT_SECRETS } from '../connections/core/descriptor.shared';
export type { ExtensionConnectionDescriptor } from '../connections/registry.shared';

export interface ExtensionLogger {
  info: (...args: unknown[]) => void;
  warn: (...args: unknown[]) => void;
  error: (...args: unknown[]) => void;
}
