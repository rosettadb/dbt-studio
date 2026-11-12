import { randomUUID } from 'crypto';
import fs from 'fs';
import { createRequire } from 'module';
import os from 'os';
import nodePath from 'path';
import type {
  PtyCreateRequest,
  PtyDataEvent,
  PtyExitEvent,
  PtySessionInfo,
  PtySnapshot,
  PtyTitleEvent,
  ShellProfile,
  ShellProfilesResult,
} from '../../types/pty';
import { detectShellProfiles } from '../utils/shellProfiles';

/** The slice of node-pty's IPty this service relies on. */
export interface PtyProcess {
  readonly pid: number;
  /** Name of the foreground process (the shell's name on Windows). */
  readonly process: string;
  onData: (listener: (data: string) => void) => { dispose: () => void };
  onExit: (
    listener: (event: { exitCode: number; signal?: number }) => void,
  ) => { dispose: () => void };
  write: (data: string | Buffer) => void;
  resize: (cols: number, rows: number) => void;
  kill: (signal?: string) => void;
  pause: () => void;
  resume: () => void;
}

export interface PtySpawnOptions {
  name: string;
  cols: number;
  rows: number;
  cwd: string;
  env: Record<string, string>;
}

export type PtySpawn = (
  file: string,
  args: string[],
  options: PtySpawnOptions,
) => PtyProcess;

export type PtyEventSink = {
  (channel: 'pty:data', payload: PtyDataEvent): void;
  (channel: 'pty:exit', payload: PtyExitEvent): void;
  (channel: 'pty:title', payload: PtyTitleEvent): void;
};

export interface PtyServiceDeps {
  spawn: PtySpawn;
  detectProfiles: () => ShellProfilesResult;
  buildEnv: () => Promise<Record<string, string>>;
  isDirectory: (dir: string) => boolean;
  homedir: () => string;
  platform: typeof process.platform;
}

// Output is coalesced for a few milliseconds so a command that prints
// thousands of lines becomes a handful of IPC messages instead of thousands.
export const DATA_FLUSH_INTERVAL_MS = 5;

// Flow control (same scheme and thresholds as VS Code's terminal): the
// renderer acknowledges what xterm has actually rendered; when too much is
// outstanding the pty is paused so a runaway command cannot grow the IPC
// queue and the renderer's memory without bound.
export const HIGH_WATERMARK_CHARS = 100000;
export const LOW_WATERMARK_CHARS = 5000;

// Output kept per session to redraw a terminal after the window reloads.
export const MAX_SCROLLBACK_CHARS = 1000000;

const TITLE_POLL_INTERVAL_MS = 1000;

const MIN_COLS = 2;
const MIN_ROWS = 1;
const MAX_COLS = 1000;
const MAX_ROWS = 500;
const DEFAULT_COLS = 80;
const DEFAULT_ROWS = 24;
const MAX_TITLE_LENGTH = 80;

interface Session {
  info: PtySessionInfo;
  pty: PtyProcess;
  profile: ShellProfile;
  scrollback: string[];
  scrollbackChars: number;
  /** Characters emitted to the renderer so far. */
  totalChars: number;
  pending: string;
  flushTimer: ReturnType<typeof setTimeout> | null;
  unackedChars: number;
  paused: boolean;
  disposables: Array<{ dispose: () => void }>;
}

const clampInt = (
  value: unknown,
  min: number,
  max: number,
  fallback: number,
) =>
  typeof value === 'number' && Number.isFinite(value)
    ? Math.min(max, Math.max(min, Math.floor(value)))
    : fallback;

/**
 * Owns the real shell processes behind the terminal panel. Sessions live in
 * the main process and are independent of any React component (and of the
 * window's renderer being reloaded): the renderer only attaches to them.
 */
export class PtyService {
  private sessions = new Map<string, Session>();

  private sink: PtyEventSink | null = null;

  private titleTimer: ReturnType<typeof setInterval> | null = null;

  private readonly deps: PtyServiceDeps;

  constructor(deps: PtyServiceDeps) {
    this.deps = deps;
  }

  /** Where session events go (the current window). */
  setEventSink(sink: PtyEventSink | null): void {
    this.sink = sink;
  }

  getProfiles(): ShellProfilesResult {
    return this.deps.detectProfiles();
  }

  list(): PtySessionInfo[] {
    return [...this.sessions.values()].map((session) => ({ ...session.info }));
  }

  async create(request: PtyCreateRequest): Promise<PtySessionInfo> {
    if (!request || typeof request.projectId !== 'string') {
      throw new Error('A project is required to open a terminal.');
    }

    const { profiles, defaultProfileId } = this.deps.detectProfiles();
    const profileId = request.profileId ?? defaultProfileId;
    const profile = profiles.find((candidate) => candidate.id === profileId);
    if (!profile) {
      throw new Error(
        request.profileId
          ? `The shell "${request.profileId}" is no longer available.`
          : 'No shell was found on this computer.',
      );
    }

    const cols = clampInt(request.cols, MIN_COLS, MAX_COLS, DEFAULT_COLS);
    const rows = clampInt(request.rows, MIN_ROWS, MAX_ROWS, DEFAULT_ROWS);
    const cwd =
      typeof request.cwd === 'string' && this.deps.isDirectory(request.cwd)
        ? request.cwd
        : this.deps.homedir();
    const env = await this.deps.buildEnv();

    let pty: PtyProcess;
    try {
      pty = this.deps.spawn(profile.path, profile.args, {
        name: 'xterm-256color',
        cols,
        rows,
        cwd,
        env,
      });
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      throw new Error(`Could not start ${profile.name}: ${reason}`);
    }

    const session: Session = {
      info: {
        id: randomUUID(),
        projectId: request.projectId,
        title: profile.shortName,
        customTitle: false,
        profileId: profile.id,
        profileName: profile.name,
        shellPath: profile.path,
        cwd,
        pid: pty.pid,
        cols,
        rows,
        createdAt: Date.now(),
        exited: false,
        exitCode: null,
      },
      pty,
      profile,
      scrollback: [],
      scrollbackChars: 0,
      totalChars: 0,
      pending: '',
      flushTimer: null,
      unackedChars: 0,
      paused: false,
      disposables: [],
    };
    this.sessions.set(session.info.id, session);

    session.disposables.push(
      pty.onData((data) => this.handleData(session, data)),
      pty.onExit((event) => this.handleExit(session, event)),
    );
    this.startTitlePolling();

    return { ...session.info };
  }

  write(id: string, data: string, binary = false): void {
    const session = this.sessions.get(id);
    if (!session || session.info.exited || typeof data !== 'string') return;
    try {
      session.pty.write(binary ? Buffer.from(data, 'binary') : data);
    } catch {
      // The shell went away between the keystroke and the write; its exit
      // event reports that to the renderer.
    }
  }

  resize(id: string, cols: number, rows: number): void {
    const session = this.sessions.get(id);
    if (!session || session.info.exited) return;
    const nextCols = clampInt(cols, MIN_COLS, MAX_COLS, session.info.cols);
    const nextRows = clampInt(rows, MIN_ROWS, MAX_ROWS, session.info.rows);
    if (nextCols === session.info.cols && nextRows === session.info.rows) {
      return;
    }
    try {
      session.pty.resize(nextCols, nextRows);
      session.info.cols = nextCols;
      session.info.rows = nextRows;
    } catch {
      // Resizing a pty whose process just exited throws; nothing to resize.
    }
  }

  /** The renderer finished rendering `chars` characters of this session. */
  acknowledge(id: string, chars: number): void {
    const session = this.sessions.get(id);
    if (!session || typeof chars !== 'number' || !(chars > 0)) return;
    session.unackedChars = Math.max(0, session.unackedChars - chars);
    if (session.paused && session.unackedChars < LOW_WATERMARK_CHARS) {
      this.resume(session);
    }
  }

  /**
   * Everything a freshly loaded renderer needs to redraw a session. Taking
   * a snapshot means a new consumer is attaching, so anything the previous
   * one never acknowledged is forgotten and output flows again.
   */
  snapshot(id: string): PtySnapshot | null {
    const session = this.sessions.get(id);
    if (!session) return null;
    this.flush(session);
    session.unackedChars = 0;
    if (session.paused) this.resume(session);
    return {
      data: session.scrollback.join(''),
      endOffset: session.totalChars,
    };
  }

  rename(id: string, title: string): PtySessionInfo | null {
    const session = this.sessions.get(id);
    if (!session) return null;
    const trimmed =
      typeof title === 'string' ? title.trim().slice(0, MAX_TITLE_LENGTH) : '';
    if (trimmed) {
      session.info.title = trimmed;
      session.info.customTitle = true;
    } else {
      session.info.customTitle = false;
      session.info.title = this.processTitle(session);
    }
    this.emitTitle(session);
    return { ...session.info };
  }

  /** Ends the shell (and what runs in it) and forgets the session. */
  kill(id: string): boolean {
    const session = this.sessions.get(id);
    if (!session) return false;
    this.sessions.delete(id);
    this.release(session);
    if (!session.info.exited) {
      try {
        session.pty.kill();
      } catch {
        // Already gone.
      }
    }
    if (this.sessions.size === 0) this.stopTitlePolling();
    return true;
  }

  killAll(): void {
    [...this.sessions.keys()].forEach((id) => this.kill(id));
  }

  private handleData(session: Session, data: string): void {
    if (!data) return;
    session.pending += data;
    if (session.flushTimer) return;
    session.flushTimer = setTimeout(
      () => this.flush(session),
      DATA_FLUSH_INTERVAL_MS,
    );
  }

  private flush(session: Session): void {
    if (session.flushTimer) {
      clearTimeout(session.flushTimer);
      session.flushTimer = null;
    }
    const data = session.pending;
    if (!data) return;
    session.pending = '';

    const offset = session.totalChars;
    session.totalChars += data.length;

    session.scrollback.push(data);
    session.scrollbackChars += data.length;
    while (
      session.scrollback.length > 1 &&
      session.scrollbackChars - session.scrollback[0].length >=
        MAX_SCROLLBACK_CHARS
    ) {
      session.scrollbackChars -= session.scrollback[0].length;
      session.scrollback.shift();
    }

    this.sink?.('pty:data', { id: session.info.id, data, offset });

    session.unackedChars += data.length;
    if (!session.paused && session.unackedChars > HIGH_WATERMARK_CHARS) {
      session.paused = true;
      try {
        session.pty.pause();
      } catch {
        session.paused = false;
      }
    }
  }

  // eslint-disable-next-line class-methods-use-this
  private resume(session: Session): void {
    session.paused = false;
    try {
      session.pty.resume();
    } catch {
      // The process ended while paused.
    }
  }

  private handleExit(
    session: Session,
    event: { exitCode: number; signal?: number },
  ): void {
    // Killed by the user: the session is already forgotten.
    if (!this.sessions.has(session.info.id)) return;
    this.flush(session);
    session.info.exited = true;
    session.info.exitCode =
      typeof event.exitCode === 'number' ? event.exitCode : null;
    this.release(session);
    this.sink?.('pty:exit', {
      id: session.info.id,
      exitCode: session.info.exitCode,
      signal: typeof event.signal === 'number' ? event.signal : null,
    });
  }

  // eslint-disable-next-line class-methods-use-this
  private release(session: Session): void {
    if (session.flushTimer) {
      clearTimeout(session.flushTimer);
      session.flushTimer = null;
    }
    session.disposables.forEach((disposable) => {
      try {
        disposable.dispose();
      } catch {
        // Listener already removed.
      }
    });
    session.disposables = [];
  }

  private processTitle(session: Session): string {
    // ConPTY cannot report the foreground process; node-pty returns the
    // shell it started, so the profile's label is the best title there.
    if (this.deps.platform === 'win32' || session.info.exited) {
      return session.profile.shortName;
    }
    try {
      // Linux reports argv[0], which is a path for most programs and
      // "-zsh" for login shells.
      const name = nodePath.posix
        .basename(session.pty.process || '')
        .replace(/^-/, '');
      return name || session.profile.shortName;
    } catch {
      return session.profile.shortName;
    }
  }

  private emitTitle(session: Session): void {
    this.sink?.('pty:title', {
      id: session.info.id,
      title: session.info.title,
      customTitle: session.info.customTitle,
    });
  }

  private startTitlePolling(): void {
    if (this.titleTimer || this.deps.platform === 'win32') return;
    this.titleTimer = setInterval(() => {
      this.sessions.forEach((session) => {
        if (session.info.exited || session.info.customTitle) return;
        const title = this.processTitle(session);
        if (title === session.info.title) return;
        session.info.title = title;
        this.emitTitle(session);
      });
    }, TITLE_POLL_INTERVAL_MS);
    this.titleTimer.unref?.();
  }

  private stopTitlePolling(): void {
    if (!this.titleTimer) return;
    clearInterval(this.titleTimer);
    this.titleTimer = null;
  }
}

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

type NodePtyModule = { spawn: PtySpawn };

let nodePtyModule: NodePtyModule | null = null;

/**
 * Loads node-pty lazily (a missing/broken native binary must only break the
 * terminal, not app start-up) and, in a packaged app, from the unpacked copy
 * next to app.asar: node-pty starts helper executables, a worker thread and
 * a forked script from its own folder, and none of those can be started
 * from inside an asar archive.
 */
export const loadNodePty = (): NodePtyModule => {
  if (nodePtyModule) return nodePtyModule;
  const nativeRequire = getNativeRequire();
  const resolved = nativeRequire.resolve('@lydell/node-pty');
  const unpacked = resolved.replace(
    /([\\/])app\.asar([\\/])/,
    '$1app.asar.unpacked$2',
  );
  const target =
    unpacked !== resolved && fs.existsSync(unpacked) ? unpacked : resolved;
  nodePtyModule = nativeRequire(target) as NodePtyModule;
  return nodePtyModule;
};

export const createDefaultPtyServiceDeps = (
  buildEnv: () => Promise<Record<string, string>>,
): PtyServiceDeps => ({
  spawn: (file, args, options) => loadNodePty().spawn(file, args, options),
  detectProfiles: () => detectShellProfiles(),
  buildEnv,
  isDirectory: (dir) => {
    try {
      return fs.statSync(dir).isDirectory();
    } catch {
      return false;
    }
  },
  homedir: () => os.homedir(),
  platform: process.platform,
});
