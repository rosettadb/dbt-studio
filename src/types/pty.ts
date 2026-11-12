/**
 * Shared types for the OS shell terminal (real PTY sessions hosted in the
 * main process, rendered with xterm.js in the renderer).
 */

/** A shell the user can launch (PowerShell, cmd, zsh, bash, ...). */
export interface ShellProfile {
  /** Stable id derived from the executable path. */
  id: string;
  /** Human readable name shown in the launch menu, e.g. "PowerShell". */
  name: string;
  /** Short label used for the session list, e.g. "pwsh", "zsh". */
  shortName: string;
  /** Absolute path (or bare command name resolved through PATH). */
  path: string;
  args: string[];
}

export interface ShellProfilesResult {
  profiles: ShellProfile[];
  /** Id of the profile used when the renderer does not ask for one. */
  defaultProfileId: string | null;
}

export interface PtySessionInfo {
  id: string;
  /** Project the session belongs to; sessions are listed per project. */
  projectId: string;
  /** Label shown in the session list. Follows the foreground process
   * unless the user renamed the session. */
  title: string;
  /** True once the user renamed the session; freezes the title. */
  customTitle: boolean;
  profileId: string;
  profileName: string;
  shellPath: string;
  cwd: string;
  pid: number;
  cols: number;
  rows: number;
  createdAt: number;
  /** Set once the shell process ended. */
  exited: boolean;
  exitCode: number | null;
}

export interface PtyCreateRequest {
  projectId: string;
  cwd: string;
  /** Omit to use the default profile. */
  profileId?: string;
  cols: number;
  rows: number;
}

export interface PtyDataEvent {
  id: string;
  data: string;
  /** Number of characters this session produced before `data`. Lets a
   * renderer that just took a snapshot drop chunks the snapshot already
   * contains. */
  offset: number;
}

export interface PtyExitEvent {
  id: string;
  exitCode: number | null;
  signal: number | null;
}

export interface PtyTitleEvent {
  id: string;
  title: string;
  customTitle: boolean;
}

export interface PtySnapshot {
  /** Buffered output (bounded scrollback) of the session so far. */
  data: string;
  /** Total characters produced up to and including `data`. */
  endOffset: number;
}

export interface PtyWriteRequest {
  id: string;
  data: string;
  /** `data` is a byte string (one char per byte, e.g. legacy mouse
   * reports) and must reach the shell without UTF-8 encoding. */
  binary?: boolean;
}

export interface PtyResizeRequest {
  id: string;
  cols: number;
  rows: number;
}

export interface PtyAckRequest {
  id: string;
  /** Characters the renderer finished rendering since the last ack. */
  chars: number;
}

export interface PtyRenameRequest {
  id: string;
  /** Empty string resets to the automatic (process) title. */
  title: string;
}
