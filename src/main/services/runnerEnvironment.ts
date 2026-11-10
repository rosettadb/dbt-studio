import fs from 'fs-extra';
import path from 'path';
import { execFile } from 'child_process';

interface RunnerToolPaths {
  pythonPath?: string;
  dbtPath?: string;
  rosettaPath?: string;
  kisqlPath?: string;
}

// Asks the system's own `java` (found on Studio's PATH, before the tool
// folders are added) for its home folder. Resolves undefined without Java.
function findSystemJavaHome(): Promise<string | undefined> {
  return new Promise((resolve) => {
    execFile(
      'java',
      ['-XshowSettings:properties', '-version'],
      { timeout: 5000 },
      (error, stdout, stderr) => {
        resolve(
          error
            ? undefined
            : `${stdout}${stderr}`
                .match(/^\s*java\.home = (.+)$/m)?.[1]
                ?.trim(),
        );
      },
    );
  });
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
    toolDirs.push('/opt/homebrew/bin', '/usr/local/bin');
  }

  // Studio's Rosetta folder (in toolDirs) ships its own Java 11, which would
  // otherwise come first on PATH. Point JAVA_HOME at the system's Java so the
  // PySpark check and spark-submit use it. Skipped on macOS, where running
  // `java` without a JDK installed opens an install prompt.
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
