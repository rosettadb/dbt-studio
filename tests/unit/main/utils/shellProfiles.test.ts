import { detectShellProfiles } from '../../../../src/main/utils/shellProfiles';

const withFiles = (files: string[]) => (filePath: string) =>
  files.includes(filePath);

describe('detectShellProfiles (Windows)', () => {
  const env = {
    SystemRoot: 'C:\\Windows',
    ProgramFiles: 'C:\\Program Files',
    'ProgramFiles(x86)': 'C:\\Program Files (x86)',
    LOCALAPPDATA: 'C:\\Users\\dev\\AppData\\Local',
    ComSpec: 'C:\\Windows\\System32\\cmd.exe',
    Path: 'C:\\Windows\\System32;C:\\Tools',
  };
  const windowsPowerShell =
    'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe';
  const cmd = 'C:\\Windows\\System32\\cmd.exe';
  const pwsh = 'C:\\Program Files\\PowerShell\\7\\pwsh.exe';
  const gitBash = 'C:\\Program Files\\Git\\bin\\bash.exe';

  const detect = (files: string[], overrides = {}) =>
    detectShellProfiles({
      platform: 'win32',
      env: { ...env, ...overrides },
      exists: withFiles(files),
      readFile: () => null,
      userShell: () => null,
    });

  it('lists every installed shell and prefers PowerShell 7', () => {
    const result = detect([windowsPowerShell, cmd, pwsh, gitBash]);

    expect(result.profiles.map((profile) => profile.name)).toEqual([
      'PowerShell',
      'Windows PowerShell',
      'Command Prompt',
      'Git Bash',
    ]);
    expect(result.defaultProfileId).toBe(pwsh);
  });

  it('falls back to Windows PowerShell when PowerShell 7 is absent', () => {
    const result = detect([windowsPowerShell, cmd]);

    expect(result.profiles.map((profile) => profile.shortName)).toEqual([
      'powershell',
      'cmd',
    ]);
    expect(result.defaultProfileId).toBe(windowsPowerShell);
  });

  it('finds PowerShell 7 on PATH when it is not in Program Files', () => {
    const result = detect([windowsPowerShell, cmd, 'C:\\Tools\\pwsh.exe']);

    expect(result.defaultProfileId).toBe('C:\\Tools\\pwsh.exe');
  });

  it('reads environment names case-insensitively', () => {
    const result = detectShellProfiles({
      platform: 'win32',
      env: { SYSTEMROOT: 'D:\\Win', COMSPEC: 'D:\\Win\\System32\\cmd.exe' },
      exists: withFiles(['D:\\Win\\System32\\cmd.exe']),
      readFile: () => null,
      userShell: () => null,
    });

    expect(result.profiles).toEqual([
      expect.objectContaining({
        name: 'Command Prompt',
        path: 'D:\\Win\\System32\\cmd.exe',
      }),
    ]);
  });

  it('starts Git Bash as an interactive login shell', () => {
    const result = detect([cmd, gitBash]);

    expect(
      result.profiles.find((profile) => profile.name === 'Git Bash')?.args,
    ).toEqual(['--login', '-i']);
  });

  it('reports no default when nothing is installed', () => {
    expect(detect([])).toEqual({ profiles: [], defaultProfileId: null });
  });
});

describe('detectShellProfiles (macOS / Linux)', () => {
  const etcShells = [
    '# List of acceptable shells',
    '/bin/bash',
    '/bin/sh',
    '/bin/zsh',
    '/usr/bin/bash',
    '/usr/bin/git-shell',
    '/usr/sbin/nologin',
    '/opt/homebrew/bin/fish # added by brew',
    '/bin/missing',
  ].join('\n');
  const installed = [
    '/bin/bash',
    '/bin/sh',
    '/bin/zsh',
    '/usr/bin/bash',
    '/usr/bin/git-shell',
    '/usr/sbin/nologin',
    '/opt/homebrew/bin/fish',
  ];

  const detect = (
    platform: 'darwin' | 'linux',
    env: Record<string, string>,
    userShell: string | null = null,
  ) =>
    detectShellProfiles({
      platform,
      env,
      exists: withFiles(installed),
      readFile: (filePath) => (filePath === '/etc/shells' ? etcShells : null),
      userShell: () => userShell,
    });

  it('puts $SHELL first and lists each shell once', () => {
    const result = detect('linux', { SHELL: '/bin/zsh' });

    expect(result.defaultProfileId).toBe('/bin/zsh');
    expect(result.profiles.map((profile) => profile.path)).toEqual([
      '/bin/zsh',
      '/bin/bash',
      '/bin/sh',
      '/opt/homebrew/bin/fish',
    ]);
  });

  it('uses the login shell of the user database without $SHELL', () => {
    const result = detect('linux', {}, '/opt/homebrew/bin/fish');

    expect(result.defaultProfileId).toBe('/opt/homebrew/bin/fish');
  });

  it('ignores a $SHELL that does not exist', () => {
    const result = detect('linux', { SHELL: '/usr/local/bin/gone' });

    expect(result.defaultProfileId).toBe('/bin/bash');
  });

  it('starts login shells on macOS and plain shells on Linux', () => {
    const mac = detect('darwin', { SHELL: '/bin/zsh' });
    const linux = detect('linux', { SHELL: '/bin/zsh' });

    expect(mac.profiles.every((profile) => profile.args[0] === '-l')).toBe(
      true,
    );
    expect(linux.profiles.every((profile) => profile.args.length === 0)).toBe(
      true,
    );
  });

  it('falls back to well-known shells when /etc/shells is unreadable', () => {
    const result = detectShellProfiles({
      platform: 'linux',
      env: {},
      exists: withFiles(['/bin/sh']),
      readFile: () => null,
      userShell: () => null,
    });

    expect(result.profiles.map((profile) => profile.path)).toEqual(['/bin/sh']);
  });
});
