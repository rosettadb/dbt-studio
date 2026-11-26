import * as monaco from 'monaco-editor';
import type {
  ExtensionRendererApi,
  ExtensionRendererModule,
} from '../../extensionApi/renderer';
import type { Channels } from '../../types/ipc';
import {
  extensionIdOf,
  type ExtensionDescription,
} from '../shared/manifest.shared';
import {
  disposeAll,
  toDisposable,
  type Disposable,
  type ExtensionBridgeRequest,
  type ExtensionBridgeResponse,
  type FileDidSaveEvent,
} from '../shared/protocol.shared';
import {
  appProviders,
  dashboardCards,
  editorActions,
  fileTreeHoverPreviews,
  fileTreeRowActions,
  navigationItems,
  projectMenuItems,
  screens,
  settingsPages,
  slotRegistry,
  workspaceTabRegistry,
} from './contributions.renderer';
import { loadExtensionModule } from './moduleLoader.renderer';
import {
  emitFileDidSave,
  onDidCloseFile,
  onDidOpenFile,
  onDidSaveFile,
  onWillSaveFile,
} from './documents.renderer';
import { registerFileView } from '../../renderer/components/fileViews/registry';
import { registerTerminalPanel } from '../../renderer/components/terminal/panels/registry';
import { registerCommand } from '../../renderer/components/commandPalette/commands';
import { registerConnectionUi } from '../../connections/core/uiRegistry.renderer';
import { completeExtensionDescriptor } from '../../connections/registry.shared';

const messageOf = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

interface Entry {
  description: ExtensionDescription;
  module?: ExtensionRendererModule;
  /** Everything the extension added to the UI; disposed on deactivation. */
  tracked: Disposable[];
  exports?: unknown;
  active: boolean;
  error?: string;
}

/** An extension as the Extensions screen shows it: both halves' state. */
export interface ExtensionStatus extends ExtensionDescription {
  /** Whether the UI half is running in this window. */
  uiActive: boolean;
  /** Why the UI half is not running, when it should be. */
  uiError?: string;
}

type BridgeHandler = (payload: any) => unknown | Promise<unknown>;

/**
 * Renderer extension host. Follows the list the main host publishes: the UI
 * half of every extension the main host reports as active is loaded and
 * activated here, and deactivated again when it stops being active. Whatever
 * an extension adds through its `api` is tracked and removed with it.
 */
export class ExtensionHostRenderer {
  private readonly builtins = new Map<string, ExtensionRendererModule>();

  private readonly entries = new Map<string, Entry>();

  private readonly activationOrder: string[] = [];

  private readonly bridgeHandlers = new Map<string, BridgeHandler>();

  private readonly listeners = new Set<() => void>();

  private descriptions: ExtensionDescription[] = [];

  private snapshot: ReadonlyArray<ExtensionStatus> = [];

  private startPromise: Promise<void> | null = null;

  /** Serialises changes so two of them never interleave. */
  private queue: Promise<unknown> = Promise.resolve();

  /** Adds the UI half of an internal extension. Called before `start`. */
  registerBuiltin(
    manifest: { publisher: string; name: string },
    module: ExtensionRendererModule,
  ): void {
    this.builtins.set(extensionIdOf(manifest), module);
  }

  /** Activates what should run and starts following changes. Idempotent. */
  start(): Promise<void> {
    if (!this.startPromise) {
      this.startPromise = (async () => {
        const { ipcRenderer } = window.electron;
        ipcRenderer.on('extensions:changed', (list) => {
          this.apply(list as ExtensionDescription[]);
        });
        ipcRenderer.on('extensions:bridge:request', (request) => {
          this.answerBridge(request as ExtensionBridgeRequest);
        });
        // The main process reports every saved file (editor and AI agent).
        ipcRenderer.on('extensions:file:didSave', (event) => {
          emitFileDidSave(event as FileDidSaveEvent);
        });
        try {
          const list = await ipcRenderer.invoke('extensions:list');
          await this.apply(Array.isArray(list) ? list : []);
        } catch (error) {
          // The window must still open when the list cannot be read.
          // eslint-disable-next-line no-console
          console.error(
            '[extensions] Could not load the extension list:',
            error,
          );
        }
      })();
    }
    return this.startPromise;
  }

  isStarted = (): boolean => this.startPromise !== null;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  getSnapshot = (): ReadonlyArray<ExtensionStatus> => this.snapshot;

  getExports<T = unknown>(extensionId: string): T | undefined {
    const entry = this.entries.get(extensionId);
    return entry?.active ? (entry.exports as T | undefined) : undefined;
  }

  /** Brings the running UI halves in line with a list from the main host. */
  apply(descriptions: ExtensionDescription[]): Promise<void> {
    const operation = async () => {
      this.descriptions = descriptions;
      const wanted = new Set(
        descriptions
          .filter((description) => description.state === 'active')
          .map((description) => description.id),
      );

      // Stop what should no longer run, most recently started first.
      const toStop = [...this.activationOrder]
        .reverse()
        .filter((id) => !wanted.has(id));
      await toStop.reduce(async (previous, id) => {
        await previous;
        await this.stopEntry(id);
      }, Promise.resolve());

      // The list is in dependency order, so each starts after what it needs.
      await descriptions.reduce(async (previous, description) => {
        await previous;
        if (!wanted.has(description.id)) {
          const stale = this.entries.get(description.id);
          if (stale) stale.error = undefined;
          return;
        }
        await this.startEntry(description);
      }, Promise.resolve());

      this.publish();
    };
    const result = this.queue.then(operation, operation);
    this.queue = result.catch(() => undefined);
    return result;
  }

  private publish(): void {
    this.snapshot = this.descriptions.map((description) => {
      const entry = this.entries.get(description.id);
      return {
        ...description,
        uiActive: entry?.active ?? false,
        uiError: entry?.error,
      };
    });
    this.listeners.forEach((listener) => listener());
  }

  private async resolveModule(
    description: ExtensionDescription,
  ): Promise<ExtensionRendererModule | undefined> {
    if (description.source === 'builtin') {
      return this.builtins.get(description.id);
    }
    return description.manifest.renderer
      ? loadExtensionModule(description)
      : undefined;
  }

  private async startEntry(description: ExtensionDescription): Promise<void> {
    const existing = this.entries.get(description.id);
    if (existing?.active) {
      existing.description = description;
      return;
    }
    const entry: Entry = {
      description,
      tracked: [],
      active: false,
    };
    this.entries.set(description.id, entry);

    try {
      const missing = (description.manifest.extensionDependencies ?? []).find(
        (id) => !this.entries.get(id)?.active,
      );
      if (missing) {
        throw new Error(
          `Needs "${missing}", which did not start in this window`,
        );
      }
      const module = await this.resolveModule(description);
      if (module) {
        entry.exports = await module.activate(this.createApi(entry));
      }
      entry.module = module;
      entry.active = true;
      this.activationOrder.push(description.id);
    } catch (error) {
      // Take back whatever it added before it failed.
      disposeAll(entry.tracked);
      entry.error = messageOf(error);
      // eslint-disable-next-line no-console
      console.error(`[extensions] ${description.id} failed to start:`, error);
    }
  }

  private async stopEntry(extensionId: string): Promise<void> {
    const index = this.activationOrder.indexOf(extensionId);
    if (index >= 0) this.activationOrder.splice(index, 1);
    const entry = this.entries.get(extensionId);
    if (!entry?.active) return;

    try {
      await entry.module?.deactivate?.();
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error(`[extensions] ${extensionId} deactivate failed:`, error);
    }
    disposeAll(entry.tracked, (error) =>
      // eslint-disable-next-line no-console
      console.error(`[extensions] ${extensionId} clean-up failed:`, error),
    );
    this.entries.delete(extensionId);
  }

  private async answerBridge(request: ExtensionBridgeRequest): Promise<void> {
    const handler = this.bridgeHandlers.get(
      `${request.extensionId}\n${request.operation}`,
    );
    // Stay silent when this window has nothing to answer with, so another
    // window can; the main half times out if nobody does.
    if (!handler) return;

    let response: ExtensionBridgeResponse;
    try {
      response = {
        requestId: request.requestId,
        success: true,
        data: await handler(request.payload),
      };
    } catch (error) {
      response = {
        requestId: request.requestId,
        success: false,
        error: messageOf(error),
      };
    }
    await window.electron.ipcRenderer.invoke(
      'extensions:bridge:response',
      response,
    );
  }

  private createApi(entry: Entry): ExtensionRendererApi {
    const { id } = entry.description;
    const track = (disposable: Disposable): Disposable => {
      entry.tracked.push(disposable);
      return disposable;
    };
    const prefix = `[extension ${id}]`;
    const storageKey = (key: string) => `extension:${id}:${key}`;

    return {
      extension: { ...entry.description },
      subscriptions: entry.tracked,
      navigation: {
        addItem: (item) => track(navigationItems.add(item)),
      },
      screens: {
        add: (screen) => track(screens.add(screen)),
      },
      workspaceTabs: {
        add: (screenId, tab) => track(workspaceTabRegistry(screenId).add(tab)),
      },
      connections: {
        register: (connection) => {
          const descriptor = completeExtensionDescriptor(
            connection?.descriptor,
          );
          return track(
            toDisposable(
              registerConnectionUi(
                {
                  // The SQL Editor gets the saved settings as they are,
                  // unless the extension maps them itself.
                  sqlEditorInput: (conn) => ({ ...conn }),
                  ...connection.ui,
                  type: descriptor.type as any,
                },
                descriptor,
              ),
            ),
          );
        },
      },
      slots: {
        add: (slotId, contribution) =>
          track(slotRegistry(slotId).add(contribution)),
      },
      dashboard: {
        addCard: (card) => track(dashboardCards.add(card)),
      },
      settings: {
        addPage: (page) => track(settingsPages.add(page)),
      },
      app: {
        addProvider: (provider) => track(appProviders.add(provider)),
      },
      fileViews: {
        add: (view) => track(registerFileView(view)),
      },
      editor: {
        addAction: (action) => track(editorActions.add(action)),
      },
      monaco,
      files: {
        onWillSave: (participant) => track(onWillSaveFile(participant)),
        onDidSave: (listener) => track(onDidSaveFile(listener)),
        onDidOpen: (listener) => track(onDidOpenFile(listener)),
        onDidClose: (listener) => track(onDidCloseFile(listener)),
      },
      fileTree: {
        addRowAction: (action) => track(fileTreeRowActions.add(action)),
        addHoverPreview: (preview) => track(fileTreeHoverPreviews.add(preview)),
      },
      projectMenu: {
        addItem: (item) => track(projectMenuItems.add(item)),
      },
      panels: {
        add: (panel) => track(registerTerminalPanel(panel)),
      },
      commands: {
        add: (command) => track(toDisposable(registerCommand(command))),
      },
      ipc: {
        // Extension channels are not in Studio's channel list, hence the cast.
        invoke: (channel, ...args) =>
          window.electron.ipcRenderer.invoke(channel as Channels, ...args),
        on: (channel, listener) => {
          const off = window.electron.ipcRenderer.on(
            channel as Channels,
            listener,
          );
          // Tracked, so it is removed with the extension. Code that removes
          // it itself (a component that unmounts) also takes it off the
          // list, which then does not grow while screens open and close.
          const subscription = toDisposable(() => {
            if (typeof off === 'function') off();
            const index = entry.tracked.indexOf(subscription);
            if (index >= 0) entry.tracked.splice(index, 1);
          });
          return track(subscription);
        },
      },
      bridge: {
        handle: (operation, handler) => {
          const key = `${id}\n${operation}`;
          this.bridgeHandlers.set(key, handler);
          return track(
            toDisposable(() => {
              if (this.bridgeHandlers.get(key) === handler) {
                this.bridgeHandlers.delete(key);
              }
            }),
          );
        },
      },
      extensions: {
        getExports: (extensionId) => this.getExports(extensionId),
      },
      storage: {
        get: (key) => {
          const raw = window.localStorage.getItem(storageKey(key));
          if (raw === null) return undefined;
          try {
            return JSON.parse(raw);
          } catch {
            return undefined;
          }
        },
        set: (key, value) =>
          window.localStorage.setItem(storageKey(key), JSON.stringify(value)),
        remove: (key) => window.localStorage.removeItem(storageKey(key)),
      },
      log: {
        // eslint-disable-next-line no-console
        info: (...args) => console.log(prefix, ...args),
        // eslint-disable-next-line no-console
        warn: (...args) => console.warn(prefix, ...args),
        // eslint-disable-next-line no-console
        error: (...args) => console.error(prefix, ...args),
      },
    };
  }
}
