/* eslint-disable class-methods-use-this */
import type { Terminal } from '@xterm/xterm';
import {
  ACK_CHUNK_CHARS,
  ShellPtyApi,
  ShellSessionManager,
  ShellTerminalOptions,
} from '../../../../src/renderer/components/terminal/shell/shellSessions';
import type {
  PtyDataEvent,
  PtyExitEvent,
  PtySessionInfo,
  PtySnapshot,
  PtyTitleEvent,
} from '../../../../src/types/pty';

/** Stand-in for xterm's Terminal covering what the manager uses. */
class FakeTerminal {
  options: Record<string, unknown>;

  cols: number;

  rows: number;

  written = '';

  selection = '';

  pasted: string[] = [];

  cleared = 0;

  disposed = false;

  opened: HTMLElement | null = null;

  unicode = { activeVersion: '6' };

  keyHandler: ((event: KeyboardEvent) => boolean) | null = null;

  private dataListeners: Array<(data: string) => void> = [];

  private binaryListeners: Array<(data: string) => void> = [];

  private resizeListeners: Array<
    (size: { cols: number; rows: number }) => void
  > = [];

  constructor(options: ShellTerminalOptions) {
    this.options = { ...options };
    this.cols = options.cols ?? 80;
    this.rows = options.rows ?? 24;
  }

  loadAddon = () => undefined;

  open = (parent: HTMLElement) => {
    this.opened = parent;
  };

  refresh = () => undefined;

  focus = () => undefined;

  write = (data: string, callback?: () => void) => {
    this.written += data;
    callback?.();
  };

  onData = (listener: (data: string) => void) => {
    this.dataListeners.push(listener);
    return { dispose: () => undefined };
  };

  onBinary = (listener: (data: string) => void) => {
    this.binaryListeners.push(listener);
    return { dispose: () => undefined };
  };

  onResize = (listener: (size: { cols: number; rows: number }) => void) => {
    this.resizeListeners.push(listener);
    return { dispose: () => undefined };
  };

  attachCustomKeyEventHandler = (
    handler: (event: KeyboardEvent) => boolean,
  ) => {
    this.keyHandler = handler;
  };

  hasSelection = () => this.selection.length > 0;

  getSelection = () => this.selection;

  clearSelection = () => {
    this.selection = '';
  };

  selectAll = () => {
    this.selection = this.written;
  };

  paste = (text: string) => {
    this.pasted.push(text);
  };

  clear = () => {
    this.cleared += 1;
  };

  dispose = () => {
    this.disposed = true;
  };

  type(data: string) {
    this.dataListeners.forEach((listener) => listener(data));
  }

  typeBinary(data: string) {
    this.binaryListeners.forEach((listener) => listener(data));
  }

  resizeTo(cols: number, rows: number) {
    this.cols = cols;
    this.rows = rows;
    this.resizeListeners.forEach((listener) => listener({ cols, rows }));
  }
}

const session = (overrides: Partial<PtySessionInfo> = {}): PtySessionInfo => ({
  id: 's1',
  projectId: 'p1',
  title: 'zsh',
  customTitle: false,
  profileId: '/bin/zsh',
  profileName: 'zsh',
  shellPath: '/bin/zsh',
  cwd: '/projects/demo',
  pid: 100,
  cols: 80,
  rows: 24,
  createdAt: 1,
  exited: false,
  exitCode: null,
  ...overrides,
});

const key = (init: ConstructorParameters<typeof KeyboardEvent>[1]) =>
  new KeyboardEvent('keydown', { cancelable: true, ...init });

const flushPromises = async () => {
  for (let turn = 0; turn < 10; turn += 1) {
    // eslint-disable-next-line no-await-in-loop
    await Promise.resolve();
  }
};

const setup = (
  options: {
    platform?: string;
    existing?: PtySessionInfo[];
    snapshots?: Record<string, PtySnapshot>;
  } = {},
) => {
  const terminals: FakeTerminal[] = [];
  const listeners: {
    data?: (event: PtyDataEvent) => void;
    exit?: (event: PtyExitEvent) => void;
    title?: (event: PtyTitleEvent) => void;
  } = {};
  let created = 0;
  let clipboardText = '';

  const api: jest.Mocked<ShellPtyApi> = {
    getShellProfiles: jest.fn(async () => ({
      profiles: [],
      defaultProfileId: null,
    })),
    createPtySession: jest.fn(async (request) => {
      created += 1;
      return session({
        id: `s${created}`,
        projectId: request.projectId,
        cwd: request.cwd,
        cols: request.cols,
        rows: request.rows,
      });
    }),
    listPtySessions: jest.fn(async () => options.existing ?? []),
    getPtySnapshot: jest.fn(async (id) => options.snapshots?.[id] ?? null),
    killPtySession: jest.fn<Promise<boolean>, [string]>(async () => true),
    renamePtySession: jest.fn(async (id, title) =>
      session({ id, title: title || 'zsh', customTitle: Boolean(title) }),
    ),
    writeToPty: jest.fn(),
    resizePty: jest.fn(),
    acknowledgePtyData: jest.fn(),
    onPtyData: jest.fn((listener) => {
      listeners.data = listener;
      return () => undefined;
    }),
    onPtyExit: jest.fn((listener) => {
      listeners.exit = listener;
      return () => undefined;
    }),
    onPtyTitle: jest.fn((listener) => {
      listeners.title = listener;
      return () => undefined;
    }),
    openExternalLink: jest.fn<Promise<boolean>, [string]>(async () => true),
  };

  const clipboard = {
    readText: jest.fn(async () => clipboardText),
    writeText: jest.fn(async (text: string) => {
      clipboardText = text;
    }),
  };

  const manager = new ShellSessionManager({
    api,
    createTerminal: (terminalOptions) => {
      const terminal = new FakeTerminal(terminalOptions);
      terminals.push(terminal);
      return terminal as unknown as Terminal;
    },
    platform: () => options.platform ?? 'linux',
    osVersion: () => '10.0.26200',
    clipboard,
  });

  return {
    manager,
    api,
    terminals,
    clipboard,
    setClipboard: (text: string) => {
      clipboardText = text;
    },
    emitData: (event: PtyDataEvent) => listeners.data?.(event),
    emitExit: (event: PtyExitEvent) => listeners.exit?.(event),
    emitTitle: (event: PtyTitleEvent) => listeners.title?.(event),
  };
};

describe('ShellSessionManager', () => {
  it('opens a session in the project folder and selects it', async () => {
    const { manager, api } = setup();
    await manager.init();

    const first = await manager.create('p1', '/projects/demo');
    const second = await manager.create('p1', '/projects/demo', '/bin/bash');
    await manager.create('p2', '/projects/other');

    expect(api.createPtySession).toHaveBeenNthCalledWith(1, {
      projectId: 'p1',
      cwd: '/projects/demo',
      profileId: undefined,
      cols: 80,
      rows: 24,
    });
    expect(api.createPtySession.mock.calls[1][0].profileId).toBe('/bin/bash');
    expect(manager.sessionsFor('p1').map((s) => s.id)).toEqual([
      first.id,
      second.id,
    ]);
    expect(manager.activeFor('p1')?.id).toBe(second.id);
    expect(manager.activeFor('p2')?.id).toBe('s3');
    expect(manager.getState().ready).toBe(true);
  });

  it('notifies subscribers and stops after unsubscribe', async () => {
    const { manager } = setup();
    await manager.init();
    const listener = jest.fn();
    const unsubscribe = manager.subscribe(listener);

    await manager.create('p1', '/projects/demo');
    const calls = listener.mock.calls.length;
    expect(calls).toBeGreaterThan(0);

    unsubscribe();
    await manager.create('p1', '/projects/demo');
    expect(listener).toHaveBeenCalledTimes(calls);
  });

  it('sends keystrokes, raw bytes and size changes to the shell', async () => {
    const { manager, api, terminals } = setup();
    await manager.init();
    const info = await manager.create('p1', '/projects/demo');

    terminals[0].type('ls\r');
    terminals[0].typeBinary('\xff');
    terminals[0].resizeTo(132, 40);

    expect(api.writeToPty).toHaveBeenCalledWith(info.id, 'ls\r');
    expect(api.writeToPty).toHaveBeenCalledWith(info.id, '\xff', true);
    expect(api.resizePty).toHaveBeenCalledWith(info.id, 132, 40);

    // The next terminal starts at the size the panel is known to have.
    await manager.create('p1', '/projects/demo');
    expect(api.createPtySession.mock.calls[1][0]).toMatchObject({
      cols: 132,
      rows: 40,
    });
  });

  it('renders output and acknowledges it in chunks', async () => {
    const { manager, api, terminals, emitData } = setup();
    await manager.init();
    const info = await manager.create('p1', '/projects/demo');

    emitData({ id: info.id, data: 'hi', offset: 0 });
    expect(terminals[0].written).toBe('hi');
    expect(api.acknowledgePtyData).not.toHaveBeenCalled();

    emitData({ id: info.id, data: 'x'.repeat(ACK_CHUNK_CHARS), offset: 2 });
    expect(api.acknowledgePtyData).toHaveBeenCalledWith(
      info.id,
      ACK_CHUNK_CHARS + 2,
    );
  });

  it('keeps output that arrives before the session is known', async () => {
    const { manager, terminals, emitData } = setup();
    await manager.init();

    emitData({ id: 's1', data: 'PS C:\\> ', offset: 0 });
    await manager.create('p1', '/projects/demo');

    expect(terminals[0].written).toBe('PS C:\\> ');
  });

  it('restores running sessions after a window reload without duplicates', async () => {
    const existing = [
      session({ id: 'a' }),
      session({ id: 'b', title: 'node' }),
    ];
    const { manager, api, terminals, emitData } = setup({
      existing,
      snapshots: {
        a: { data: 'old output', endOffset: 10 },
        b: { data: '', endOffset: 0 },
      },
    });

    const ready = manager.init();
    await flushPromises();
    // Arrives while the snapshot is in flight: one chunk the snapshot
    // already contains, one that is new.
    emitData({ id: 'a', data: 'output', offset: 4 });
    emitData({ id: 'a', data: ' + new', offset: 10 });
    await ready;

    expect(manager.sessionsFor('p1').map((s) => s.title)).toEqual([
      'zsh',
      'node',
    ]);
    expect(terminals[0].written).toBe('old output + new');
    expect(terminals[1].written).toBe('');
    expect(api.createPtySession).not.toHaveBeenCalled();
    expect(manager.getState().ready).toBe(true);
  });

  it('does not repeat output that arrived before the restore started', async () => {
    const { manager, terminals, emitData, emitExit } = setup({
      existing: [session({ id: 'a' })],
      snapshots: { a: { data: 'prompt> ls', endOffset: 10 } },
    });

    // The shell keeps talking while this window is still loading.
    const ready = manager.init();
    emitData({ id: 'a', data: 'prompt> ', offset: 0 });
    emitData({ id: 'a', data: 'ls', offset: 8 });
    await flushPromises();
    emitExit({ id: 'a', exitCode: 9, signal: null });
    await ready;
    await flushPromises();

    expect(terminals[0].written.startsWith('prompt> ls\r\n')).toBe(true);
    expect(terminals[0].written.match(/prompt> /g)).toHaveLength(1);
    expect(terminals[0].written).toContain('[Process exited with code 9]');
    expect(manager.sessionsFor('p1')[0]).toMatchObject({
      exited: true,
      exitCode: 9,
    });
  });

  it('shows why a restored session is no longer running', async () => {
    const { manager, terminals } = setup({
      existing: [session({ id: 'a', exited: true, exitCode: 2 })],
      snapshots: { a: { data: 'boom', endOffset: 4 } },
    });

    await manager.init();

    expect(terminals[0].written).toContain('boom');
    expect(terminals[0].written).toContain('[Process exited with code 2]');
  });

  it('becomes ready even when the sessions cannot be listed', async () => {
    const { manager, api } = setup();
    api.listPtySessions.mockRejectedValueOnce(new Error('ipc down'));

    await manager.init();

    expect(manager.getState()).toMatchObject({ ready: true, sessions: [] });
  });

  it('closes a session whose shell exited normally', async () => {
    const { manager, api, terminals, emitExit } = setup();
    await manager.init();
    const info = await manager.create('p1', '/projects/demo');

    emitExit({ id: info.id, exitCode: 0, signal: null });
    await flushPromises();

    expect(manager.sessionsFor('p1')).toEqual([]);
    expect(terminals[0].disposed).toBe(true);
    expect(api.killPtySession).toHaveBeenCalledWith(info.id);
  });

  it('keeps a failed session readable and stops sending input to it', async () => {
    const { manager, api, terminals, emitExit } = setup();
    await manager.init();
    const info = await manager.create('p1', '/projects/demo');

    emitExit({ id: info.id, exitCode: 127, signal: null });
    terminals[0].type('ls\r');

    expect(manager.sessionsFor('p1')[0]).toMatchObject({
      exited: true,
      exitCode: 127,
    });
    expect(terminals[0].written).toContain('[Process exited with code 127]');
    expect(api.writeToPty).not.toHaveBeenCalled();
    expect(api.killPtySession).not.toHaveBeenCalled();
  });

  it('applies an exit that arrived before the session was known', async () => {
    const { manager, terminals, emitExit } = setup();
    await manager.init();

    emitExit({ id: 's1', exitCode: 1, signal: null });
    await manager.create('p1', '/projects/demo');
    await flushPromises();

    expect(manager.sessionsFor('p1')[0].exited).toBe(true);
    expect(terminals[0].written).toContain('[Process exited with code 1]');
  });

  it('selects the neighbouring session when the active one is killed', async () => {
    const { manager, api, terminals } = setup();
    await manager.init();
    const a = await manager.create('p1', '/projects/demo');
    const b = await manager.create('p1', '/projects/demo');
    const c = await manager.create('p1', '/projects/demo');

    manager.setActive('p1', b.id);
    await manager.kill(b.id);
    expect(manager.activeFor('p1')?.id).toBe(c.id);
    expect(terminals[1].disposed).toBe(true);
    expect(api.killPtySession).toHaveBeenCalledWith(b.id);

    await manager.kill(c.id);
    expect(manager.activeFor('p1')?.id).toBe(a.id);

    await manager.kill(a.id);
    expect(manager.activeFor('p1')).toBeUndefined();
  });

  it('kills only the sessions of the given project', async () => {
    const { manager } = setup();
    await manager.init();
    await manager.create('p1', '/projects/demo');
    await manager.create('p1', '/projects/demo');
    const other = await manager.create('p2', '/projects/other');

    await manager.killAll('p1');

    expect(manager.getState().sessions.map((s) => s.id)).toEqual([other.id]);
  });

  it('updates titles from the shell and from a rename', async () => {
    const { manager, api, emitTitle } = setup();
    await manager.init();
    const info = await manager.create('p1', '/projects/demo');

    emitTitle({ id: info.id, title: 'python3', customTitle: false });
    expect(manager.sessionsFor('p1')[0].title).toBe('python3');

    await manager.rename(info.id, 'dbt run');
    expect(api.renamePtySession).toHaveBeenCalledWith(info.id, 'dbt run');
    expect(manager.sessionsFor('p1')[0]).toMatchObject({
      title: 'dbt run',
      customTitle: true,
    });
  });

  it('parks the terminal element in a container and takes it out again', async () => {
    const { manager, terminals } = setup();
    await manager.init();
    const info = await manager.create('p1', '/projects/demo');
    const container = document.createElement('div');
    document.body.appendChild(container);

    const detach = manager.attach(info.id, container);
    expect(container.children).toHaveLength(1);
    expect(terminals[0].opened).toBe(container.children[0]);

    detach();
    expect(container.children).toHaveLength(0);

    // Shown again later: same terminal, not opened a second time.
    const openedIn = terminals[0].opened;
    manager.attach(info.id, container);
    expect(terminals[0].opened).toBe(openedIn);
    expect(container.children[0]).toBe(openedIn);
    container.remove();
  });

  it('applies a theme change to open terminals and to new ones', async () => {
    const { manager, terminals } = setup();
    await manager.init();
    await manager.create('p1', '/projects/demo');
    const appearance = {
      theme: { background: '#fafafa' },
      fontFamily: 'monospace',
      fontSize: 13,
    };

    manager.setAppearance(appearance);
    await manager.create('p1', '/projects/demo');

    terminals.forEach((terminal) => {
      expect(terminal.options).toMatchObject(appearance);
    });
  });

  it('tells xterm about the Windows console backend', async () => {
    const { manager, terminals } = setup({ platform: 'win32' });
    await manager.init();
    await manager.create('p1', '/projects/demo');

    expect(terminals[0].options.windowsPty).toEqual({
      backend: 'conpty',
      buildNumber: 26200,
    });
  });

  describe('clipboard shortcuts', () => {
    const open = async (platform: string) => {
      const context = setup({ platform });
      await context.manager.init();
      const info = await context.manager.create('p1', '/projects/demo');
      const terminal = context.terminals[0];
      return { ...context, info, terminal, press: terminal.keyHandler! };
    };

    it('Windows: Ctrl+C copies a selection, otherwise reaches the shell', async () => {
      const { terminal, press, clipboard } = await open('win32');

      expect(press(key({ key: 'c', ctrlKey: true }))).toBe(true);
      expect(clipboard.writeText).not.toHaveBeenCalled();

      terminal.selection = 'copied text';
      const event = key({ key: 'c', ctrlKey: true });
      expect(press(event)).toBe(false);
      expect(event.defaultPrevented).toBe(true);
      expect(clipboard.writeText).toHaveBeenCalledWith('copied text');
      expect(terminal.selection).toBe('');
    });

    it('Windows: Ctrl+V pastes through the terminal', async () => {
      const { terminal, press, setClipboard } = await open('win32');
      setClipboard('dbt run');

      expect(press(key({ key: 'v', ctrlKey: true }))).toBe(false);
      await flushPromises();

      expect(terminal.pasted).toEqual(['dbt run']);
    });

    it('Linux: Ctrl+C/V belong to the shell, Ctrl+Shift+C/V to the clipboard', async () => {
      const { terminal, press, clipboard, setClipboard } = await open('linux');
      terminal.selection = 'picked';

      expect(press(key({ key: 'c', ctrlKey: true }))).toBe(true);
      expect(press(key({ key: 'v', ctrlKey: true }))).toBe(true);
      expect(clipboard.writeText).not.toHaveBeenCalled();

      expect(press(key({ key: 'C', ctrlKey: true, shiftKey: true }))).toBe(
        false,
      );
      expect(clipboard.writeText).toHaveBeenCalledWith('picked');

      setClipboard('pasted');
      expect(press(key({ key: 'V', ctrlKey: true, shiftKey: true }))).toBe(
        false,
      );
      await flushPromises();
      expect(terminal.pasted).toEqual(['pasted']);
    });

    it('macOS: Cmd+C/V/A/K, while Ctrl+C still interrupts', async () => {
      const { terminal, press, clipboard, setClipboard } = await open('darwin');
      terminal.written = 'screen';

      expect(press(key({ key: 'c', ctrlKey: true }))).toBe(true);
      expect(press(key({ key: 'c', metaKey: true }))).toBe(true);

      expect(press(key({ key: 'a', metaKey: true }))).toBe(false);
      expect(terminal.selection).toBe('screen');
      expect(press(key({ key: 'c', metaKey: true }))).toBe(false);
      expect(clipboard.writeText).toHaveBeenCalledWith('screen');

      setClipboard('ls');
      expect(press(key({ key: 'v', metaKey: true }))).toBe(false);
      await flushPromises();
      expect(terminal.pasted).toEqual(['ls']);

      expect(press(key({ key: 'k', metaKey: true }))).toBe(false);
      expect(terminal.cleared).toBe(1);
    });

    it('ignores key releases and does not paste into an exited shell', async () => {
      const { info, terminal, press, emitExit, setClipboard } =
        await open('win32');

      expect(
        press(new KeyboardEvent('keyup', { key: 'v', ctrlKey: true })),
      ).toBe(true);

      emitExit({ id: info.id, exitCode: 1, signal: null });
      setClipboard('late');
      press(key({ key: 'v', ctrlKey: true }));
      await flushPromises();
      expect(terminal.pasted).toEqual([]);
    });
  });
});
