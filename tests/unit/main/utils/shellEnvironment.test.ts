import { buildShellEnvironment } from '../../../../src/main/utils/shellEnvironment';

describe('buildShellEnvironment', () => {
  it('leaves PATH exactly as Studio received it', () => {
    const posix = buildShellEnvironment({
      baseEnv: { PATH: '/opt/homebrew/bin:/usr/bin:/bin' },
      platform: 'darwin',
      isPackaged: true,
    });
    const windows = buildShellEnvironment({
      baseEnv: { Path: 'C:\\Windows\\System32;C:\\Tools' },
      platform: 'win32',
      isPackaged: true,
    });

    expect(posix.PATH).toBe('/opt/homebrew/bin:/usr/bin:/bin');
    expect(windows.Path).toBe('C:\\Windows\\System32;C:\\Tools');
    expect(windows.PATH).toBeUndefined();
  });

  it('describes the terminal to the programs running in it', () => {
    const env = buildShellEnvironment({
      baseEnv: { PATH: '/usr/bin', TERM: 'dumb' },
      platform: 'linux',
      isPackaged: true,
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
    });
    const packaged = buildShellEnvironment({
      baseEnv,
      platform: 'linux',
      isPackaged: true,
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
