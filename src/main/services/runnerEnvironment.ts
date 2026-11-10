import fs from 'fs-extra';
import path from 'path';

interface RunnerToolPaths {
  pythonPath?: string;
  dbtPath?: string;
  rosettaPath?: string;
  kisqlPath?: string;
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
