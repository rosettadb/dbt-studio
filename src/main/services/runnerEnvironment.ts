import fs from 'fs-extra';
import path from 'path';
import { execFile } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

interface RunnerToolPaths {
  pythonPath?: string;
  dbtPath?: string;
  rosettaPath?: string;
  kisqlPath?: string;
}

// Asks the system's own `java` (found on Studio's PATH, before the tool
// folders are added) for its home folder. Resolves undefined without Java.
async function findSystemJavaHome(
  command = 'java',
  minimumVersion = 0,
): Promise<string | undefined> {
  try {
    const { stdout, stderr } = await execFileAsync(
      command,
      ['-XshowSettings:properties', '-version'],
      { timeout: 5000 },
    );
    const output = `${stdout}${stderr}`;
    const version = output.match(/version "(?:1\.)?(\d+)/)?.[1];
    if (!version || Number(version) < minimumVersion) return undefined;
    return output.match(/^\s*java\.home = (.+)$/m)?.[1]?.trim();
  } catch {
    return undefined;
  }
}

async function findMacJavaHome(): Promise<string | undefined> {
  // java_home avoids the install prompt from macOS's /usr/bin/java stub.
  try {
    const { stdout } = await execFileAsync(
      '/usr/libexec/java_home',
      ['-v', '17'],
      { timeout: 5000 },
    );
    if (stdout.trim()) return stdout.trim();
  } catch {
    // A JDK on PATH may not be registered with java_home.
  }

  const pathKey =
    Object.keys(process.env).find((key) => key.toLowerCase() === 'path') ||
    'PATH';
  const candidates = (process.env[pathKey] || '')
    .split(path.delimiter)
    .filter((dir) => dir && dir !== '/usr/bin')
    .map((dir) => path.join(dir, 'java'));
  const homes = await Promise.all(
    candidates.map(async (candidate) =>
      (await fs.pathExists(candidate))
        ? findSystemJavaHome(candidate, 17)
        : undefined,
    ),
  );
  return homes.find(Boolean);
}

// Keep Java selection and PATH construction in one place for the preflight
// check, dependency status, and the runner process.
export async function getRunnerToolEnvironment(
  settings: RunnerToolPaths,
): Promise<Record<string, string>> {
  const env: Record<string, string> = Object.fromEntries(
    Object.entries(process.env).filter(
      (entry): entry is [string, string] => entry[1] !== undefined,
    ),
  );
  const toolDirs = [
    settings.pythonPath,
    settings.dbtPath,
    settings.rosettaPath,
    settings.kisqlPath,
  ]
    .filter((toolPath): toolPath is string => Boolean(toolPath))
    .map((toolPath) => path.dirname(toolPath));

  if (process.platform === 'darwin') {
    const javaHomes = ['/opt/homebrew', '/usr/local'].map((prefix) =>
      path.join(
        prefix,
        'opt',
        'openjdk@17',
        'libexec',
        'openjdk.jdk',
        'Contents',
        'Home',
      ),
    );
    const installed = await Promise.all(
      javaHomes.map((home) => fs.pathExists(path.join(home, 'bin', 'java'))),
    );
    const preferredHome = javaHomes.find((_, index) => installed[index]);
    if (preferredHome) env.JAVA_HOME = preferredHome;
    else if (!env.JAVA_HOME) {
      const systemHome = await findMacJavaHome();
      if (systemHome) env.JAVA_HOME = systemHome;
    }
    toolDirs.push('/opt/homebrew/bin', '/usr/local/bin');
  }

  // Studio's Rosetta folder (in toolDirs) ships its own Java 11, which would
  // otherwise come first on PATH. Point JAVA_HOME at the system's Java so the
  // PySpark check and spark-submit use it. On macOS the discovery above
  // avoids invoking the system Java install prompt.
  if (!env.JAVA_HOME && process.platform !== 'darwin') {
    const systemJavaHome = await findSystemJavaHome();
    if (systemJavaHome) env.JAVA_HOME = systemJavaHome;
  }

  if (env.JAVA_HOME) toolDirs.unshift(path.join(env.JAVA_HOME, 'bin'));
  const pathKey =
    Object.keys(env).find((key) => key.toLowerCase() === 'path') || 'PATH';
  if (toolDirs.length) {
    env[pathKey] = [...toolDirs, env[pathKey] ?? ''].join(path.delimiter);
  }
  return env;
}

export function getRunnerJavaCommand(
  env: Record<string, string | undefined>,
): string {
  return env.JAVA_HOME
    ? path.join(
        env.JAVA_HOME,
        'bin',
        process.platform === 'win32' ? 'java.exe' : 'java',
      )
    : 'java';
}
