import nodePath from 'path';

/**
 * Builds the environment a shell terminal session starts with.
 *
 * Starts from Studio's own environment (which already carries the
 * connection variables profiles.yml reads), removes what only makes sense
 * for the Electron process itself, and makes Studio's managed tools
 * reachable by name (`dbt`, `python`, `rosetta`) the way the built-in
 * command terminal resolves them.
 */
type Platform = typeof process.platform;

export interface ShellEnvironmentInput {
  baseEnv: typeof process.env;
  platform: Platform;
  /** App is running from an installer build (not `npm start`). */
  isPackaged: boolean;
  /** BCP 47 locale of the app, e.g. "en-US". */
  locale?: string;
  /** Studio-managed tool binaries; empty/undefined when not installed. */
  pythonPath?: string;
  dbtPath?: string;
  rosettaPath?: string;
  /** Lets the caller skip tool folders that no longer exist. */
  directoryExists: (dir: string) => boolean;
}

// Set by Electron/Chromium for its own processes; a child `electron` or
// `node` started from the terminal must not inherit them.
const ELECTRON_ONLY = [/^ELECTRON_/i, /^CHROME_CRASHPAD_PIPE_NAME$/i];

// `npm start` leaks npm's and ts-node's per-run variables into Studio; with
// them a `npm`/`node` typed in the terminal would behave as if it ran inside
// Studio's own package script. Only present in development runs.
const DEV_RUN_ONLY = [/^npm_/i, /^TS_NODE_/i, /^INIT_CWD$/i];

const samePath = (a: string, b: string, platform: Platform) =>
  platform === 'win32' ? a.toLowerCase() === b.toLowerCase() : a === b;

export const buildShellEnvironment = (
  input: ShellEnvironmentInput,
): Record<string, string> => {
  const { platform } = input;
  const pathApi = platform === 'win32' ? nodePath.win32 : nodePath.posix;
  const blocked = input.isPackaged
    ? ELECTRON_ONLY
    : [...ELECTRON_ONLY, ...DEV_RUN_ONLY];

  const env: Record<string, string> = {};
  Object.entries(input.baseEnv).forEach(([key, value]) => {
    if (value === undefined) return;
    if (blocked.some((pattern) => pattern.test(key))) return;
    env[key] = value;
  });

  env.TERM = 'xterm-256color';
  env.COLORTERM = 'truecolor';
  env.TERM_PROGRAM = 'rosetta-dbt-studio';

  // Apps started from Finder/Dock or a desktop launcher have no locale
  // variables, and shells then treat UTF-8 output as raw bytes.
  if (platform !== 'win32' && !env.LANG && !env.LC_ALL && !env.LC_CTYPE) {
    const [language, region] = (input.locale || 'en-US').split(/[-_]/);
    env.LANG =
      language && region
        ? `${language.toLowerCase()}_${region.toUpperCase()}.UTF-8`
        : 'en_US.UTF-8';
  }

  const pathKey =
    Object.keys(env).find((key) => key.toLowerCase() === 'path') || 'PATH';
  const current = (env[pathKey] || '').split(pathApi.delimiter).filter(Boolean);

  const toolDir = (toolPath?: string): string | null => {
    if (!toolPath || !pathApi.isAbsolute(toolPath)) return null;
    const dir = pathApi.dirname(toolPath);
    return input.directoryExists(dir) ? dir : null;
  };
  const unique = (dirs: Array<string | null>): string[] => {
    const out: string[] = [];
    dirs.forEach((dir) => {
      if (!dir) return;
      if (out.some((existing) => samePath(existing, dir, platform))) return;
      out.push(dir);
    });
    return out;
  };

  // The Python environment (python, pip, dbt) goes first, like an activated
  // virtualenv. Rosetta's folder goes last: it ships its own Java, which
  // must not shadow the Java the user has installed.
  const front = unique([toolDir(input.pythonPath), toolDir(input.dbtPath)]);
  const back = unique([toolDir(input.rosettaPath)]).filter(
    (dir) => !front.some((existing) => samePath(existing, dir, platform)),
  );
  const managed = [...front, ...back];
  const rest = current.filter(
    (dir) => !managed.some((existing) => samePath(existing, dir, platform)),
  );

  env[pathKey] = [...front, ...rest, ...back].join(pathApi.delimiter);
  return env;
};
