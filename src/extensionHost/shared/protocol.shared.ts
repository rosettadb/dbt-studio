/**
 * Wire contract between the main-process and renderer halves of the
 * extension host, plus the disposable helpers both sides use.
 */

/** URL scheme that serves the files of installed extensions to the renderer. */
export const EXTENSION_SCHEME = 'rosetta-ext';

export type ExtensionHostChannels =
  // renderer -> main (invoke)
  | 'extensions:list'
  | 'extensions:setEnabled'
  | 'extensions:install'
  | 'extensions:uninstall'
  | 'extensions:openFolder'
  | 'extensions:restart'
  | 'extensions:bridge:response'
  // main -> renderer (send)
  | 'extensions:changed'
  | 'extensions:bridge:request'
  | 'extensions:file:didSave';

export type ExtensionInstallResult =
  | { status: 'installed'; id: string }
  | { status: 'cancelled' }
  | { status: 'failed'; error: string };

/** main -> renderer: ask the UI half of an extension to do something. */
export interface ExtensionBridgeRequest {
  requestId: string;
  extensionId: string;
  operation: string;
  payload: unknown;
}

/** renderer -> main: the answer to an ExtensionBridgeRequest. */
export interface ExtensionBridgeResponse {
  requestId: string;
  success: boolean;
  data?: unknown;
  error?: string;
}

/** Who wrote the file: a save from the editor, or an AI agent tool. */
export type FileSaveSource = 'user' | 'agent';

export interface FileDidSaveEvent {
  path: string;
  source: FileSaveSource;
}

export interface Disposable {
  dispose: () => void;
}

/** Wraps a clean-up function so it runs at most once. */
export const toDisposable = (dispose: () => void): Disposable => {
  let disposed = false;
  return {
    dispose: () => {
      if (disposed) return;
      disposed = true;
      dispose();
    },
  };
};

/**
 * Empties the list and disposes its items, last added first. One failing
 * disposer does not stop the rest.
 */
export const disposeAll = (
  disposables: Disposable[],
  onError?: (error: unknown) => void,
): void => {
  disposables
    .splice(0)
    .reverse()
    .forEach((disposable) => {
      try {
        disposable.dispose();
      } catch (error) {
        onError?.(error);
      }
    });
};
