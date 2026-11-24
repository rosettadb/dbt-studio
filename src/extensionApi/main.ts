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
  ExtensionConnectionDescriptor,
  ExtensionDescription,
  ExtensionLogger,
  FileDidSaveEvent,
} from './shared';
import type {
  Connection,
  QueryContext,
  TestResult,
} from '../connections/core/Connection.main';
import type { ConnectionDefinition } from '../connections/core/connectorRegistry.main';
import type {
  ProjectAgentToolset,
  ProjectToolInfo,
} from '../main/services/ai/agents/projectToolsets';
import type {
  ScreenAgentContext,
  ScreenAgentFactory,
  ScreenAgentOptions,
  ScreenAgentToolCall,
} from '../main/services/ai/agents/screenAgents';

export type { ProjectAgentToolset, ProjectToolInfo };

export type {
  ScreenAgentContext,
  ScreenAgentFactory,
  ScreenAgentOptions,
  ScreenAgentToolCall,
};

export type { ConnectionDefinition, QueryContext, TestResult };

/**
 * A database an extension adds, main-process side: its facts
 * (`descriptor`) and how to reach it. `validate`, `test`, `query` and
 * `extractSchema` are required; see `ConnectionDefinition` for the rest.
 * The UI half adds the form and the icon with its own
 * `api.connections.register`.
 */
export type ExtensionConnection<Conn = any> = Omit<
  ConnectionDefinition<Conn>,
  'descriptor'
> & { descriptor: ExtensionConnectionDescriptor };

/**
 * Studio's own backend pieces, the same ones the extensions that ship with
 * Studio are built from: the connection and settings services, the JSON
 * store and the database, the agent runtime and the tool sets an agent can
 * be given, Studio's copies of the AI SDK and zod, the install queue, the
 * process adapter. The list is `src/extensionApi/studioMain/index.ts` plus
 * `src/extensionApi/shared.ts`.
 */
export type StudioMainApi = typeof import('./studioMain') &
  typeof import('./shared');

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
  readonly agents: {
    /**
     * Adds the AI agent of a screen. The assistant opened on a screen whose
     * chat uses this `screenKey` runs the agent `factory` builds: it gets
     * Studio's base (model, MCP tools, skills, step limits) and the context
     * of the run (connection, open notebook or page, Ask or Code mode). One
     * agent per screen key; `project` is Studio's own.
     */
    add: (
      screenKey: string,
      factory: ScreenAgentFactory,
      options?: ScreenAgentOptions,
    ) => Disposable;
  };
  readonly projectAgent: {
    /**
     * Gives the project agent (the assistant of the project screen) a set
     * of tools, with the text that tells it about them, a context block for
     * its instructions, and optionally a rule about which project files may
     * only be written with these tools.
     */
    addTools: (toolset: ProjectAgentToolset) => Disposable;
  };
  readonly connections: {
    /**
     * Adds a database Studio can connect to: it can be saved, tested,
     * queried from the SQL Editor and Notebooks, and its tables show in the
     * Data tree. Studio's own databases register the same way. A type that
     * is already taken is refused. dbt projects cannot use it yet.
     */
    register: (connection: ExtensionConnection | Connection<any>) => Disposable;
    /**
     * Runs before a connection is deleted (a DuckLake instance comes as
     * `ducklake-<id>`). The deletion waits for the listener; a listener
     * that throws stops it and the user sees the message.
     */
    onWillDelete: (
      listener: (connectionId: string) => Promise<void> | void,
    ) => Disposable;
  };
  /**
   * Studio's own backend pieces (see `StudioMainApi`). An installed
   * extension reads them here; an extension that ships with Studio imports
   * the same things from `src/extensionApi/studioMain/`.
   */
  readonly studio: StudioMainApi;
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
