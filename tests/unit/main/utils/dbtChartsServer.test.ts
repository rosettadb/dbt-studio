import { EventEmitter } from 'events';
import http from 'http';
import type { AddressInfo } from 'net';

// A stand-in for `dct serve`: it prints the URL line dbt-charts 0.11.1
// prints, and a real local HTTP server answers /health for it.
class FakeChild extends EventEmitter {
  stdout = new EventEmitter();

  stderr = new EventEmitter();

  pid: number;

  exitCode: number | null = null;

  signalCode: string | null = null;

  // Ignores every kill, like a process that cannot be stopped.
  stuck = false;

  // How long it takes to exit once killed.
  exitDelay = 0;

  // Ends the process (kill on macOS/Linux, taskkill on Windows).
  terminate(signal: string) {
    if (this.stuck || this.exitCode !== null || this.signalCode !== null) {
      return;
    }
    this.signalCode = signal;
    setTimeout(() => this.emit('exit', null, signal), this.exitDelay);
  }

  kill = jest.fn((signal?: string) => {
    this.terminate(signal ?? 'SIGTERM');
    return true;
  });

  constructor(pid: number) {
    super();
    this.pid = pid;
  }
}

const children: FakeChild[] = [];
let nextPid = 4000;
// The arguments of every `taskkill` (Windows stops).
const taskkills: string[][] = [];

jest.mock('child_process', () => ({
  spawn: jest.fn(() => {
    nextPid += 1;
    const child = new FakeChild(nextPid);
    children.push(child);
    return child;
  }),
  execFile: jest.fn(
    (command: string, args: string[], callback?: (error: null) => void) => {
      if (command === 'taskkill') {
        taskkills.push(args);
        children
          .find((child) => String(child.pid) === args[1])
          ?.terminate('SIGKILL');
      }
      callback?.(null);
    },
  ),
}));

// Checks the stop for the platform: taskkill on Windows, a signal elsewhere.
const expectTerminated = (child: FakeChild, signal?: string) => {
  if (process.platform === 'win32') {
    expect(taskkills).toContainEqual(['/pid', String(child.pid), '/T', '/F']);
  } else if (signal) {
    expect(child.kill).toHaveBeenCalledWith(signal);
  } else {
    expect(child.kill).toHaveBeenCalled();
  }
};

const withPlatform = async (
  platform: typeof process.platform,
  run: () => Promise<void>,
) => {
  const original = Object.getOwnPropertyDescriptor(process, 'platform')!;
  Object.defineProperty(process, 'platform', { value: platform });
  try {
    await run();
  } finally {
    Object.defineProperty(process, 'platform', original);
  }
};

const broadcasts: unknown[] = [];
jest.mock('../../../../src/main/utils/rendererBroadcast', () => ({
  broadcastToRenderers: jest.fn((_channel: string, payload: unknown) => {
    broadcasts.push(payload);
  }),
}));

type ServerModule = typeof import('../../../../src/main/utils/dbtChartsServer');

let health: http.Server;
let healthPort = 0;

const loadModule = (): ServerModule => {
  let mod: ServerModule | undefined;
  jest.isolateModules(() => {
    // eslint-disable-next-line global-require
    mod = require('../../../../src/main/utils/dbtChartsServer');
  });
  return mod!;
};

type TaskManager =
  typeof import('../../../../src/main/services/taskManager.service').TaskManagerService;

// The server module and the Task Manager instance it reports to (one
// isolated module registry, so both are the same instance).
const loadWithTasks = (): { server: ServerModule; tasks: TaskManager } => {
  let server: ServerModule | undefined;
  let tasks: TaskManager | undefined;
  jest.isolateModules(() => {
    // eslint-disable-next-line global-require
    server = require('../../../../src/main/utils/dbtChartsServer');
    // eslint-disable-next-line global-require
    const taskModule = require('../../../../src/main/services/taskManager.service');
    tasks = taskModule.TaskManagerService;
  });
  return { server: server!, tasks: tasks! };
};

const serverRows = (tasks: TaskManager) =>
  tasks.list().filter((task) => task.type === 'dbt-charts-server');

// 'down': /health answers 404 (dct not ready). 'cut-once': the next answer
// sends its headers and part of the body, then closes the connection.
let healthMode: 'ok' | 'down' | 'cut-once' = 'ok';
// Runs once, while the next /health answer is being sent.
let onHealth: (() => void) | null = null;

// Answers /health as the newest fake child for its project.
const startHealthServer = (
  projectFor: () => { pid: number; project: string },
) =>
  new Promise<void>((resolve) => {
    health = http.createServer((req, res) => {
      if (req.url !== '/health' || healthMode === 'down') {
        res.writeHead(404).end();
        return;
      }
      if (healthMode === 'cut-once') {
        healthMode = 'ok';
        res.writeHead(200, {
          'Content-Type': 'application/json',
          'Content-Length': '200',
        });
        res.write('{"status":');
        setTimeout(() => req.socket.destroy(), 20);
        return;
      }
      const hook = onHealth;
      onHealth = null;
      hook?.();
      const { pid, project } = projectFor();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          status: 'ok',
          service: 'dbt-charts-server',
          pid,
          project,
        }),
      );
    });
    health.listen(0, '127.0.0.1', () => {
      healthPort = (health.address() as AddressInfo).port;
      resolve();
    });
  });

// Waits until the Nth `dct serve` has been spawned (after its free-port lookup).
const waitForChild = async (count: number): Promise<FakeChild> => {
  const deadline = Date.now() + 5000;
  while (children.length < count && Date.now() < deadline) {
    // eslint-disable-next-line no-await-in-loop
    await new Promise((resolve) => {
      setTimeout(resolve, 5);
    });
  }
  return children[count - 1];
};

const announce = (child: FakeChild) => {
  setTimeout(() => {
    child.stdout.emit(
      'data',
      Buffer.from(
        `📈 Starting dashboard server\n   URL: http://127.0.0.1:${healthPort}\n`,
      ),
    );
  }, 20);
};

const options = (projectPath: string) => ({
  projectPath,
  dctBin: '/venv/bin/dct',
  env: {},
  redact: (text: string) => text.replace('hunter2', '***'),
});

let currentProject = '/projects/a';

const tick = (ms: number) =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

// Polls until `check` holds (or 5 s pass).
const until = async (check: () => boolean) => {
  const deadline = Date.now() + 5000;
  while (!check() && Date.now() < deadline) {
    // eslint-disable-next-line no-await-in-loop
    await tick(5);
  }
};

beforeEach(async () => {
  children.length = 0;
  broadcasts.length = 0;
  taskkills.length = 0;
  healthMode = 'ok';
  onHealth = null;
  currentProject = '/projects/a';
  await startHealthServer(() => ({
    pid: children[children.length - 1]?.pid ?? 0,
    project: currentProject,
  }));
});

afterEach(async () => {
  await new Promise<void>((resolve) => {
    health.close(() => resolve());
  });
});

describe('dbtChartsServer', () => {
  it('runs once /health answers, on the port from the URL line', async () => {
    const server = loadModule();
    const pending = server.ensureServer(options('/projects/a'));
    announce(await waitForChild(1));
    const status = await pending;
    expect(status).toEqual(
      expect.objectContaining({
        projectPath: '/projects/a',
        state: 'running',
        url: `http://127.0.0.1:${healthPort}`,
        pid: children[0].pid,
        command: expect.stringMatching(/^dct serve --host 127\.0\.0\.1 /),
      }),
    );
    expect(status.startedAt).toEqual(expect.any(Number));
    expect(broadcasts).toContainEqual(
      expect.objectContaining({ state: 'starting' }),
    );
    expect(server.getServerStatus('/projects/a').state).toBe('running');
  });

  it('spawns once for concurrent calls', async () => {
    const server = loadModule();
    const first = server.ensureServer(options('/projects/a'));
    const second = server.ensureServer(options('/projects/a'));
    announce(await waitForChild(1));
    await Promise.all([first, second]);
    expect(children).toHaveLength(1);
  });

  it('reports a crash with the redacted last lines', async () => {
    const server = loadModule();
    const pending = server.ensureServer(options('/projects/a'));
    announce(await waitForChild(1));
    await pending;
    children[0].stderr.emit('data', Buffer.from('auth failed for hunter2\n'));
    children[0].exitCode = 1;
    children[0].emit('exit', 1, null);
    const status = server.getServerStatus('/projects/a');
    expect(status.state).toBe('crashed');
    expect(status.lines?.join('\n')).toContain('auth failed for ***');
    expect(status.lines?.join('\n')).not.toContain('hunter2');
  });

  it('stops the other project server before starting a new one', async () => {
    const server = loadModule();
    const a = server.ensureServer(options('/projects/a'));
    announce(await waitForChild(1));
    await a;

    currentProject = '/projects/b';
    const b = server.ensureServer(options('/projects/b'));
    announce(await waitForChild(2));
    expectTerminated(children[0]);
    const status = await b;
    expect(status.state).toBe('running');
    expect(server.getServerStatus('/projects/a').state).not.toBe('running');
  });

  it('stopServer kills the running server', async () => {
    const server = loadModule();
    const pending = server.ensureServer(options('/projects/a'));
    announce(await waitForChild(1));
    await pending;
    await server.stopServer();
    expectTerminated(children[0], 'SIGTERM');
    expect(server.getServerStatus('/projects/a').state).toBe('stopped');
  });

  it('stopServer from the user marks the stop and Force Kill sends SIGKILL', async () => {
    const server = loadModule();
    const pending = server.ensureServer(options('/projects/a'));
    announce(await waitForChild(1));
    await pending;
    await server.stopServer({ force: true, byUser: true });
    expectTerminated(children[0], 'SIGKILL');
    expect(server.getServerStatus('/projects/a')).toEqual(
      expect.objectContaining({ state: 'stopped', userStopped: true }),
    );
  });

  it('a stop by the user while it starts ends stopped, not crashed', async () => {
    const server = loadModule();
    const pending = server.ensureServer(options('/projects/a'));
    await waitForChild(1);
    const generation = server.serverGeneration();
    await server.stopServer({ byUser: true });
    expect(server.serverGeneration()).toBeGreaterThan(generation);
    expect(await pending).toEqual(
      expect.objectContaining({ state: 'stopped', userStopped: true }),
    );
    await tick(400); // past the next readiness poll
    expect(server.getServerStatus('/projects/a')).toEqual(
      expect.objectContaining({ state: 'stopped', userStopped: true }),
    );
    expect(broadcasts).not.toContainEqual(
      expect.objectContaining({ state: 'crashed' }),
    );
  });

  it('starts again right after a stop during start', async () => {
    const server = loadModule();
    server.ensureServer(options('/projects/a')).catch(() => undefined);
    await waitForChild(1);
    await server.stopServer({ byUser: true });
    const again = server.ensureServer(options('/projects/a'));
    announce(await waitForChild(2));
    expect((await again).state).toBe('running');
    expectTerminated(children[0]);
  });

  it('spawns one server for parallel starts after a crash', async () => {
    const server = loadModule();
    const pending = server.ensureServer(options('/projects/a'));
    announce(await waitForChild(1));
    await pending;
    children[0].exitCode = 1;
    children[0].emit('exit', 1, null);

    const first = server.ensureServer(options('/projects/a'));
    const second = server.ensureServer(options('/projects/a'));
    announce(await waitForChild(2));
    const states = (await Promise.all([first, second])).map((s) => s.state);
    expect(states).toEqual(['running', 'running']);
    expect(children).toHaveLength(2);
  });

  it('a start for another project during the port lookup wins alone', async () => {
    const server = loadModule();
    const a = server.ensureServer(options('/projects/a'));
    currentProject = '/projects/b';
    const b = server.ensureServer(options('/projects/b'));
    announce(await waitForChild(1));
    expect((await b).state).toBe('running');
    expect((await a).state).toBe('stopped');
    await tick(100);
    expect(children).toHaveLength(1);
    expect(server.getServerLog('/projects/b')[0]).toContain('/projects/b');
  });

  it('keeps a redacted session log and sends it to the renderer', async () => {
    const server = loadModule();
    const pending = server.ensureServer(options('/projects/a'));
    const child = await waitForChild(1);
    announce(child);
    await pending;
    child.stderr.emit('data', Buffer.from('token hunter2 used\n'));

    const lines = server.getServerLog('/projects/a');
    expect(lines[0]).toMatch(/^\$ dct serve /);
    expect(lines).toContain(`   URL: http://127.0.0.1:${healthPort}`);
    expect(lines).toContain('token *** used');
    expect(lines.join('\n')).not.toContain('hunter2');
    expect(server.getServerLog('/projects/other')).toEqual([]);
    expect(broadcasts).toContainEqual(
      expect.objectContaining({
        projectPath: '/projects/a',
        lines: ['token *** used'],
      }),
    );

    server.clearServerLog();
    expect(server.getServerLog('/projects/a')).toEqual([]);
    expect(broadcasts).toContainEqual({
      projectPath: '/projects/a',
      lines: [],
      reset: true,
    });
  });

  it('starts a new log when another project runs a server', () => {
    const server = loadModule();
    server.appendServerLog('/projects/a', ['one']);
    server.appendServerLog('/projects/b', ['two']);
    expect(server.getServerLog('/projects/a')).toEqual([]);
    expect(server.getServerLog('/projects/b')).toEqual(['two']);
    expect(broadcasts).toContainEqual({
      projectPath: '/projects/b',
      lines: ['two'],
      reset: true,
    });
  });

  const startProject = async (
    server: ServerModule,
    projectPath: string,
    count: number,
  ) => {
    currentProject = projectPath;
    const pending = server.ensureServer(options(projectPath));
    announce(await waitForChild(count));
    return pending;
  };

  it("keeps a project's user stop when another project starts", async () => {
    const server = loadModule();
    await startProject(server, '/projects/a', 1);
    await server.stopServer({ byUser: true });
    await startProject(server, '/projects/b', 2);

    expect(server.getServerStatus('/projects/a')).toEqual(
      expect.objectContaining({ state: 'stopped', userStopped: true }),
    );

    // Starting that project again clears it.
    await startProject(server, '/projects/a', 3);
    await server.stopServer();
    expect(server.getServerStatus('/projects/a').userStopped).toBeUndefined();
  });

  it('assembles lines split across output chunks', async () => {
    const server = loadModule();
    const pending = server.ensureServer(options('/projects/a'));
    const child = await waitForChild(1);
    const port = String(healthPort);
    child.stdout.emit(
      'data',
      Buffer.from(`   URL: http://127.0.0.1:${port.slice(0, 2)}`),
    );
    child.stdout.emit('data', Buffer.from(`${port.slice(2)}\n`));
    expect((await pending).url).toBe(`http://127.0.0.1:${port}`);

    child.stderr.emit('data', Buffer.from('token hun'));
    child.stderr.emit('data', Buffer.from('ter2 used\nlast words'));
    child.stderr.emit('end');
    const lines = server.getServerLog('/projects/a');
    expect(lines).toContain('token *** used');
    expect(lines).toContain('last words');
    expect(lines.join('\n')).not.toMatch(/hun|ter2/);
  });

  it('settles the health probe when the answer is cut off', async () => {
    healthMode = 'cut-once';
    const server = loadModule();
    const pending = server.ensureServer(options('/projects/a'));
    announce(await waitForChild(1));
    expect((await pending).state).toBe('running');
  });

  it('does not report running when dct exits while /health answers', async () => {
    const server = loadModule();
    const pending = server.ensureServer(options('/projects/a'));
    const child = await waitForChild(1);
    onHealth = () => {
      child.exitCode = 1;
      child.emit('exit', 1, null);
    };
    announce(child);

    expect((await pending).state).toBe('crashed');
    expect(server.getServerStatus('/projects/a').state).toBe('crashed');
    expect(server.getRunningServerOrigin()).toBeNull();
    expect(broadcasts).not.toContainEqual(
      expect.objectContaining({ state: 'running' }),
    );
  });

  it('a Stop during the start-timeout cleanup keeps its stopped result', async () => {
    healthMode = 'down';
    const server = loadModule();
    const pending = server.ensureServer(options('/projects/a'));
    const child = await waitForChild(1);
    child.exitDelay = 200;
    const realNow = Date.now.bind(Date);
    const clock = jest
      .spyOn(Date, 'now')
      .mockImplementation(() => realNow() + 61_000);
    try {
      // The start timed out and is stopping dct.
      await until(() => child.kill.mock.calls.length > 0);
      await server.stopServer({ byUser: true });
      expect(await pending).toEqual(
        expect.objectContaining({ state: 'stopped', userStopped: true }),
      );
    } finally {
      clock.mockRestore();
    }
    expect(server.getServerStatus('/projects/a')).toEqual(
      expect.objectContaining({ state: 'stopped', userStopped: true }),
    );
    expect(broadcasts).not.toContainEqual(
      expect.objectContaining({ state: 'crashed' }),
    );
  });

  it('a start waits for a stop that is still in progress', async () => {
    const server = loadModule();
    await startProject(server, '/projects/a', 1);
    children[0].exitDelay = 300;

    const b = server.ensureServer(options('/projects/b'));
    await tick(20); // b is stopping a
    currentProject = '/projects/c';
    const c = server.ensureServer(options('/projects/c'));
    await tick(100);
    expect(children).toHaveLength(1); // c waits for a to exit

    announce(await waitForChild(2));
    expect((await c).state).toBe('running');
    expect((await b).state).toBe('stopped');
    expect(children).toHaveLength(2);
  });

  it('a second Stop waits for the first one to finish', async () => {
    const server = loadModule();
    await startProject(server, '/projects/a', 1);
    children[0].exitDelay = 200;

    const first = server.stopServer();
    let secondDone = false;
    const second = server.stopServer().then(() => {
      secondDone = true;
      return undefined;
    });
    await tick(50);
    expect(secondDone).toBe(false);
    await Promise.all([first, second]);
    expect(server.getServerStatus('/projects/a').state).toBe('stopped');
  });

  it('keeps a server that does not exit, so Stop can try again', async () => {
    const { server, tasks } = loadWithTasks();
    await startProject(server, '/projects/a', 1);
    const child = children[0];
    child.stuck = true;

    jest.useFakeTimers({
      doNotFake: ['nextTick', 'setImmediate', 'queueMicrotask'],
    });
    let error: Error | null = null;
    try {
      const stop = server.stopServer({ byUser: true }).catch((e: Error) => {
        error = e;
      });
      await jest.advanceTimersByTimeAsync(11_000);
      await stop;
    } finally {
      jest.useRealTimers();
    }
    expect((error as Error | null)?.message).toMatch(/did not exit/);
    expect(server.getServerStatus('/projects/a').state).toBe('running');
    expect(server.getRunningServerOrigin()).not.toBeNull();
    expect(serverRows(tasks)[0].status).toBe('running');

    child.stuck = false;
    await server.stopServer({ byUser: true });
    expect(server.getServerStatus('/projects/a')).toEqual(
      expect.objectContaining({ state: 'stopped', userStopped: true }),
    );
    expect(serverRows(tasks)[0].status).toBe('completed');
  });

  it('stops with taskkill on Windows', async () => {
    await withPlatform('win32', async () => {
      const server = loadModule();
      await startProject(server, '/projects/a', 1);
      await server.stopServer();
      expect(taskkills).toEqual([
        ['/pid', String(children[0].pid), '/T', '/F'],
      ]);
      expect(children[0].kill).not.toHaveBeenCalled();
      expect(server.getServerStatus('/projects/a').state).toBe('stopped');
    });
  });

  describe('Task Manager row', () => {
    const startRunning = async (server: ServerModule, count = 1) => {
      const pending = server.ensureServer(options('/projects/a'));
      announce(await waitForChild(count));
      return pending;
    };

    it('shows a running, stoppable row and completes it on stop', async () => {
      const { server, tasks } = loadWithTasks();
      await startRunning(server);
      const [row] = serverRows(tasks);
      expect(row).toEqual(
        expect.objectContaining({
          status: 'running',
          cancellable: true,
          label: 'dbt Charts server · a',
        }),
      );

      await server.stopServer();
      expect(serverRows(tasks)[0]).toEqual(
        expect.objectContaining({ id: row.id, status: 'completed' }),
      );
    });

    it('Stop in the Task Manager stops the server as a user stop', async () => {
      const { server, tasks } = loadWithTasks();
      await startRunning(server);
      const [row] = serverRows(tasks);

      expect(tasks.cancel(row.id)).toBe(true);
      await tick(50);
      expectTerminated(children[0], 'SIGTERM');
      expect(server.getServerStatus('/projects/a')).toEqual(
        expect.objectContaining({ state: 'stopped', userStopped: true }),
      );
      // The Task Manager's own status stays: Cancelled, not Completed.
      expect(serverRows(tasks)[0].status).toBe('cancelled');
    });

    it('Stop in the Task Manager also stops a server that is starting', async () => {
      const { server, tasks } = loadWithTasks();
      const pending = server.ensureServer(options('/projects/a'));
      await waitForChild(1);
      const [row] = serverRows(tasks);
      expect(row.status).toBe('running');

      tasks.cancel(row.id);
      expect(await pending).toEqual(
        expect.objectContaining({ state: 'stopped', userStopped: true }),
      );
      expect(serverRows(tasks)[0].status).toBe('cancelled');
    });

    it('fails the row with the exit reason when dct crashes', async () => {
      const { server, tasks } = loadWithTasks();
      await startRunning(server);
      children[0].exitCode = 1;
      children[0].emit('exit', 1, null);
      expect(serverRows(tasks)[0]).toEqual(
        expect.objectContaining({
          status: 'error',
          error: 'dct exited (code 1).',
        }),
      );
    });

    it('keeps only the newest row across restarts', async () => {
      const { server, tasks } = loadWithTasks();
      await startRunning(server);
      const [first] = serverRows(tasks);
      await server.stopServer();
      await startRunning(server, 2);

      const rows = serverRows(tasks);
      expect(rows).toHaveLength(1);
      expect(rows[0].id).not.toBe(first.id);
      expect(rows[0].status).toBe('running');
    });
  });
});
