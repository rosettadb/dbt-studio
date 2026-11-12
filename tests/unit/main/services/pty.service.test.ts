import {
  DATA_FLUSH_INTERVAL_MS,
  HIGH_WATERMARK_CHARS,
  LOW_WATERMARK_CHARS,
  MAX_SCROLLBACK_CHARS,
  PtyProcess,
  PtyService,
  PtyServiceDeps,
  PtySpawn,
} from '../../../../src/main/services/pty.service';
import type { ShellProfile } from '../../../../src/types/pty';

class FakePty implements PtyProcess {
  pid = 4242;

  process = 'zsh';

  written: Array<string | Buffer> = [];

  size: [number, number] | null = null;

  killed = false;

  paused = false;

  private dataListeners: Array<(data: string) => void> = [];

  private exitListeners: Array<
    (event: { exitCode: number; signal?: number }) => void
  > = [];

  onData = (listener: (data: string) => void) => {
    this.dataListeners.push(listener);
    return {
      dispose: () => {
        this.dataListeners = this.dataListeners.filter((l) => l !== listener);
      },
    };
  };

  onExit = (
    listener: (event: { exitCode: number; signal?: number }) => void,
  ) => {
    this.exitListeners.push(listener);
    return {
      dispose: () => {
        this.exitListeners = this.exitListeners.filter((l) => l !== listener);
      },
    };
  };

  write = (data: string | Buffer) => {
    this.written.push(data);
  };

  resize = (cols: number, rows: number) => {
    this.size = [cols, rows];
  };

  kill = () => {
    this.killed = true;
  };

  pause = () => {
    this.paused = true;
  };

  resume = () => {
    this.paused = false;
  };

  emit(data: string) {
    this.dataListeners.forEach((listener) => listener(data));
  }

  exit(exitCode: number) {
    this.exitListeners.forEach((listener) => listener({ exitCode }));
  }
}

const zsh: ShellProfile = {
  id: '/bin/zsh',
  name: 'zsh',
  shortName: 'zsh',
  path: '/bin/zsh',
  args: ['-l'],
};
const bash: ShellProfile = {
  id: '/bin/bash',
  name: 'bash',
  shortName: 'bash',
  path: '/bin/bash',
  args: [],
};

const setup = (overrides: Partial<PtyServiceDeps> = {}) => {
  const ptys: FakePty[] = [];
  const spawn = jest.fn<FakePty, Parameters<PtySpawn>>(() => {
    const pty = new FakePty();
    ptys.push(pty);
    return pty;
  });
  const deps: PtyServiceDeps = {
    spawn,
    detectProfiles: () => ({
      profiles: [zsh, bash],
      defaultProfileId: zsh.id,
    }),
    buildEnv: async () => ({ PATH: '/usr/bin' }),
    isDirectory: (dir) => dir === '/projects/demo',
    homedir: () => '/home/dev',
    platform: 'linux',
    ...overrides,
  };
  const service = new PtyService(deps);
  const sink = jest.fn();
  service.setEventSink(sink);
  const eventsOn = (channel: string) =>
    sink.mock.calls
      .filter(([name]) => name === channel)
      .map(([, payload]) => payload);
  return { service, spawn, ptys, sink, eventsOn };
};

const request = {
  projectId: 'project-1',
  cwd: '/projects/demo',
  cols: 120,
  rows: 32,
};

describe('PtyService', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('create', () => {
    it('starts the default shell in the project folder', async () => {
      const { service, spawn } = setup();

      const info = await service.create(request);

      expect(spawn).toHaveBeenCalledWith('/bin/zsh', ['-l'], {
        name: 'xterm-256color',
        cols: 120,
        rows: 32,
        cwd: '/projects/demo',
        env: { PATH: '/usr/bin' },
      });
      expect(info).toMatchObject({
        projectId: 'project-1',
        title: 'zsh',
        customTitle: false,
        profileId: '/bin/zsh',
        pid: 4242,
        cwd: '/projects/demo',
        exited: false,
        exitCode: null,
      });
      expect(service.list()).toEqual([info]);
      service.killAll();
    });

    it('starts the requested shell', async () => {
      const { service, spawn } = setup();

      await service.create({ ...request, profileId: bash.id });

      expect(spawn).toHaveBeenCalledWith('/bin/bash', [], expect.anything());
      service.killAll();
    });

    it('rejects a shell that is not one of the detected profiles', async () => {
      const { service, spawn } = setup();

      await expect(
        service.create({ ...request, profileId: '/tmp/evil' }),
      ).rejects.toThrow('no longer available');
      expect(spawn).not.toHaveBeenCalled();
    });

    it('explains that no shell exists', async () => {
      const { service } = setup({
        detectProfiles: () => ({ profiles: [], defaultProfileId: null }),
      });

      await expect(service.create(request)).rejects.toThrow(
        'No shell was found on this computer.',
      );
    });

    it('opens in the home folder when the project folder is gone', async () => {
      const { service, spawn } = setup();

      const info = await service.create({ ...request, cwd: '/deleted' });

      expect(info.cwd).toBe('/home/dev');
      expect(spawn.mock.calls[0][2].cwd).toBe('/home/dev');
      service.killAll();
    });

    it('keeps the terminal size within sane bounds', async () => {
      const { service, spawn } = setup();

      await service.create({ ...request, cols: 0, rows: Number.NaN });

      expect(spawn.mock.calls[0][2]).toMatchObject({ cols: 2, rows: 24 });
      service.killAll();
    });

    it('reports why a shell could not be started', async () => {
      const { service } = setup({
        spawn: () => {
          throw new Error('File not found');
        },
      });

      await expect(service.create(request)).rejects.toThrow(
        'Could not start zsh: File not found',
      );
      expect(service.list()).toEqual([]);
    });
  });

  describe('output', () => {
    it('coalesces bursts and numbers them with running offsets', async () => {
      const { service, ptys, eventsOn } = setup();
      const info = await service.create(request);

      ptys[0].emit('hello ');
      ptys[0].emit('world');
      expect(eventsOn('pty:data')).toEqual([]);

      jest.advanceTimersByTime(DATA_FLUSH_INTERVAL_MS);
      ptys[0].emit('!');
      jest.advanceTimersByTime(DATA_FLUSH_INTERVAL_MS);

      expect(eventsOn('pty:data')).toEqual([
        { id: info.id, data: 'hello world', offset: 0 },
        { id: info.id, data: '!', offset: 11 },
      ]);
      service.killAll();
    });

    it('replays everything, including unsent output, in a snapshot', async () => {
      const { service, ptys } = setup();
      const info = await service.create(request);

      ptys[0].emit('first');
      jest.advanceTimersByTime(DATA_FLUSH_INTERVAL_MS);
      ptys[0].emit(' second');

      expect(service.snapshot(info.id)).toEqual({
        data: 'first second',
        endOffset: 12,
      });
      expect(service.snapshot('unknown')).toBeNull();
      service.killAll();
    });

    it('drops the oldest output beyond the scrollback limit', async () => {
      const { service, ptys } = setup();
      const info = await service.create(request);
      const chunk = 'x'.repeat(MAX_SCROLLBACK_CHARS / 2);

      ['a', 'b', 'c'].forEach((marker) => {
        ptys[0].emit(marker + chunk);
        jest.advanceTimersByTime(DATA_FLUSH_INTERVAL_MS);
        service.acknowledge(info.id, chunk.length + 1);
      });

      const snapshot = service.snapshot(info.id)!;
      expect(snapshot.endOffset).toBe(3 * (chunk.length + 1));
      expect(snapshot.data.length).toBeLessThanOrEqual(
        MAX_SCROLLBACK_CHARS + chunk.length + 1,
      );
      expect(snapshot.data.startsWith('b')).toBe(true);
      service.killAll();
    });
  });

  describe('flow control', () => {
    it('pauses a shell that outruns the renderer and resumes on acks', async () => {
      const { service, ptys } = setup();
      const info = await service.create(request);

      ptys[0].emit('x'.repeat(HIGH_WATERMARK_CHARS + 1));
      jest.advanceTimersByTime(DATA_FLUSH_INTERVAL_MS);
      expect(ptys[0].paused).toBe(true);

      service.acknowledge(info.id, 1000);
      expect(ptys[0].paused).toBe(true);

      service.acknowledge(info.id, HIGH_WATERMARK_CHARS - LOW_WATERMARK_CHARS);
      expect(ptys[0].paused).toBe(false);
      service.killAll();
    });

    it('resumes when a reloaded window takes a snapshot', async () => {
      const { service, ptys } = setup();
      const info = await service.create(request);

      ptys[0].emit('x'.repeat(HIGH_WATERMARK_CHARS + 1));
      jest.advanceTimersByTime(DATA_FLUSH_INTERVAL_MS);
      expect(ptys[0].paused).toBe(true);

      service.snapshot(info.id);
      expect(ptys[0].paused).toBe(false);

      // The forgotten backlog no longer counts against the new window.
      ptys[0].emit('x'.repeat(HIGH_WATERMARK_CHARS - 1));
      jest.advanceTimersByTime(DATA_FLUSH_INTERVAL_MS);
      expect(ptys[0].paused).toBe(false);
      service.killAll();
    });
  });

  describe('input', () => {
    it('forwards keystrokes, and raw bytes untouched', async () => {
      const { service, ptys } = setup();
      const info = await service.create(request);

      service.write(info.id, 'ls\r');
      service.write(info.id, '\x1b[M\xff', true);
      service.write('unknown', 'ignored');

      expect(ptys[0].written[0]).toBe('ls\r');
      expect(ptys[0].written[1]).toEqual(Buffer.from([0x1b, 0x5b, 0x4d, 0xff]));
      expect(ptys[0].written).toHaveLength(2);
      service.killAll();
    });

    it('resizes only when the size changed', async () => {
      const { service, ptys } = setup();
      const info = await service.create(request);

      service.resize(info.id, 120, 32);
      expect(ptys[0].size).toBeNull();

      service.resize(info.id, 90.7, 20);
      expect(ptys[0].size).toEqual([90, 20]);
      expect(service.list()[0]).toMatchObject({ cols: 90, rows: 20 });
      service.killAll();
    });
  });

  describe('exit and kill', () => {
    it('reports an exit after the remaining output and keeps the session', async () => {
      const { service, ptys, sink } = setup();
      const info = await service.create(request);

      ptys[0].emit('bye');
      ptys[0].exit(3);

      expect(sink.mock.calls.map(([channel]) => channel)).toEqual([
        'pty:data',
        'pty:exit',
      ]);
      expect(sink).toHaveBeenLastCalledWith('pty:exit', {
        id: info.id,
        exitCode: 3,
        signal: null,
      });
      expect(service.list()[0]).toMatchObject({ exited: true, exitCode: 3 });

      // Typing into a dead shell goes nowhere.
      service.write(info.id, 'ls\r');
      service.resize(info.id, 10, 10);
      expect(ptys[0].written).toEqual([]);
      expect(ptys[0].size).toBeNull();
      service.killAll();
    });

    it('kills the shell and forgets the session without an exit event', async () => {
      const { service, ptys, eventsOn } = setup();
      const info = await service.create(request);

      expect(service.kill(info.id)).toBe(true);
      ptys[0].exit(1);

      expect(ptys[0].killed).toBe(true);
      expect(service.list()).toEqual([]);
      expect(eventsOn('pty:exit')).toEqual([]);
      expect(service.kill(info.id)).toBe(false);
    });

    it('does not signal a shell that already exited', async () => {
      const { service, ptys } = setup();
      const info = await service.create(request);
      ptys[0].exit(0);

      service.kill(info.id);

      expect(ptys[0].killed).toBe(false);
      expect(service.list()).toEqual([]);
    });

    it('kills every session when the app quits', async () => {
      const { service, ptys } = setup();
      await service.create(request);
      await service.create(request);

      service.killAll();

      expect(ptys.map((pty) => pty.killed)).toEqual([true, true]);
      expect(service.list()).toEqual([]);
    });
  });

  describe('titles', () => {
    it('follows the foreground process until the user renames', async () => {
      const { service, ptys, eventsOn } = setup();
      const info = await service.create(request);

      ptys[0].process = '/usr/bin/python3';
      jest.advanceTimersByTime(1000);
      expect(eventsOn('pty:title')).toEqual([
        { id: info.id, title: 'python3', customTitle: false },
      ]);

      expect(service.rename(info.id, '  dbt run  ')).toMatchObject({
        title: 'dbt run',
        customTitle: true,
      });
      ptys[0].process = 'node';
      jest.advanceTimersByTime(1000);
      expect(service.list()[0].title).toBe('dbt run');

      // An empty name hands the title back to the process.
      expect(service.rename(info.id, '')).toMatchObject({
        title: 'node',
        customTitle: false,
      });
      service.killAll();
    });

    it('strips the login-shell dash Linux reports', async () => {
      const { service, ptys } = setup();
      const info = await service.create(request);

      ptys[0].process = '-zsh';
      service.rename(info.id, '');

      expect(service.list()[0].title).toBe('zsh');
      service.killAll();
    });

    it('keeps the shell name on Windows, where the process is unknown', async () => {
      const { service, ptys, eventsOn } = setup({ platform: 'win32' });
      const info = await service.create(request);

      ptys[0].process = 'node';
      jest.advanceTimersByTime(5000);

      expect(eventsOn('pty:title')).toEqual([]);
      expect(service.rename(info.id, '')).toMatchObject({ title: 'zsh' });
      service.killAll();
    });
  });
});
