/**
 * Extension API for the main-process half of an extension.
 *
 * The main entry exports `activate(api)` and, optionally, `deactivate()`.
 * Everything registered through `api` is removed when the extension is
 * disabled, uninstalled or the app quits. For anything else the extension
 * creates (timers, child processes, sockets) it pushes a disposable onto
 * `api.subscriptions`, or cleans up in `deactivate()`.
 */
import type { BrowserWindow, IpcMainInvokeEvent, WebContents } from 'electron';
import type {
  Disposable,
  ExtensionDescription,
  ExtensionLogger,
  FileDidSaveEvent,
} from './shared';

export interface ExtensionMainIpc {
  /**
   * Answers `api.ipc.invoke(channel, ...args)` from the UI half. Channel
   * names are global, so prefix them with the extension's name.
   */
  handle: (
    channel: string,
    handler: (event: IpcMainInvokeEvent, ...args: any[]) => unknown,
  ) => Disposable;
  /**
   * Sends an event to the UI half (`api.ipc.on(channel, ...)`). Goes to
   * every window unless `target` is given.
   */
  send: (channel: string, payload?: unknown, target?: WebContents) => void;
}

export interface ExtensionMainBridge {
  /**
   * Asks the UI half for something only the mounted UI knows (the text in an
   * open editor, the cells of an open notebook). The UI answers with
   * `api.bridge.handle(operation, ...)`. Rejects when no window answers
   * within `timeoutMs` (default 15 s).
   */
  request: <T = unknown>(
    operation: string,
    payload?: unknown,
    options?: { target?: WebContents; timeoutMs?: number },
  ) => Promise<T>;
}

export interface ExtensionMainWorkspace {
  /** Fires after a project file was written, by the editor or by an agent. */
  onDidSaveFile: (listener: (event: FileDidSaveEvent) => void) => Disposable;
}

/** Work an extension does while Studio starts, behind the splash screen. */
export interface StartupTask {
  id: string;
  /**
   * Runs once per app start, before the main window opens. `setMessage`
   * changes the line shown on the splash screen. A task that throws is
   * logged and does not stop Studio from starting.
   */
  run: (context: {
    setMessage: (message: string) => Promise<void>;
  }) => Promise<void>;
}

export interface ExtensionMainApi {
  readonly extension: ExtensionDescription;
  /** Disposed, last added first, when the extension is deactivated. */
  readonly subscriptions: Disposable[];
  readonly ipc: ExtensionMainIpc;
  readonly bridge: ExtensionMainBridge;
  readonly workspace: ExtensionMainWorkspace;
  readonly windows: {
    /** Studio's main window, or null while it is not open. */
    getMainWindow: () => BrowserWindow | null;
  };
  readonly startup: {
    addTask: (task: StartupTask) => Disposable;
  };
  /** A folder this extension may use for its own files. Created on demand. */
  readonly storagePath: string;
  readonly log: ExtensionLogger;
  readonly extensions: {
    /** What another extension's main `activate` returned, once it is active. */
    getExports: <T = unknown>(extensionId: string) => T | undefined;
  };
}

export interface ExtensionMainModule {
  activate: (api: ExtensionMainApi) => unknown | Promise<unknown>;
  deactivate?: () => void | Promise<void>;
}
