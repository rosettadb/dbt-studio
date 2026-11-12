import { buildShellEnvironment } from '../../../../src/main/utils/shellEnvironment';

const everyDirectoryExists = () => true;

describe('buildShellEnvironment', () => {
  it('puts the Python environment first and Rosetta last on PATH', () => {
    const env = buildShellEnvironment({
      baseEnv: { PATH: '/usr/bin:/bin' },
      platform: 'linux',
      isPackaged: true,
      pythonPath: '/studio/venv/bin/python',
      dbtPath: '/studio/venv/bin/dbt',
      rosettaPath: '/studio/rosetta/bin/rosetta',
      directoryExists: everyDirectoryExists,
    });

    expect(env.PATH).toBe('/studio/venv/bin:/usr/bin:/bin:/studio/rosetta/bin');
  });

  it('uses the existing PATH variable name and separator on Windows', () => {
    const env = buildShellEnvironment({
      baseEnv: { Path: 'C:\\Windows\\System32;C:\\Studio\\Venv\\Scripts' },
      platform: 'win32',
      isPackaged: true,
      pythonPath: 'C:\\studio\\venv\\Scripts\\python.exe',
      dbtPath: 'C:\\studio\\venv\\Scripts\\dbt.exe',
      directoryExists: everyDirectoryExists,
    });

    expect(env.PATH).toBeUndefined();
    // Listed once, moved to the front, compared case-insensitively.
    expect(env.Path).toBe('C:\\studio\\venv\\Scripts;C:\\Windows\\System32');
  });

  it('skips tools that are not installed or whose folder is gone', () => {
    const env = buildShellEnvironment({
      baseEnv: { PATH: '/usr/bin' },
      platform: 'linux',
      isPackaged: true,
      pythonPath: '',
      dbtPath: 'dbt',
      rosettaPath: '/removed/rosetta/bin/rosetta',
      directoryExists: (dir) => dir !== '/removed/rosetta/bin',
    });

    expect(env.PATH).toBe('/usr/bin');
  });

  it('describes the terminal to the programs running in it', () => {
    const env = buildShellEnvironment({
      baseEnv: { PATH: '/usr/bin', TERM: 'dumb' },
      platform: 'linux',
      isPackaged: true,
      directoryExists: everyDirectoryExists,
    });

    expect(env.TERM).toBe('xterm-256color');
    expect(env.COLORTERM).toBe('truecolor');
    expect(env.TERM_PROGRAM).toBe('rosetta-dbt-studio');
  });

  it('removes Electron-only variables but keeps the rest', () => {
    const env = buildShellEnvironment({
      baseEnv: {
        PATH: '/usr/bin',
        ELECTRON_RUN_AS_NODE: '1',
        CHROME_CRASHPAD_PIPE_NAME: 'pipe',
        'db-password-warehouse': 'secret',
        NODE_ENV: 'production',
        UNSET: undefined,
      },
      platform: 'linux',
      isPackaged: true,
      directoryExists: everyDirectoryExists,
    });

    expect(env.ELECTRON_RUN_AS_NODE).toBeUndefined();
    expect(env.CHROME_CRASHPAD_PIPE_NAME).toBeUndefined();
    expect(env['db-password-warehouse']).toBe('secret');
    expect(env.NODE_ENV).toBe('production');
    expect('UNSET' in env).toBe(false);
  });

  it('removes npm/ts-node run variables only in development runs', () => {
    const baseEnv = {
      PATH: '/usr/bin',
      npm_lifecycle_event: 'start',
      TS_NODE_TRANSPILE_ONLY: 'true',
      INIT_CWD: '/repo',
    };
    const development = buildShellEnvironment({
      baseEnv,
      platform: 'linux',
      isPackaged: false,
      directoryExists: everyDirectoryExists,
    });
    const packaged = buildShellEnvironment({
      baseEnv,
      platform: 'linux',
      isPackaged: true,
      directoryExists: everyDirectoryExists,
    });

    expect(development.npm_lifecycle_event).toBeUndefined();
    expect(development.TS_NODE_TRANSPILE_ONLY).toBeUndefined();
    expect(development.INIT_CWD).toBeUndefined();
    expect(packaged.npm_lifecycle_event).toBe('start');
  });

  it('gives a UTF-8 locale to shells started without one', () => {
    const base = {
      platform: 'darwin' as const,
      isPackaged: true,
      directoryExists: everyDirectoryExists,
    };

    expect(
      buildShellEnvironment({ ...base, baseEnv: {}, locale: 'de-DE' }).LANG,
    ).toBe('de_DE.UTF-8');
    expect(
      buildShellEnvironment({ ...base, baseEnv: {}, locale: 'fr' }).LANG,
    ).toBe('en_US.UTF-8');
    expect(
      buildShellEnvironment({
        ...base,
        baseEnv: { LANG: 'ja_JP.UTF-8' },
        locale: 'de-DE',
      }).LANG,
    ).toBe('ja_JP.UTF-8');
    expect(
      buildShellEnvironment({
        ...base,
        platform: 'win32',
        baseEnv: {},
        locale: 'de-DE',
      }).LANG,
    ).toBeUndefined();
  });
});
