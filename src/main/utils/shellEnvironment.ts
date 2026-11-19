/**
 * Builds the environment a shell terminal session starts with.
 *
 * Starts from Studio's own environment and removes what only makes sense
 * for the Electron process itself. PATH is left exactly as it is: the shell
 * terminal adds no tools of its own, like the terminal of any other editor.
 */
type Platform = typeof process.platform;

export interface ShellEnvironmentInput {
  baseEnv: typeof process.env;
  platform: Platform;
  /** App is running from an installer build (not `npm start`). */
  isPackaged: boolean;
  /** BCP 47 locale of the app, e.g. "en-US". */
  locale?: string;
}

// Set by Electron/Chromium for its own processes; a child `electron` or
// `node` started from the terminal must not inherit them.
const ELECTRON_ONLY = [/^ELECTRON_/i, /^CHROME_CRASHPAD_PIPE_NAME$/i];

// `npm start` leaks npm's and ts-node's per-run variables into Studio; with
// them a `npm`/`node` typed in the terminal would behave as if it ran inside
// Studio's own package script. Only present in development runs.
const DEV_RUN_ONLY = [/^npm_/i, /^TS_NODE_/i, /^INIT_CWD$/i];

export const buildShellEnvironment = (
  input: ShellEnvironmentInput,
): Record<string, string> => {
  const { platform } = input;
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

  return env;
};
