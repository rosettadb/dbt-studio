import fs from 'fs-extra';
import path from 'path';
import {
  getRunnerJavaCommand,
  getRunnerToolEnvironment,
} from '../../../../src/main/services/runnerEnvironment';

describe('runner Java environment', () => {
  const originalPlatform = process.platform;
  const originalJavaHome = process.env.JAVA_HOME;
  const originalPath = process.env.PATH;

  afterEach(() => {
    Object.defineProperty(process, 'platform', { value: originalPlatform });
    if (originalJavaHome === undefined) delete process.env.JAVA_HOME;
    else process.env.JAVA_HOME = originalJavaHome;
    if (originalPath === undefined) delete process.env.PATH;
    else process.env.PATH = originalPath;
    jest.restoreAllMocks();
  });

  it.each(['linux', 'win32'])(
    'uses inherited JAVA_HOME on %s',
    async (platform) => {
      Object.defineProperty(process, 'platform', { value: platform });
      process.env.JAVA_HOME = path.join('installed', 'jdk17');
      process.env.PATH = 'system-bin';

      const env = await getRunnerToolEnvironment({
        pythonPath: path.join('venv', 'bin', 'python'),
      });
      expect(getRunnerJavaCommand(env)).toBe(
        path.join(
          process.env.JAVA_HOME,
          'bin',
          platform === 'win32' ? 'java.exe' : 'java',
        ),
      );
      expect(env.PATH).toBe(
        [
          path.join(process.env.JAVA_HOME, 'bin'),
          path.join('venv', 'bin'),
          'system-bin',
        ].join(path.delimiter),
      );
    },
  );

  it('prefers the installed Homebrew Java 17 on macOS', async () => {
    Object.defineProperty(process, 'platform', { value: 'darwin' });
    process.env.JAVA_HOME = '/other/jdk';
    jest
      .spyOn(fs, 'pathExists')
      .mockImplementation(async (file) =>
        String(file).startsWith('/opt/homebrew/'),
      );

    const env = await getRunnerToolEnvironment({});
    expect(env.JAVA_HOME).toBe(
      '/opt/homebrew/opt/openjdk@17/libexec/openjdk.jdk/Contents/Home',
    );
    expect(getRunnerJavaCommand(env)).toBe(
      path.join(env.JAVA_HOME, 'bin', 'java'),
    );
    expect(env.PATH?.split(path.delimiter)[0]).toBe(
      path.join(env.JAVA_HOME, 'bin'),
    );
  });
});
