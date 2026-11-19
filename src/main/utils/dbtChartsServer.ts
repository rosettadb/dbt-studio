import { ChildProcess, spawn, execFile, execFileSync } from 'child_process';
import http from 'http';
import net from 'net';
import path from 'path';
import { app } from 'electron';
import fs from 'fs-extra';
import type {
  ChartsServerLogEvent,
  ChartsServerStatus,
} from '../../shared/dbtCharts';
import { TaskManagerService } from '../services/taskManager.service';
import { broadcastToRenderers } from './rendererBroadcast';

// One `dct serve` at a time (dbt-charts 0.11.1, src/dbt_charts/core/serve):
// - stdout prints `   URL: http://<host>:<port>` once it binds; dct moves to
//   the next free port when the one asked for is taken, so that line wins;
// - GET /health answers {status, service: "dbt-charts-server", pid, project};
// - the page live-reloads itself over SSE (/__livereload) on file changes.
//
// Its output also goes to a session log (the CHARTS SERVER terminal tab), and
// each dct process is a row in Settings → Task Manager, whose Stop button
// stops it the way the CHARTS SERVER tab does.

const READY_TIMEOUT_MS = 60_000;
const READY_POLL_MS = 300;
const STOP_GRACE_MS = 5_000;
const MAX_LINES = 50;
const MAX_LOG_LINES = 1_000;
const HOST = '127.0.0.1';
const URL_LINE = /URL:\s*http:\/\/[^\s:]+:(\d+)/;

/** The Task Manager task type of a running `dct serve`. */
export const DBT_CHARTS_SERVER_TASK_TYPE = 'dbt-charts-server';

interface ServerEntry {
  projectPath: string;
  port: number;
  child: ChildProcess;
  lines: string[];
  stopping: boolean;
  status: ChartsServerStatus;
  // Its row in the Task Manager.
  taskId: string;
}

export interface StartServerOptions {
  projectPath: string;
  dctBin: string;
  env: Record<string, string | undefined>;
  redact: (text: string) => string;
}

export interface StopServerOptions {
  // SIGKILL (Windows: taskkill /F) right away instead of SIGTERM first.
  force?: boolean;
  // The user stopped it: a board tab must not start it again by itself.
  byUser?: boolean;
}

let current: ServerEntry | null = null;
let starting: {
  projectPath: string;
  promise: Promise<ChartsServerStatus>;
} | null = null;
let lastStatus: ChartsServerStatus = { projectPath: null, state: 'stopped' };
// Bumped by every start request and every stop. A start that sees a newer
// generation was superseded (stopped, or replaced by another start) and
// gives up without publishing anything.
let generation = 0;
// The last stop, so a superseded start can report the status it left.
let lastStop: Promise<void> = Promise.resolve();
// Every dct child that has not exited yet, for the last-resort kill on exit.
const liveChildren = new Set<ChildProcess>();

// The session log of the last project that ran a server (already redacted).
const log: { projectPath: string | null; lines: string[] } = {
  projectPath: null,
  lines: [],
};

const publish = (status: ChartsServerStatus) => {
  lastStatus = status;
  broadcastToRenderers('dbt-charts:serverStatus', status);
};

export const publishServerStatus = publish;

/** Adds lines to the project's server log and sends them to the renderer. */
export const appendServerLog = (projectPath: string, lines: string[]) => {
  if (lines.length === 0) return;
  const reset = log.projectPath !== projectPath;
  if (reset) {
    log.projectPath = projectPath;
    log.lines = [];
  }
  log.lines.push(...lines);
  if (log.lines.length > MAX_LOG_LINES) {
    log.lines.splice(0, log.lines.length - MAX_LOG_LINES);
  }
  const event: ChartsServerLogEvent = { projectPath, lines, reset };
  broadcastToRenderers('dbt-charts:serverLog', event);
};

export const getServerLog = (projectPath: string): string[] =>
  log.projectPath === projectPath ? [...log.lines] : [];

export const clearServerLog = () => {
  const { projectPath } = log;
  log.lines = [];
  if (projectPath) {
    const event: ChartsServerLogEvent = { projectPath, lines: [], reset: true };
    broadcastToRenderers('dbt-charts:serverLog', event);
  }
};

export const getFreePort = (): Promise<number> =>
  new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.on('error', reject);
    server.listen(0, HOST, () => {
      const address = server.address();
      const port = typeof address === 'object' && address ? address.port : 0;
      server.close(() => (port ? resolve(port) : reject(new Error('No port'))));
    });
  });

const samePath = async (a: string, b: string): Promise<boolean> => {
  const real = async (p: string) => {
    try {
      return await fs.realpath(p);
    } catch {
      return p;
    }
  };
  const [ra, rb] = await Promise.all([real(a), real(b)]);
  return process.platform === 'win32'
    ? ra.toLowerCase() === rb.toLowerCase()
    : ra === rb;
};

const readHealth = (
  port: number,
): Promise<{ pid?: number; project?: string; service?: string } | null> =>
  new Promise((resolve) => {
    const req = http.get(
      { host: HOST, port, path: '/health', timeout: 2000 },
      (res) => {
        let body = '';
        res.setEncoding('utf8');
        res.on('data', (chunk) => {
          body += chunk;
        });
        res.on('end', () => {
          if (res.statusCode !== 200) {
            resolve(null);
            return;
          }
          try {
            resolve(JSON.parse(body));
          } catch {
            resolve(null);
          }
        });
      },
    );
    req.on('error', () => resolve(null));
    req.on('timeout', () => {
      req.destroy();
      resolve(null);
    });
  });

const isOurServer = async (entry: ServerEntry): Promise<boolean> => {
  const health = await readHealth(entry.port);
  if (!health || health.service !== 'dbt-charts-server') return false;
  // On Windows dct.exe is a launcher, so its pid differs from Python's.
  if (health.pid && health.pid === entry.child.pid) return true;
  return health.project ? samePath(health.project, entry.projectPath) : false;
};

const sleep = (ms: number) =>
  new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });

const hasExited = (child: ChildProcess) =>
  child.exitCode !== null || child.signalCode !== null;

const killTree = (child: ChildProcess) => {
  if (hasExited(child)) return;
  if (process.platform === 'win32' && child.pid) {
    execFile('taskkill', ['/pid', String(child.pid), '/T', '/F'], () => {});
    return;
  }
  child.kill('SIGKILL');
};

const stopEntry = async (entry: ServerEntry, force = false): Promise<void> => {
  entry.stopping = true;
  const { child } = entry;
  if (hasExited(child)) return;
  const exited = new Promise<void>((resolve) => {
    child.once('exit', () => resolve());
  });
  if (force || process.platform === 'win32') {
    killTree(child);
  } else {
    child.kill('SIGTERM');
  }
  const timedOut = await Promise.race([
    exited.then(() => false),
    sleep(STOP_GRACE_MS).then(() => true),
  ]);
  if (timedOut) killTree(child);
};

const taskStatus = (taskId: string) =>
  TaskManagerService.list().find((task) => task.id === taskId)?.status;

/**
 * Ends the server's Task Manager row: Completed when it was stopped, Failed
 * with the reason when it crashed. A row already ended (Stop in the Task
 * Manager marks it Cancelled) is left as it is.
 */
const closeTask = (taskId: string, error?: string) => {
  if (taskStatus(taskId) !== 'running') return;
  if (error) TaskManagerService.fail(taskId, error);
  else TaskManagerService.complete(taskId);
};

const stopCurrent = async ({
  force = false,
  byUser = false,
}: StopServerOptions = {}): Promise<void> => {
  const entry = current;
  current = null;
  if (!entry) {
    // Nothing runs; a user stop still keeps a crashed board from restarting.
    if (byUser && lastStatus.projectPath && lastStatus.state !== 'stopped') {
      publish({
        projectPath: lastStatus.projectPath,
        state: 'stopped',
        userStopped: true,
      });
    }
    return;
  }
  appendServerLog(entry.projectPath, [
    force ? '■ Killing dbt Charts server…' : '■ Stopping dbt Charts server…',
  ]);
  await stopEntry(entry, force);
  appendServerLog(entry.projectPath, ['■ dbt Charts server stopped.']);
  closeTask(entry.taskId);
  publish({
    projectPath: entry.projectPath,
    state: 'stopped',
    ...(byUser ? { userStopped: true } : {}),
  });
};

/**
 * Stops the server, and cancels a start (or a `dbt parse` before one) that
 * is still in progress.
 */
export const stopServer = (options: StopServerOptions = {}): Promise<void> => {
  generation += 1;
  starting = null;
  lastStop = stopCurrent(options);
  return lastStop;
};

/** The current start/stop generation (see `generation`). */
export const serverGeneration = (): number => generation;

let taskCount = 0;
let lastTaskId: string | null = null;

/**
 * Adds the server's row to the Task Manager. Its Stop button is a stop by
 * the user, like ■ in the CHARTS SERVER tab: board tabs then wait for Start.
 * Only the newest row is kept, so restarts don't fill the history.
 */
const openTask = (projectPath: string): string => {
  if (lastTaskId && taskStatus(lastTaskId) !== 'running') {
    TaskManagerService.remove(lastTaskId);
  }
  taskCount += 1;
  const taskId = `${DBT_CHARTS_SERVER_TASK_TYPE}:${Date.now()}:${taskCount}`;
  TaskManagerService.create({
    id: taskId,
    type: DBT_CHARTS_SERVER_TASK_TYPE,
    label: `dbt Charts server · ${path.basename(projectPath)}`,
    cancellable: true,
  });
  TaskManagerService.registerCanceller(taskId, () => {
    stopServer({ byUser: true }).catch(() => undefined);
  });
  lastTaskId = taskId;
  return taskId;
};

export const getServerStatus = (projectPath: string): ChartsServerStatus => {
  if (current && current.projectPath === projectPath) return current.status;
  if (lastStatus.projectPath === projectPath) return lastStatus;
  return { projectPath, state: 'stopped' };
};

/**
 * What a superseded start reports: the start that replaced it (same
 * project), else the status once the last stop has finished.
 */
export const pendingServerStatus = async (
  projectPath: string,
): Promise<ChartsServerStatus> => {
  if (starting && starting.projectPath === projectPath) {
    return starting.promise;
  }
  await lastStop.catch(() => undefined);
  return getServerStatus(projectPath);
};

/** `http://127.0.0.1:<port>` of the running board server, else null. */
export const getRunningServerOrigin = (): string | null =>
  current && current.status.state === 'running'
    ? `http://${HOST}:${current.port}`
    : null;

const launch = async (
  { projectPath, dctBin, env, redact }: StartServerOptions,
  gen: number,
): Promise<ChartsServerStatus> => {
  const superseded = () => gen !== generation;
  const requestedPort = await getFreePort();
  if (superseded()) return pendingServerStatus(projectPath);
  const args = [
    'serve',
    '--host',
    HOST,
    '--port',
    String(requestedPort),
    '--project-dir',
    projectPath,
  ];
  const command = `dct ${args.join(' ')}`;
  appendServerLog(projectPath, [`$ ${command}`]);
  const child = spawn(dctBin, args, {
    cwd: projectPath,
    env,
    shell: false,
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  liveChildren.add(child);
  child.once('exit', () => liveChildren.delete(child));
  const startedAt = Date.now();
  const processInfo = { pid: child.pid, startedAt, command };

  const entry: ServerEntry = {
    projectPath,
    port: requestedPort,
    child,
    lines: [],
    stopping: false,
    status: { projectPath, state: 'starting', ...processInfo },
    taskId: openTask(projectPath),
  };
  current = entry;
  publish(entry.status);

  const onOutput = (chunk: Buffer) => {
    const lines = chunk
      .toString()
      .split(/\r?\n/)
      .map((line) => redact(line).trimEnd())
      .filter((line) => line.trim().length > 0);
    lines.forEach((line) => {
      const match = URL_LINE.exec(line);
      if (match) entry.port = Number(match[1]);
      entry.lines.push(line);
      if (entry.lines.length > MAX_LINES) entry.lines.shift();
    });
    appendServerLog(projectPath, lines);
  };
  child.stdout?.on('data', onOutput);
  child.stderr?.on('data', onOutput);

  let exited = false;
  let spawnError: Error | null = null;
  child.on('error', (error) => {
    spawnError = error;
    exited = true;
    appendServerLog(projectPath, [redact(error.message)]);
  });
  child.on('exit', (code, signal) => {
    exited = true;
    if (entry.stopping || current !== entry) return;
    const exitText = `dct exited (${signal ?? `code ${code ?? 'unknown'}`}).`;
    appendServerLog(projectPath, [`■ ${exitText}`]);
    closeTask(entry.taskId, exitText);
    entry.status = {
      projectPath,
      state: 'crashed',
      lines: entry.lines.slice(-8),
      error: 'dbt Charts stopped.',
    };
    publish(entry.status);
  });

  const deadline = Date.now() + READY_TIMEOUT_MS;
  while (Date.now() < deadline) {
    if (exited || current !== entry || superseded()) break;
    // eslint-disable-next-line no-await-in-loop
    const ready = await isOurServer(entry);
    if (current !== entry || superseded()) break;
    if (ready) {
      entry.status = {
        projectPath,
        state: 'running',
        url: `http://${HOST}:${entry.port}`,
        ...processInfo,
      };
      publish(entry.status);
      return entry.status;
    }
    // eslint-disable-next-line no-await-in-loop
    await sleep(READY_POLL_MS);
  }

  if (superseded()) {
    // Stopped, or replaced by a newer start: that one publishes the status,
    // so this start must not report a crash over it.
    if (!entry.stopping && !hasExited(child)) await stopEntry(entry);
    if (current === entry) current = null;
    closeTask(entry.taskId);
    return pendingServerStatus(projectPath);
  }

  if (current === entry && !exited) {
    await stopEntry(entry);
    current = null;
  }
  let error = `dbt Charts did not start in ${READY_TIMEOUT_MS / 1000} seconds.`;
  if (spawnError) error = redact((spawnError as Error).message);
  else if (exited) error = 'dbt Charts stopped while starting.';
  closeTask(entry.taskId, error);
  const failed: ChartsServerStatus = {
    projectPath,
    state: 'crashed',
    lines: entry.lines.slice(-8),
    error,
  };
  entry.status = failed;
  publish(failed);
  return failed;
};

/**
 * Starts `dct serve` for the project unless it already runs, stopping the
 * server of any other project first. Parallel calls for the same project
 * share one start; a start for another project supersedes this one.
 */
export const ensureServer = async (
  options: StartServerOptions,
): Promise<ChartsServerStatus> => {
  const { projectPath } = options;
  if (starting && starting.projectPath === projectPath) {
    return starting.promise;
  }
  if (
    current &&
    current.projectPath === projectPath &&
    current.status.state === 'running'
  ) {
    return current.status;
  }

  // Claim the start before anything awaits: a second call joins it, and an
  // older start (another project, or one still waiting for a port) gives up.
  generation += 1;
  const gen = generation;
  const run = async (): Promise<ChartsServerStatus> => {
    if (current) {
      lastStop = stopCurrent();
      await lastStop;
    }
    if (gen !== generation) return pendingServerStatus(projectPath);
    return launch(options, gen);
  };
  const promise = run().finally(() => {
    if (starting?.promise === promise) starting = null;
  });
  starting = { projectPath, promise };
  return promise;
};

let quitHookInstalled = false;

/**
 * Stops the server when Studio quits, without touching main.ts: the app's
 * own before-quit handler waits for its cleanup before app.exit(), and this
 * listener sends SIGTERM at the same moment. `exit` is the last resort.
 */
export const installServerQuitHook = () => {
  if (quitHookInstalled) return;
  quitHookInstalled = true;
  app.on('before-quit', () => {
    stopServer().catch(() => undefined);
  });
  process.once('exit', () => {
    liveChildren.forEach((child) => {
      if (hasExited(child)) return;
      try {
        if (process.platform === 'win32' && child.pid) {
          execFileSync('taskkill', ['/pid', String(child.pid), '/T', '/F'], {
            windowsHide: true,
          });
        } else {
          child.kill('SIGKILL');
        }
      } catch {
        // Already gone.
      }
    });
  });
};
