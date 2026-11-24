import { BrowserWindow, ipcMain, type WebContents } from 'electron';
import fs from 'fs-extra';
import path from 'path';
import { createRequire } from 'module';
import type {
  StartupTask,
  ExtensionMainApi,
  ExtensionMainModule,
} from '../../extensionApi/main';
import {
  extensionIdOf,
  orderByDependencies,
  parseExtensionManifest,
  satisfiesEngine,
  type ExtensionDescription,
} from '../shared/manifest.shared';
import {
  disposeAll,
  toDisposable,
  type Disposable,
  type ExtensionBridgeRequest,
  type ExtensionBridgeResponse,
  type ExtensionHostChannels,
} from '../shared/protocol.shared';
import {
  commitInstall,
  discardStaged,
  discoverInstalled,
  getExtensionStoragePath,
  readState,
  removeInstalled,
  stageInstall,
  writeState,
} from './extensionStore.main';
import { onDidSaveFile } from './fileEvents.main';
import { Connection } from '../../connections/core/Connection.main';
import {
  connectorFromDefinition,
  registerConnector,
} from '../../connections/core/connectorRegistry.main';
import { completeExtensionDescriptor } from '../../connections/registry.shared';
import { registerScreenAgent } from '../../main/services/ai/agents/screenAgents';
import { registerProjectToolset } from '../../main/services/ai/agents/projectToolsets';
import { onWillDeleteConnection } from '../../main/services/connectionEvents';

// `__non_webpack_require__` is webpack's handle to Node's real `require`; it
// does not exist when this file runs outside a webpack bundle (jest).
type NativeRequire = ReturnType<typeof createRequire>;
// eslint-disable-next-line camelcase, no-underscore-dangle
declare const __non_webpack_require__: NativeRequire | undefined;
const getNativeRequire = (): NativeRequire =>
  // eslint-disable-next-line camelcase
  typeof __non_webpack_require__ === 'function'
    ? // eslint-disable-next-line camelcase
      __non_webpack_require__
    : createRequire(__filename);

const DEFAULT_BRIDGE_TIMEOUT_MS = 15_000;
const CHANGED_CHANNEL: ExtensionHostChannels = 'extensions:changed';
const BRIDGE_REQUEST_CHANNEL: ExtensionHostChannels =
  'extensions:bridge:request';

const messageOf = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

const liveWebContents = (): WebContents[] =>
  // getAllWindows is absent when this runs outside Electron (unit tests).
  typeof BrowserWindow?.getAllWindows === 'function'
    ? BrowserWindow.getAllWindows()
        .filter((win) => !win.isDestroyed())
        .map((win) => win.webContents)
    : [];

interface Entry {
  description: ExtensionDescription;
  /** Main half of an internal extension (compiled into the app). */
  builtinModule?: ExtensionMainModule;
  /** The module that is currently activated. */
  module?: ExtensionMainModule;
  /** Everything the extension registered; disposed on deactivation. */
  tracked: Disposable[];
  exports?: unknown;
  /**
   * Whether the extension is switched on for this run. Follows
   * `description.enabled`, except while a change waits for a restart.
   */
  liveEnabled: boolean;
  /** Its code has been loaded into this process or a window this run. */
  codeLoaded: boolean;
  /** A folder without a usable manifest: listed so it can be removed, never run. */
  broken?: boolean;
}

interface PendingBridgeRequest {
  resolve: (value: any) => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

/** State of an extension that is not running: switched off, or merely idle. */
const idleStateOf = (entry: Entry): ExtensionDescription['state'] =>
  entry.description.enabled ? 'inactive' : 'disabled';

export interface ExtensionHostOptions {
  /** Studio's version, checked against `engines.rosettaStudio`. */
  studioVersion: string;
}

/**
 * Main-process extension host. Knows every extension (internal and
 * installed), decides which may run, activates and deactivates their main
 * halves, and removes everything an extension registered when it stops.
 * The renderer host follows the list this host publishes.
 */
export class ExtensionHostMain {
  private readonly entries = new Map<string, Entry>();

  private readonly activationOrder: string[] = [];

  private readonly pendingBridge = new Map<string, PendingBridgeRequest>();

  private bridgeSequence = 0;

  private readonly startupTasks: StartupTask[] = [];

  private mainWindow: BrowserWindow | null = null;

  private startPromise: Promise<void> | null = null;

  /** Serialises changes so two of them never interleave. */
  private queue: Promise<unknown> = Promise.resolve();

  private readonly options: ExtensionHostOptions;

  constructor(options: ExtensionHostOptions) {
    this.options = options;
  }

  /**
   * Adds an internal extension. Called before `start`, for the extensions
   * compiled into the app. `module` is absent when it has no main half.
   */
  registerBuiltin(manifest: unknown, module?: ExtensionMainModule): void {
    const parsed = parseExtensionManifest(manifest);
    if (!parsed.ok) {
      throw new Error(
        `Invalid internal extension manifest: ${parsed.errors.join('; ')}`,
      );
    }
    const id = extensionIdOf(parsed.manifest);
    this.entries.set(id, {
      description: {
        id,
        manifest: parsed.manifest,
        source: 'builtin',
        enabled: true,
        state: 'inactive',
      },
      builtinModule: module,
      tracked: [],
      liveEnabled: true,
      codeLoaded: true,
    });
  }

  /** The window extensions get from `api.windows.getMainWindow()`. */
  setMainWindow(window: BrowserWindow | null): void {
    this.mainWindow = window;
  }

  /**
   * Runs what extensions asked to do while Studio starts, one after the
   * other. A failing task is logged and the rest still run.
   */
  async runStartupTasks(
    setMessage: (message: string) => Promise<void>,
  ): Promise<void> {
    await this.whenReady();
    await [...this.startupTasks].reduce(async (previous, task) => {
      await previous;
      try {
        await task.run({ setMessage });
      } catch (error) {
        // eslint-disable-next-line no-console
        console.error(`[extensions] Start-up task "${task.id}" failed:`, error);
      }
    }, Promise.resolve());
  }

  /** Finds installed extensions and activates everything that may run. Idempotent. */
  start(): Promise<void> {
    if (!this.startPromise) {
      this.startPromise = this.enqueue(async () => {
        try {
          this.loadInstalled();
        } catch (error) {
          // A problem reading the extensions folder must not stop Studio.
          // eslint-disable-next-line no-console
          console.error(
            '[extensions] Could not read installed extensions:',
            error,
          );
        }
        const { disabled } = readState();
        this.entries.forEach((entry) => {
          if (entry.broken) return;
          const enabled = !disabled.includes(entry.description.id);
          entry.description.enabled = enabled;
          entry.liveEnabled = enabled;
        });
        await this.reconcile();
      });
    }
    return this.startPromise;
  }

  /** Resolves once the first activation pass has finished. */
  whenReady(): Promise<void> {
    return this.startPromise ?? Promise.resolve();
  }

  /** Every extension, each after the ones it depends on. */
  list(): ExtensionDescription[] {
    const all = Array.from(this.entries.values()).map((entry) => ({
      ...entry.description,
    }));
    const { ordered, unresolved } = orderByDependencies(all);
    return [...ordered, ...unresolved.map((item) => item.extension)];
  }

  getExports<T = unknown>(extensionId: string): T | undefined {
    const entry = this.entries.get(extensionId);
    return entry?.description.state === 'active'
      ? (entry.exports as T | undefined)
      : undefined;
  }

  setEnabled(extensionId: string, enabled: boolean): Promise<void> {
    return this.enqueue(async () => {
      const entry = this.requireEntry(extensionId);
      entry.description.enabled = enabled;

      const state = readState();
      const disabled = state.disabled.filter((id) => id !== extensionId);
      if (!enabled) disabled.push(extensionId);
      writeState({ ...state, disabled });

      if (entry.description.manifest.requiresRestart) {
        // Applied at the next start; nothing changes in this run.
        entry.description.restartPending = entry.liveEnabled !== enabled;
      } else {
        entry.liveEnabled = enabled;
      }
      await this.reconcile();
      this.publish();
    });
  }

  /** Installs an extension from a folder or a `.zip`. Returns its id. */
  install(sourcePath: string): Promise<string> {
    return this.enqueue(async () => {
      const staged = stageInstall(sourcePath);
      const id = extensionIdOf(staged.manifest);
      const existing = this.entries.get(id);
      if (existing?.description.source === 'builtin') {
        discardStaged(staged);
        throw new Error(`"${id}" is part of Studio and cannot be replaced`);
      }

      // Code of an older copy that already ran cannot be unloaded, so the
      // new copy starts after a restart.
      const needsRestart =
        (existing?.codeLoaded ?? false) ||
        staged.manifest.requiresRestart === true;
      if (existing) await this.stopEntry(existing);

      const location = commitInstall(staged);
      const state = readState();
      writeState({
        ...state,
        disabled: state.disabled.filter((disabledId) => disabledId !== id),
      });

      this.entries.set(id, {
        description: {
          id,
          manifest: staged.manifest,
          source: 'installed',
          location,
          enabled: true,
          state: 'inactive',
          restartPending: needsRestart || undefined,
        },
        tracked: [],
        liveEnabled: !needsRestart,
        codeLoaded: existing?.codeLoaded ?? false,
      });
      await this.reconcile();
      this.publish();
      return id;
    });
  }

  uninstall(extensionId: string): Promise<void> {
    return this.enqueue(async () => {
      const entry = this.requireEntry(extensionId);
      if (entry.description.source !== 'installed') {
        throw new Error(`"${extensionId}" is part of Studio`);
      }
      await this.stopEntry(entry);
      if (entry.description.location) {
        removeInstalled(entry.description.location);
      }
      this.entries.delete(extensionId);

      const state = readState();
      writeState({
        ...state,
        disabled: state.disabled.filter((id) => id !== extensionId),
      });
      // Extensions that depended on it stop too.
      await this.reconcile();
      this.publish();
    });
  }

  /** Stops every main half. Called once, when the app quits. */
  deactivateAll(): Promise<void> {
    return this.enqueue(async () => {
      const running = [...this.activationOrder].reverse();
      await running.reduce(async (previous, id) => {
        await previous;
        const entry = this.entries.get(id);
        if (entry) await this.stopEntry(entry);
      }, Promise.resolve());
    });
  }

  /**
   * The file an installed, enabled extension serves to its UI half, or null
   * when the path is not inside that extension.
   */
  resolveResource(extensionId: string, relativePath: string): string | null {
    const entry = this.entries.get(extensionId);
    const location = entry?.description.location;
    if (!entry || !location || !entry.description.enabled) return null;
    const resolved = path.resolve(location, relativePath);
    const relative = path.relative(location, resolved);
    if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) {
      return null;
    }
    return resolved;
  }

  /** The UI answered a `bridge.request`. */
  resolveBridgeResponse(response: ExtensionBridgeResponse): void {
    const pending = this.pendingBridge.get(response.requestId);
    if (!pending) return;
    this.pendingBridge.delete(response.requestId);
    clearTimeout(pending.timer);
    if (response.success) {
      pending.resolve(response.data);
    } else {
      pending.reject(
        new Error(response.error || 'The window reported an error'),
      );
    }
  }

  private enqueue<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.queue.then(operation, operation);
    // Keep the chain alive after a failed operation.
    this.queue = result.catch(() => undefined);
    return result;
  }

  private requireEntry(extensionId: string): Entry {
    const entry = this.entries.get(extensionId);
    if (!entry) throw new Error(`Unknown extension "${extensionId}"`);
    return entry;
  }

  private loadInstalled(): void {
    discoverInstalled().forEach((found) => {
      if (!found.manifest) {
        // Shown on the Extensions screen so it can be seen and removed.
        this.entries.set(found.folderName, {
          description: {
            id: found.folderName,
            manifest: {
              name: found.folderName,
              publisher: 'unknown',
              version: '0.0.0',
              engines: { rosettaStudio: '*' },
            },
            source: 'installed',
            location: found.location,
            enabled: false,
            state: 'failed',
            error: (found.errors ?? ['Invalid extension']).join('; '),
          },
          tracked: [],
          liveEnabled: false,
          codeLoaded: false,
          broken: true,
        });
        return;
      }
      const id = extensionIdOf(found.manifest);
      // An internal extension always wins over a folder with the same id.
      if (this.entries.has(id)) return;
      this.entries.set(id, {
        description: {
          id,
          manifest: found.manifest,
          source: 'installed',
          location: found.location,
          enabled: true,
          state: 'inactive',
        },
        tracked: [],
        liveEnabled: true,
        codeLoaded: false,
      });
    });
  }

  /**
   * Brings what is running in line with what should run: stops extensions
   * that may no longer run (dependants first), then starts the rest in
   * dependency order.
   */
  private async reconcile(): Promise<void> {
    const all = Array.from(this.entries.values()).filter(
      (entry) => !entry.broken,
    );
    const blocked = new Map<string, string>();

    const wanted = all.filter((entry) => entry.liveEnabled);
    const compatible = wanted.filter((entry) => {
      const range = entry.description.manifest.engines.rosettaStudio;
      if (satisfiesEngine(this.options.studioVersion, range)) return true;
      blocked.set(
        entry.description.id,
        `Needs Studio ${range}; this is ${this.options.studioVersion}`,
      );
      return false;
    });

    const { ordered, unresolved } = orderByDependencies(
      compatible.map((entry) => entry.description),
    );
    unresolved.forEach(({ extension, reason }) =>
      blocked.set(extension.id, reason),
    );
    const runnableIds = new Set(ordered.map((description) => description.id));

    // Stop what may no longer run, most recently started first.
    const toStop = [...this.activationOrder]
      .reverse()
      .filter((id) => !runnableIds.has(id));
    await toStop.reduce(async (previous, id) => {
      await previous;
      const entry = this.entries.get(id);
      if (entry) await this.stopEntry(entry);
    }, Promise.resolve());

    all.forEach((entry) => {
      const { description } = entry;
      if (runnableIds.has(description.id)) return;
      const reason = blocked.get(description.id);
      description.state = reason ? 'blocked' : idleStateOf(entry);
      description.error = reason;
    });

    // Start in dependency order. A dependency that failed blocks its dependants.
    await ordered.reduce(async (previous, description) => {
      await previous;
      const entry = this.entries.get(description.id);
      if (!entry || entry.description.state === 'active') return;
      const failedDependency = (
        entry.description.manifest.extensionDependencies ?? []
      ).find((id) => this.entries.get(id)?.description.state !== 'active');
      if (failedDependency) {
        entry.description.state = 'blocked';
        entry.description.error = `Needs "${failedDependency}", which did not start`;
        return;
      }
      await this.startEntry(entry);
    }, Promise.resolve());
  }

  // eslint-disable-next-line class-methods-use-this
  private loadModule(entry: Entry): ExtensionMainModule | undefined {
    const { description } = entry;
    if (description.source === 'builtin') return entry.builtinModule;
    entry.codeLoaded = true;
    if (!description.manifest.main || !description.location) return undefined;

    const entryFile = path.join(
      description.location,
      description.manifest.main,
    );
    const loaded = getNativeRequire()(entryFile);
    const module: ExtensionMainModule = loaded?.default?.activate
      ? loaded.default
      : loaded;
    if (typeof module?.activate !== 'function') {
      throw new Error(
        `"${description.manifest.main}" does not export activate()`,
      );
    }
    return module;
  }

  private async startEntry(entry: Entry): Promise<void> {
    const { description } = entry;
    try {
      const module = this.loadModule(entry);
      if (module) {
        entry.exports = await module.activate(this.createApi(entry));
      }
      entry.module = module;
      description.state = 'active';
      description.error = undefined;
      this.activationOrder.push(description.id);
    } catch (error) {
      // Take back whatever it registered before it failed.
      disposeAll(entry.tracked);
      entry.module = undefined;
      entry.exports = undefined;
      description.state = 'failed';
      description.error = messageOf(error);
      // eslint-disable-next-line no-console
      console.error(`[extensions] ${description.id} failed to start:`, error);
    }
  }

  private async stopEntry(entry: Entry): Promise<void> {
    const { description } = entry;
    const index = this.activationOrder.indexOf(description.id);
    if (index >= 0) this.activationOrder.splice(index, 1);
    if (description.state !== 'active') return;

    try {
      await entry.module?.deactivate?.();
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error(`[extensions] ${description.id} deactivate failed:`, error);
    }
    disposeAll(entry.tracked, (error) =>
      // eslint-disable-next-line no-console
      console.error(`[extensions] ${description.id} clean-up failed:`, error),
    );
    entry.module = undefined;
    entry.exports = undefined;
    description.state = idleStateOf(entry);
    description.error = undefined;
  }

  private createApi(entry: Entry): ExtensionMainApi {
    const { id } = entry.description;
    const track = (disposable: Disposable): Disposable => {
      entry.tracked.push(disposable);
      return disposable;
    };
    const prefix = `[extension ${id}]`;

    return {
      extension: { ...entry.description },
      subscriptions: entry.tracked,
      ipc: {
        handle: (channel, handler) => {
          ipcMain.handle(channel, handler);
          return track(toDisposable(() => ipcMain.removeHandler(channel)));
        },
        send: (channel, payload, target) => {
          const targets = target ? [target] : liveWebContents();
          targets.forEach((webContents) => webContents.send(channel, payload));
        },
      },
      bridge: {
        request: (operation, payload, options) =>
          this.requestBridge(id, operation, payload, options),
      },
      workspace: {
        onDidSaveFile: (listener) => track(onDidSaveFile(listener)),
      },
      windows: {
        getMainWindow: () =>
          this.mainWindow && !this.mainWindow.isDestroyed()
            ? this.mainWindow
            : null,
      },
      startup: {
        addTask: (task) => {
          this.startupTasks.push(task);
          return track(
            toDisposable(() => {
              const index = this.startupTasks.indexOf(task);
              if (index >= 0) this.startupTasks.splice(index, 1);
            }),
          );
        },
      },
      agents: {
        add: (screenKey, factory, options) =>
          track(toDisposable(registerScreenAgent(screenKey, factory, options))),
      },
      projectAgent: {
        addTools: (toolset) =>
          track(toDisposable(registerProjectToolset(toolset))),
      },
      connections: {
        onWillDelete: (listener) =>
          track(toDisposable(onWillDeleteConnection(listener))),
        register: (connection) =>
          track(
            toDisposable(
              registerConnector(
                connection instanceof Connection
                  ? connection
                  : connectorFromDefinition({
                      ...connection,
                      descriptor: completeExtensionDescriptor(
                        connection?.descriptor,
                      ),
                    }),
              ),
            ),
          ),
      },
      get storagePath() {
        const storagePath = getExtensionStoragePath(id);
        fs.ensureDirSync(storagePath);
        return storagePath;
      },
      log: {
        // eslint-disable-next-line no-console
        info: (...args) => console.log(prefix, ...args),
        // eslint-disable-next-line no-console
        warn: (...args) => console.warn(prefix, ...args),
        // eslint-disable-next-line no-console
        error: (...args) => console.error(prefix, ...args),
      },
      extensions: {
        getExports: (extensionId) => this.getExports(extensionId),
      },
    };
  }

  private requestBridge<T>(
    extensionId: string,
    operation: string,
    payload: unknown,
    options: { target?: WebContents; timeoutMs?: number } = {},
  ): Promise<T> {
    const targets = options.target ? [options.target] : liveWebContents();
    if (targets.length === 0) {
      return Promise.reject(new Error('No window is open'));
    }
    this.bridgeSequence += 1;
    const requestId = `${Date.now()}-${this.bridgeSequence}`;
    const request: ExtensionBridgeRequest = {
      requestId,
      extensionId,
      operation,
      payload,
    };

    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pendingBridge.delete(requestId);
        reject(
          new Error(
            `No window answered "${operation}" for extension ${extensionId}`,
          ),
        );
      }, options.timeoutMs ?? DEFAULT_BRIDGE_TIMEOUT_MS);
      this.pendingBridge.set(requestId, { resolve, reject, timer });
      targets.forEach((webContents) =>
        webContents.send(BRIDGE_REQUEST_CHANNEL, request),
      );
    });
  }

  /** Tells every window the list changed. */
  private publish(): void {
    const list = this.list();
    liveWebContents().forEach((webContents) =>
      webContents.send(CHANGED_CHANNEL, list),
    );
  }
}
