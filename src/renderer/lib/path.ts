/**
 * The single entry point for filesystem path handling in the renderer.
 *
 * Backed by Node's real `path` module, exposed synchronously from the preload
 * (src/main/preload.ts). Use this instead of `split('/')`, `replace(/\\/g, ...)`,
 * `navigator.platform`, or `window.electron.app.os` — every path the main
 * process hands the renderer (file tree nodes, dialogs, drag-and-drop) is a
 * native path for the running OS, and this module matches it.
 *
 * Do NOT use `path` for things that are `/`-separated by protocol regardless
 * of OS (git relative paths, cloud object keys, router URLs, Second Brain page
 * ids). Use `path.posix` for those, or `toPosix` to convert a native path.
 *
 * Everything reads `window.electron` lazily so the Jest mock can swap the
 * platform between tests (see tests/unit/__setup__/ipcRenderer.mock.ts).
 */
import type { ElectronHandler, PathBridge } from '../../main/preload';

type PlatformName = ElectronHandler['app']['os'];

const bridge = (): PathBridge => window.electron.path;

// eslint-disable-next-line no-restricted-syntax
const readPlatform = (): PlatformName => window.electron.app.os;

export const path = {
  /** Join segments using the host OS separator and normalize the result. */
  join: (...parts: string[]): string => bridge().join(...parts),
  /** Resolve to an absolute path. Pass an absolute first segment: the renderer has no cwd. */
  resolve: (...parts: string[]): string => bridge().resolve(...parts),
  normalize: (filePath: string): string => bridge().normalize(filePath),
  isAbsolute: (filePath: string): boolean => bridge().isAbsolute(filePath),
  relative: (from: string, to: string): string => bridge().relative(from, to),
  dirname: (filePath: string): string => bridge().dirname(filePath),
  basename: (filePath: string, suffix?: string): string =>
    bridge().basename(filePath, suffix),
  extname: (filePath: string): string => bridge().extname(filePath),
  parse: (filePath: string) => bridge().parse(filePath),
  format: (pathObject: Parameters<PathBridge['format']>[0]): string =>
    bridge().format(pathObject),
  get sep(): string {
    return bridge().sep;
  },
  get delimiter(): string {
    return bridge().delimiter;
  },
  /** POSIX (`/`) implementation, independent of host OS. */
  get posix(): PathBridge['posix'] {
    return bridge().posix;
  },
  /** Windows (`\`) implementation, independent of host OS. */
  get win32(): PathBridge['win32'] {
    return bridge().win32;
  },
};

/** `process.platform` of the host (`'win32' | 'darwin' | 'linux' | ...`). */
export const getPlatform = (): PlatformName => readPlatform();
export const isWindows = (): boolean => readPlatform() === 'win32';
export const isMac = (): boolean => readPlatform() === 'darwin';
export const isLinux = (): boolean => readPlatform() === 'linux';

/**
 * Convert a native path to forward slashes. For git, Monaco URIs, pipeline
 * names and other `/`-by-protocol consumers. Not for filesystem calls.
 */
export const toPosix = (filePath: string): string =>
  filePath.replace(/\\/g, '/');

/**
 * Normalize a path for the host OS and split it into segments. On Windows
 * this also folds any `/` into `\` first, so paths built elsewhere with
 * forward slashes split correctly. The leading root segment (`''` on POSIX,
 * `C:` on Windows) is preserved so `segments.join(path.sep)` round-trips.
 */
export const splitSegments = (filePath: string): string[] =>
  path.normalize(filePath).split(path.sep);

/**
 * True when `child` is inside `parent` (or equal to it). Pure string check on
 * normalized paths — no filesystem access.
 */
export const isInside = (parent: string, child: string): boolean => {
  const rel = path.relative(parent, child);
  return (
    rel === '' ||
    (rel !== '..' && !rel.startsWith(`..${path.sep}`) && !path.isAbsolute(rel))
  );
};
