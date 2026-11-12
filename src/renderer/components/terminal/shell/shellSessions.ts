import { Terminal } from '@xterm/xterm';
import type {
  ITerminalInitOnlyOptions,
  ITerminalOptions,
  ITheme,
} from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebLinksAddon } from '@xterm/addon-web-links';
import { Unicode11Addon } from '@xterm/addon-unicode11';
import type {
  PtyDataEvent,
  PtyExitEvent,
  PtySessionInfo,
  PtyTitleEvent,
  ShellProfilesResult,
} from '../../../../types/pty';
import * as ptyApi from '../../../services/pty.service';
import { getPlatform } from '../../../lib/path';

/**
 * Renderer side of the OS shell terminal.
 *
 * The xterm.js instances live here, outside React, keyed by the session id
 * of the shell process in the main process. A terminal is drawn into its own
 * detached element which the panel component merely parks in the DOM while
 * it is visible. Switching bottom tabs, minimizing the panel or navigating
 * to another screen therefore never loses scrollback, a running command or
 * what the user was typing.
 */

export interface ShellSessionsState {
  /** All known sessions, oldest first. */
  sessions: PtySessionInfo[];
  /** Selected session per project id. */
  activeByProject: Record<string, string | undefined>;
  /** False until the sessions that survived a window reload were restored. */
  ready: boolean;
}

export interface ShellAppearance {
  theme: ITheme;
  fontFamily: string;
  fontSize: number;
}

export type ShellPtyApi = Pick<
  typeof ptyApi,
  | 'getShellProfiles'
  | 'createPtySession'
  | 'listPtySessions'
  | 'getPtySnapshot'
  | 'killPtySession'
  | 'renamePtySession'
  | 'writeToPty'
  | 'resizePty'
  | 'acknowledgePtyData'
  | 'onPtyData'
  | 'onPtyExit'
  | 'onPtyTitle'
  | 'openExternalLink'
>;

export type ShellTerminalOptions = ITerminalOptions & ITerminalInitOnlyOptions;

export interface ShellSessionsDeps {
  api: ShellPtyApi;
  createTerminal: (options: ShellTerminalOptions) => Terminal;
  platform: () => string;
  osVersion: () => string | undefined;
  clipboard: {
    readText: () => Promise<string>;
    writeText: (text: string) => Promise<void>;
  };
}

// Acknowledge rendered output in steps of this many characters (see the
// flow control notes in src/main/services/pty.service.ts).
export const ACK_CHUNK_CHARS = 5000;

const SCROLLBACK_LINES = 5000;
const DEFAULT_COLS = 80;
const DEFAULT_ROWS = 24;
// Lines handed to the AI assistant when nothing is selected.
const AI_CONTEXT_LINES = 200;
// Output that arrives for a session this window does not know yet (the
// shell answers before the "created" reply is processed) is parked briefly.
const MAX_ORPHAN_EVENTS = 2000;

interface RuntimeSession {
  id: string;
  terminal: Terminal;
  fit: FitAddon;
  host: HTMLDivElement;
  opened: boolean;
  exited: boolean;
  /** Output below this offset is already on screen (restored snapshot). */
  dropBefore: number;
  /** Set while a snapshot is being fetched; live output waits in here. */
  queued: PtyDataEvent[] | null;
  ackPending: number;
}

const exitMessage = (exitCode: number | null) =>
  `\r\n\x1b[90m[Process exited${
    exitCode === null ? '' : ` with code ${exitCode}`
  }]\x1b[0m\r\n`;

const defaultAppearance: ShellAppearance = {
  theme: {},
  fontFamily: 'monospace',
  fontSize: 12,
};

export class ShellSessionManager {
  private state: ShellSessionsState = {
    sessions: [],
    activeByProject: {},
    ready: false,
  };

  private listeners = new Set<() => void>();

  private runtimes = new Map<string, RuntimeSession>();

  private orphanData = new Map<string, PtyDataEvent[]>();

  private orphanExits = new Map<string, PtyExitEvent>();

  private initPromise: Promise<void> | null = null;

  private appearance: ShellAppearance = defaultAppearance;

  private lastSize = { cols: DEFAULT_COLS, rows: DEFAULT_ROWS };

  private readonly deps: ShellSessionsDeps;

  constructor(deps: ShellSessionsDeps) {
    this.deps = deps;
  }

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  getState = (): ShellSessionsState => this.state;

  /**
   * Starts listening to the main process and restores the sessions that are
   * still running there (the shells outlive a reload of this window).
   */
  init(): Promise<void> {
    if (this.initPromise) return this.initPromise;

    this.deps.api.onPtyData((event) => this.handleData(event));
    this.deps.api.onPtyExit((event) => this.handleExit(event));
    this.deps.api.onPtyTitle((event) => this.handleTitle(event));

    this.initPromise = this.restore()
      .catch(() => undefined)
      .then(() => this.setState({ ready: true }));
    return this.initPromise;
  }

  getProfiles(): Promise<ShellProfilesResult> {
    return this.deps.api.getShellProfiles();
  }

  sessionsFor(projectId: string): PtySessionInfo[] {
    return this.state.sessions.filter(
      (session) => session.projectId === projectId,
    );
  }

  activeFor(projectId: string): PtySessionInfo | undefined {
    const sessions = this.sessionsFor(projectId);
    const activeId = this.state.activeByProject[projectId];
    return (
      sessions.find((session) => session.id === activeId) ??
      sessions[sessions.length - 1]
    );
  }

  async create(
    projectId: string,
    cwd: string,
    profileId?: string,
  ): Promise<PtySessionInfo> {
    const info = await this.deps.api.createPtySession({
      projectId,
      cwd,
      profileId,
      cols: this.lastSize.cols,
      rows: this.lastSize.rows,
    });
    this.register(info, false);
    this.setState({
      sessions: [...this.state.sessions, info],
      activeByProject: { ...this.state.activeByProject, [projectId]: info.id },
    });
    return info;
  }

  setActive(projectId: string, id: string): void {
    if (this.state.activeByProject[projectId] === id) return;
    this.setState({
      activeByProject: { ...this.state.activeByProject, [projectId]: id },
    });
  }

  /** Ends the shell and removes the session everywhere. */
  async kill(id: string): Promise<void> {
    this.forget(id);
    await this.deps.api.killPtySession(id).catch(() => undefined);
  }

  async killAll(projectId: string): Promise<void> {
    await Promise.all(
      this.sessionsFor(projectId).map((session) => this.kill(session.id)),
    );
  }

  async rename(id: string, title: string): Promise<void> {
    const info = await this.deps.api.renamePtySession(id, title);
    if (info) this.patchSession(id, info);
  }

  /**
   * Shows a session inside `container`. Returns the function that takes it
   * out again (the terminal itself keeps running).
   */
  attach(id: string, container: HTMLElement): () => void {
    const runtime = this.runtimes.get(id);
    if (!runtime) return () => undefined;

    container.appendChild(runtime.host);
    if (!runtime.opened) {
      runtime.terminal.open(runtime.host);
      runtime.opened = true;
    }
    this.fit(id);
    // The element was detached while hidden; repaint what changed meanwhile.
    runtime.terminal.refresh(0, runtime.terminal.rows - 1);

    return () => {
      if (runtime.host.parentElement === container) {
        container.removeChild(runtime.host);
      }
    };
  }

  /** Matches the terminal grid (and the shell's idea of it) to its box. */
  fit(id: string): void {
    const runtime = this.runtimes.get(id);
    if (!runtime || !runtime.opened || !runtime.host.isConnected) return;
    if (!runtime.host.clientWidth || !runtime.host.clientHeight) return;
    try {
      runtime.fit.fit();
    } catch {
      // Measuring can fail while the layout is mid-transition; the next
      // resize notification fits again.
    }
  }

  focus(id: string): void {
    this.runtimes.get(id)?.terminal.focus();
  }

  clear(id: string): void {
    this.runtimes.get(id)?.terminal.clear();
  }

  selectAll(id: string): void {
    this.runtimes.get(id)?.terminal.selectAll();
  }

  getSelection(id: string): string {
    return this.runtimes.get(id)?.terminal.getSelection() ?? '';
  }

  async copySelection(id: string): Promise<boolean> {
    const text = this.getSelection(id);
    if (!text) return false;
    await this.deps.clipboard.writeText(text);
    return true;
  }

  async paste(id: string): Promise<void> {
    const runtime = this.runtimes.get(id);
    if (!runtime || runtime.exited) return;
    const text = await this.deps.clipboard.readText();
    // terminal.paste applies bracketed paste and line ending rules.
    if (text) runtime.terminal.paste(text);
  }

  /** The last lines on screen (plus scrollback), as plain text. */
  getRecentText(id: string, maxLines = AI_CONTEXT_LINES): string {
    const runtime = this.runtimes.get(id);
    if (!runtime) return '';
    const buffer = runtime.terminal.buffer.active;
    const lines: string[] = [];
    for (
      let index = Math.max(0, buffer.length - maxLines);
      index < buffer.length;
      index += 1
    ) {
      const line = buffer.getLine(index);
      if (line) {
        const text = line.translateToString(true);
        // A wrapped row continues the previous line.
        if (line.isWrapped && lines.length > 0) {
          lines[lines.length - 1] += text;
        } else {
          lines.push(text);
        }
      }
    }
    return lines.join('\n').trim();
  }

  setAppearance(appearance: ShellAppearance): void {
    this.appearance = appearance;
    this.runtimes.forEach((runtime) => {
      const { options } = runtime.terminal;
      options.theme = appearance.theme;
      options.fontFamily = appearance.fontFamily;
      options.fontSize = appearance.fontSize;
      this.fit(runtime.id);
    });
  }

  private async restore(): Promise<void> {
    const sessions = await this.deps.api.listPtySessions();
    if (!sessions.length) return;

    // Register first (live output is queued), then replay each snapshot.
    sessions.forEach((info) => this.register(info, true));
    this.setState({ sessions: [...this.state.sessions, ...sessions] });

    await Promise.all(
      sessions.map(async (info) => {
        const runtime = this.runtimes.get(info.id);
        if (!runtime) return;
        const snapshot = await this.deps.api
          .getPtySnapshot(info.id)
          .catch(() => null);
        if (snapshot) {
          runtime.dropBefore = snapshot.endOffset;
          // Restored output was acknowledged by the snapshot itself.
          if (snapshot.data) runtime.terminal.write(snapshot.data);
        }
        const queued = runtime.queued ?? [];
        runtime.queued = null;
        queued.forEach((event) => this.writeData(runtime, event));
        if (info.exited) {
          runtime.exited = true;
          runtime.terminal.write(exitMessage(info.exitCode));
        }
        // The shell ended while its snapshot was on the way.
        const pendingExit = this.orphanExits.get(info.id);
        if (pendingExit) {
          this.orphanExits.delete(info.id);
          this.handleExit(pendingExit);
        }
      }),
    );
  }

  /**
   * Creates the terminal for a session. With `restoring` the session is
   * about to be redrawn from a snapshot, so live output waits in a queue
   * until that snapshot is on screen.
   */
  private register(info: PtySessionInfo, restoring: boolean): RuntimeSession {
    const existing = this.runtimes.get(info.id);
    if (existing) return existing;

    const terminal = this.deps.createTerminal(this.terminalOptions(info));
    const fit = new FitAddon();
    terminal.loadAddon(fit);
    terminal.loadAddon(
      new WebLinksAddon((event, uri) => {
        // Same gesture as editors: a plain click must stay a text selection.
        const modifier =
          this.deps.platform() === 'darwin' ? event.metaKey : event.ctrlKey;
        if (modifier) this.deps.api.openExternalLink(uri).catch(() => false);
      }),
    );
    try {
      terminal.loadAddon(new Unicode11Addon());
      terminal.unicode.activeVersion = '11';
    } catch {
      // Wide-character tables are an improvement, not a requirement.
    }

    const host = document.createElement('div');
    host.style.width = '100%';
    host.style.height = '100%';

    const runtime: RuntimeSession = {
      id: info.id,
      terminal,
      fit,
      host,
      opened: false,
      exited: info.exited,
      dropBefore: 0,
      queued: restoring ? [] : null,
      ackPending: 0,
    };
    this.runtimes.set(info.id, runtime);

    terminal.onData((data) => {
      if (!runtime.exited) this.deps.api.writeToPty(info.id, data);
    });
    terminal.onBinary((data) => {
      if (!runtime.exited) this.deps.api.writeToPty(info.id, data, true);
    });
    terminal.onResize(({ cols, rows }) => {
      this.lastSize = { cols, rows };
      if (!runtime.exited) this.deps.api.resizePty(info.id, cols, rows);
    });
    terminal.attachCustomKeyEventHandler((event) =>
      this.handleKey(runtime, event),
    );

    const orphans = this.orphanData.get(info.id);
    if (orphans) {
      this.orphanData.delete(info.id);
      orphans.forEach((event) => this.handleData(event));
    }
    const orphanExit = this.orphanExits.get(info.id);
    if (orphanExit) {
      this.orphanExits.delete(info.id);
      // Deferred: the caller has not added the session to the state yet.
      Promise.resolve()
        .then(() => this.handleExit(orphanExit))
        .catch(() => undefined);
    }

    return runtime;
  }

  private terminalOptions(info: PtySessionInfo): ShellTerminalOptions {
    const options: ShellTerminalOptions = {
      cols: info.cols || this.lastSize.cols,
      rows: info.rows || this.lastSize.rows,
      scrollback: SCROLLBACK_LINES,
      cursorBlink: true,
      allowProposedApi: true,
      fontFamily: this.appearance.fontFamily,
      fontSize: this.appearance.fontSize,
      theme: this.appearance.theme,
      // Option stays a normal modifier so accented characters and
      // international layouts keep working on macOS.
      macOptionIsMeta: false,
      rightClickSelectsWord: false,
      // Programs that hard-code colors for the "other" background (dark
      // blue on dark, yellow on light) stay readable.
      minimumContrastRatio: 4.5,
    };
    if (this.deps.platform() === 'win32') {
      const build = Number(
        (this.deps.osVersion() || '').split('.')[2] ?? Number.NaN,
      );
      options.windowsPty = {
        backend: 'conpty',
        buildNumber: Number.isFinite(build) ? build : undefined,
      };
    }
    return options;
  }

  /**
   * Clipboard shortcuts. Returning false keeps the key away from the shell.
   * - Windows: Ctrl+C copies when text is selected (otherwise it interrupts,
   *   as usual), Ctrl+V pastes.
   * - Windows/Linux: Ctrl+Shift+C / Ctrl+Shift+V.
   * - macOS: Cmd+C / Cmd+V / Cmd+A, Cmd+K clears.
   */
  private handleKey(runtime: RuntimeSession, event: KeyboardEvent): boolean {
    if (event.type !== 'keydown') return true;
    const platform = this.deps.platform();
    const key = event.key.toLowerCase();
    const { terminal } = runtime;

    const copy = (): boolean => {
      if (!terminal.hasSelection()) return false;
      this.copySelection(runtime.id).catch(() => false);
      terminal.clearSelection();
      return true;
    };
    const consume = (): false => {
      event.preventDefault();
      return false;
    };

    if (platform === 'darwin') {
      if (!event.metaKey || event.ctrlKey || event.altKey) return true;
      if (key === 'c') return copy() ? consume() : true;
      if (key === 'v') {
        this.paste(runtime.id).catch(() => undefined);
        return consume();
      }
      if (key === 'a') {
        terminal.selectAll();
        return consume();
      }
      if (key === 'k') {
        terminal.clear();
        return consume();
      }
      return true;
    }

    if (!event.ctrlKey || event.altKey || event.metaKey) return true;

    if (event.shiftKey) {
      if (key === 'c') {
        copy();
        return consume();
      }
      if (key === 'v') {
        this.paste(runtime.id).catch(() => undefined);
        return consume();
      }
      return true;
    }

    if (platform === 'win32') {
      if (key === 'c') return copy() ? consume() : true;
      if (key === 'v') {
        this.paste(runtime.id).catch(() => undefined);
        return consume();
      }
    }
    return true;
  }

  private handleData(event: PtyDataEvent): void {
    const runtime = this.runtimes.get(event.id);
    if (!runtime) {
      const parked = this.orphanData.get(event.id) ?? [];
      if (parked.length < MAX_ORPHAN_EVENTS) parked.push(event);
      this.orphanData.set(event.id, parked);
      return;
    }
    if (runtime.queued) {
      runtime.queued.push(event);
      return;
    }
    this.writeData(runtime, event);
  }

  private writeData(runtime: RuntimeSession, event: PtyDataEvent): void {
    const { length } = event.data;
    // Already part of the snapshot this terminal was restored from.
    if (event.offset < runtime.dropBefore) return;
    runtime.terminal.write(event.data, () => {
      runtime.ackPending += length;
      if (runtime.ackPending >= ACK_CHUNK_CHARS) {
        const chars = runtime.ackPending;
        runtime.ackPending = 0;
        this.deps.api.acknowledgePtyData(runtime.id, chars);
      }
    });
  }

  private handleExit(event: PtyExitEvent): void {
    const runtime = this.runtimes.get(event.id);
    if (!runtime) {
      // The shell ended before this window learned the session exists (it
      // failed right after starting); applied once the session registers.
      if (this.orphanExits.size >= MAX_ORPHAN_EVENTS) this.orphanExits.clear();
      this.orphanExits.set(event.id, event);
      return;
    }
    if (runtime.exited) return;
    if (runtime.queued) {
      // Still being redrawn from its snapshot; applied right after.
      this.orphanExits.set(event.id, event);
      return;
    }

    // The user ended the shell themselves (`exit`, Ctrl+D): close the tab,
    // as terminals do. A failure stays on screen so it can be read.
    if (event.exitCode === 0) {
      this.kill(event.id).catch(() => undefined);
      return;
    }
    runtime.exited = true;
    runtime.terminal.write(exitMessage(event.exitCode));
    this.patchSession(event.id, { exited: true, exitCode: event.exitCode });
  }

  private handleTitle(event: PtyTitleEvent): void {
    this.patchSession(event.id, {
      title: event.title,
      customTitle: event.customTitle,
    });
  }

  private patchSession(id: string, patch: Partial<PtySessionInfo>): void {
    if (!this.state.sessions.some((session) => session.id === id)) return;
    this.setState({
      sessions: this.state.sessions.map((session) =>
        session.id === id ? { ...session, ...patch, id } : session,
      ),
    });
  }

  private forget(id: string): void {
    const runtime = this.runtimes.get(id);
    if (runtime) {
      this.runtimes.delete(id);
      runtime.host.remove();
      try {
        runtime.terminal.dispose();
      } catch {
        // Already disposed.
      }
    }
    this.orphanData.delete(id);
    this.orphanExits.delete(id);

    const removed = this.state.sessions.find((session) => session.id === id);
    if (!removed) return;
    const sessions = this.state.sessions.filter((session) => session.id !== id);
    const activeByProject = { ...this.state.activeByProject };
    if (activeByProject[removed.projectId] === id) {
      // Select the neighbour that took the closed session's place.
      const siblings = sessions.filter(
        (session) => session.projectId === removed.projectId,
      );
      const formerIndex = this.state.sessions
        .filter((session) => session.projectId === removed.projectId)
        .findIndex((session) => session.id === id);
      const next = siblings[Math.min(formerIndex, siblings.length - 1)];
      activeByProject[removed.projectId] = next?.id;
    }
    this.setState({ sessions, activeByProject });
  }

  private setState(patch: Partial<ShellSessionsState>): void {
    this.state = { ...this.state, ...patch };
    this.listeners.forEach((listener) => listener());
  }
}

export const shellSessions = new ShellSessionManager({
  api: ptyApi,
  createTerminal: (options) => new Terminal(options),
  platform: () => getPlatform(),
  osVersion: () => window.electron.app.osVersion,
  clipboard: {
    readText: () => navigator.clipboard.readText(),
    writeText: (text) => navigator.clipboard.writeText(text),
  },
});
