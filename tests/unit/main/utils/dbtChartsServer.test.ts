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

  kill = jest.fn((signal?: string) => {
    this.signalCode = signal ?? 'SIGTERM';
    setTimeout(() => this.emit('exit', null, this.signalCode), 0);
    return true;
  });

  constructor(pid: number) {
    super();
    this.pid = pid;
  }
}

const children: FakeChild[] = [];
let nextPid = 4000;

jest.mock('child_process', () => ({
  spawn: jest.fn(() => {
    nextPid += 1;
    const child = new FakeChild(nextPid);
    children.push(child);
    return child;
  }),
  execFile: jest.fn(),
}));

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

// Answers /health as the newest fake child for its project.
const startHealthServer = (
  projectFor: () => { pid: number; project: string },
) =>
  new Promise<void>((resolve) => {
    health = http.createServer((req, res) => {
      if (req.url !== '/health') {
        res.writeHead(404).end();
        return;
      }
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

beforeEach(async () => {
  children.length = 0;
  broadcasts.length = 0;
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
    expect(children[0].kill).toHaveBeenCalled();
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
    expect(children[0].kill).toHaveBeenCalledWith('SIGTERM');
    expect(server.getServerStatus('/projects/a').state).toBe('stopped');
  });

  it('stopServer from the user marks the stop and Force Kill sends SIGKILL', async () => {
    const server = loadModule();
    const pending = server.ensureServer(options('/projects/a'));
    announce(await waitForChild(1));
    await pending;
    await server.stopServer({ force: true, byUser: true });
    expect(children[0].kill).toHaveBeenCalledWith('SIGKILL');
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
    expect(children[0].kill).toHaveBeenCalled();
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
      expect(children[0].kill).toHaveBeenCalledWith('SIGTERM');
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
