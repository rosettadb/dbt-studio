import fs from 'fs';
import os from 'os';
import nodePath from 'path';
import type { ShellProfile, ShellProfilesResult } from '../../types/pty';

/**
 * Detects the shells installed on this machine so the terminal can offer
 * them as launch profiles (the "+" dropdown), and picks the default one.
 *
 * Everything the detection reads (platform, env, filesystem) is injectable so
 * each OS can be unit tested on any developer machine.
 */
type Platform = typeof process.platform;
type Environment = typeof process.env;

export interface ShellDetectionDeps {
  platform: Platform;
  env: Environment;
  exists: (filePath: string) => boolean;
  readFile: (filePath: string) => string | null;
  /** Login shell from the user database (`os.userInfo().shell`). */
  userShell: () => string | null;
}

const defaultDeps = (): ShellDetectionDeps => ({
  platform: process.platform,
  env: process.env,
  exists: (filePath) => {
    try {
      return fs.statSync(filePath).isFile();
    } catch {
      return false;
    }
  },
  readFile: (filePath) => {
    try {
      return fs.readFileSync(filePath, 'utf8');
    } catch {
      return null;
    }
  },
  userShell: () => {
    try {
      return os.userInfo().shell || null;
    } catch {
      return null;
    }
  },
});

/** Case-insensitive env lookup (Windows env names are case-insensitive, but
 * a plain object copy of process.env is not). */
const envValue = (env: Environment, name: string): string | undefined => {
  if (env[name] !== undefined) return env[name];
  const wanted = name.toLowerCase();
  const key = Object.keys(env).find((k) => k.toLowerCase() === wanted);
  return key ? env[key] : undefined;
};

const findOnWindowsPath = (
  deps: ShellDetectionDeps,
  executable: string,
): string | null => {
  const dirs = (envValue(deps.env, 'PATH') || '')
    .split(nodePath.win32.delimiter)
    .map((dir) => dir.trim().replace(/^"|"$/g, ''))
    .filter(Boolean);
  const hit = dirs
    .map((dir) => nodePath.win32.join(dir, executable))
    .find((candidate) => deps.exists(candidate));
  return hit ?? null;
};

const firstExisting = (
  deps: ShellDetectionDeps,
  candidates: Array<string | null | undefined>,
): string | null =>
  candidates.find(
    (candidate): candidate is string => !!candidate && deps.exists(candidate),
  ) ?? null;

const detectWindowsProfiles = (deps: ShellDetectionDeps): ShellProfile[] => {
  const { win32 } = nodePath;
  const systemRoot = envValue(deps.env, 'SystemRoot') || 'C:\\Windows';
  const programFiles = envValue(deps.env, 'ProgramFiles');
  const programFilesX86 = envValue(deps.env, 'ProgramFiles(x86)');
  const programW6432 = envValue(deps.env, 'ProgramW6432');
  const localAppData = envValue(deps.env, 'LOCALAPPDATA');
  const under = (root: string | undefined, ...parts: string[]) =>
    root ? win32.join(root, ...parts) : null;

  const profiles: ShellProfile[] = [];

  const pwsh = firstExisting(deps, [
    under(programFiles, 'PowerShell', '7', 'pwsh.exe'),
    under(programW6432, 'PowerShell', '7', 'pwsh.exe'),
    findOnWindowsPath(deps, 'pwsh.exe'),
  ]);
  if (pwsh) {
    profiles.push({
      id: pwsh,
      name: 'PowerShell',
      shortName: 'pwsh',
      path: pwsh,
      args: ['-NoLogo'],
    });
  }

  const windowsPowerShell = firstExisting(deps, [
    win32.join(
      systemRoot,
      'System32',
      'WindowsPowerShell',
      'v1.0',
      'powershell.exe',
    ),
  ]);
  if (windowsPowerShell) {
    profiles.push({
      id: windowsPowerShell,
      name: 'Windows PowerShell',
      shortName: 'powershell',
      path: windowsPowerShell,
      args: ['-NoLogo'],
    });
  }

  const cmd = firstExisting(deps, [
    envValue(deps.env, 'ComSpec'),
    win32.join(systemRoot, 'System32', 'cmd.exe'),
  ]);
  if (cmd) {
    profiles.push({
      id: cmd,
      name: 'Command Prompt',
      shortName: 'cmd',
      path: cmd,
      args: [],
    });
  }

  const gitBash = firstExisting(deps, [
    under(programFiles, 'Git', 'bin', 'bash.exe'),
    under(programW6432, 'Git', 'bin', 'bash.exe'),
    under(programFilesX86, 'Git', 'bin', 'bash.exe'),
    under(localAppData, 'Programs', 'Git', 'bin', 'bash.exe'),
  ]);
  if (gitBash) {
    profiles.push({
      id: gitBash,
      name: 'Git Bash',
      shortName: 'bash',
      path: gitBash,
      args: ['--login', '-i'],
    });
  }

  return profiles;
};

// Entries of /etc/shells that are not interactive shells a user would want
// in a terminal tab.
const NON_INTERACTIVE_SHELLS = new Set([
  'nologin',
  'false',
  'true',
  'git-shell',
  'rbash',
  'tmux',
  'screen',
  'sync',
  'shutdown',
  'halt',
]);

const unixLoginArgs = (shortName: string): string[] =>
  shortName === 'pwsh' ? ['-Login'] : ['-l'];

const detectUnixProfiles = (deps: ShellDetectionDeps): ShellProfile[] => {
  const { posix } = nodePath;
  // macOS terminals start login shells (that is where PATH is set up via
  // /etc/zprofile + ~/.zprofile); Linux terminals start plain interactive
  // shells that inherit the session environment.
  const login = deps.platform === 'darwin';

  const preferred = [envValue(deps.env, 'SHELL'), deps.userShell()];
  const listed = (deps.readFile('/etc/shells') || '')
    .split(/\r?\n/)
    .map((line) => line.replace(/#.*$/, '').trim())
    .filter((line) => line.startsWith('/'));
  const fallbacks = ['/bin/zsh', '/bin/bash', '/bin/sh'];

  const profiles: ShellProfile[] = [];
  const seenNames = new Set<string>();
  [...preferred, ...listed, ...fallbacks].forEach((candidate) => {
    if (!candidate || !deps.exists(candidate)) return;
    const shortName = posix.basename(candidate);
    // /bin/bash and /usr/bin/bash are the same shell on merged-/usr systems;
    // one entry per shell name, first (most preferred) path wins.
    if (seenNames.has(shortName) || NON_INTERACTIVE_SHELLS.has(shortName)) {
      return;
    }
    seenNames.add(shortName);
    profiles.push({
      id: candidate,
      name: shortName,
      shortName,
      path: candidate,
      args: login ? unixLoginArgs(shortName) : [],
    });
  });

  return profiles;
};

export const detectShellProfiles = (
  overrides: Partial<ShellDetectionDeps> = {},
): ShellProfilesResult => {
  const deps = { ...defaultDeps(), ...overrides };
  const profiles =
    deps.platform === 'win32'
      ? detectWindowsProfiles(deps)
      : detectUnixProfiles(deps);

  // Both detectors list the most preferred shell first (PowerShell 7 →
  // Windows PowerShell → cmd; $SHELL → user database → /etc/shells).
  return {
    profiles,
    defaultProfileId: profiles[0]?.id ?? null,
  };
};
