import { ChildProcess, spawn } from 'child_process';
import http from 'http';
import net from 'net';
import path from 'path';
import { boardUrlPath } from '../../shared/dbtCharts';
import type {
  DbtChartsServerEvent,
  DbtChartsServerState,
  DbtChartsServerStatus,
} from '../../types/backend';
import { broadcastToRenderers } from './rendererBroadcast';
import { redactSecrets, type ChartsEnv } from './dbtChartsRedact';
import { dlog } from '../../shared/dbtChartsDebug'; // DBT-CHARTS-DEBUG

// A cold first start of dct (Python imports, dbt profile loading) can be slow.
const READY_TIMEOUT_MS = 90_000;
const POLL_INTERVAL_MS = 300;
const KILL_GRACE_MS = 5_000;
const STDERR_TAIL_LINES = 50;

type ServerEntry = {
  state: DbtChartsServerState;
  child: ChildProcess;
  port: number;
  url: string;
  env: ChartsEnv;
  stderr: string[];
  stopping: boolean;
  error?: string;
};

const servers = new Map<string, ServerEntry>();
const pending = new Map<string, Promise<{ url: string; port: number }>>();
// Crash state outlives the entry so the renderer can read it after the exit.
const lastStatus = new Map<string, DbtChartsServerStatus>();

export type StartServerOptions = {
  projectId: string;
  projectPath: string;
  /** Absolute path of the venv's dct executable. */
  dctPath: string;
  env: ChartsEnv;
  readyTimeoutMs?: number;
};

/** Board URL path for a board file: charts/a/b.yml -> /a/b/. */
export function boardUrl(projectPath: string, filePath: string): string {
  const relative = path.isAbsolute(filePath)
    ? path.relative(projectPath, filePath)
    : filePath;
  return boardUrlPath(relative);
}

export function getFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const probe = net.createServer();
    probe.once('error', reject);
    probe.listen(0, '127.0.0.1', () => {
      const address = probe.address();
      const port = typeof address === 'object' && address ? address.port : 0;
      probe.close(() => resolve(port));
    });
  });
}

const checkReady = (port: number): Promise<boolean> =>
  new Promise((resolve) => {
    const req = http.get(`http://127.0.0.1:${port}/`, (res) => {
      res.resume();
      // Any HTTP answer means the server is up. A 5xx is a board/profile
      // problem that dct renders as its own error page in the iframe.
      resolve(res.statusCode !== undefined);
    });
    req.on('error', (err) => {
      dlog(
        'main:server',
        `poll error port=${port}: ${(err as Error & { code?: string }).code ?? err.message}`,
      ); // DBT-CHARTS-DEBUG
      resolve(false);
    });
    req.setTimeout(2000, () => {
      req.destroy();
      resolve(false);
    });
  });

function publish(projectId: string, status: DbtChartsServerStatus) {
  dlog('main:server', `publish status project=${projectId}`, status); // DBT-CHARTS-DEBUG
  lastStatus.set(projectId, status);
  const event: DbtChartsServerEvent = { projectId, ...status };
  broadcastToRenderers('dbt-charts:serverStatus', event);
}

function statusOf(entry: ServerEntry): DbtChartsServerStatus {
  return entry.state === 'running'
    ? { state: 'running', url: entry.url }
    : { state: entry.state, error: entry.error };
}

function collectStderr(entry: ServerEntry, chunk: Buffer) {
  chunk
    .toString()
    .split(/\r?\n/)
    .map((line) => redactSecrets(line, entry.env).trimEnd())
    .filter(Boolean)
    .forEach((line) => {
      dlog('main:server', `dct output [pid ${entry.child.pid}]: ${line}`); // DBT-CHARTS-DEBUG
      entry.stderr.push(line);
      if (entry.stderr.length > STDERR_TAIL_LINES) entry.stderr.shift();
    });
}

export function getServerStatus(projectId: string): DbtChartsServerStatus {
  const entry = servers.get(projectId);
  if (entry) return statusOf(entry);
  return lastStatus.get(projectId) ?? { state: 'stopped' };
}

export function startServer(
  options: StartServerOptions,
): Promise<{ url: string; port: number }> {
  const inFlight = pending.get(options.projectId);
  if (inFlight) return inFlight;
  const running = servers.get(options.projectId);
  if (running?.state === 'running') {
    return Promise.resolve({ url: running.url, port: running.port });
  }

  const ready = (async () => {
    const { projectId, projectPath, dctPath, env } = options;
    const port = await getFreePort();
    const url = `http://127.0.0.1:${port}`;
    dlog('main:server', 'startServer begin', {
      projectId,
      projectPath,
      dctPath,
      port,
      envKeys: Object.keys(env).length,
      DBT_PROFILES_DIR: env.DBT_PROFILES_DIR,
    }); // DBT-CHARTS-DEBUG

    const child = spawn(
      dctPath,
      [
        'serve',
        '--host',
        '127.0.0.1',
        '--port',
        String(port),
        '--project-dir',
        projectPath,
      ],
      {
        cwd: projectPath,
        env,
        detached: false,
        stdio: ['ignore', 'pipe', 'pipe'],
        windowsHide: true,
      },
    );

    dlog(
      'main:server',
      `spawned dct pid=${child.pid} cmd=${dctPath} serve --host 127.0.0.1 --port ${port} --project-dir ${projectPath} cwd=${projectPath}`,
    ); // DBT-CHARTS-DEBUG
    const entry: ServerEntry = {
      state: 'starting',
      child,
      port,
      url,
      env,
      stderr: [],
      stopping: false,
    };

    const failure = new Promise<never>((_resolve, reject) => {
      child.once('error', (err) => {
        dlog('main:server', `child error: ${err.message}`); // DBT-CHARTS-DEBUG
        entry.state = 'crashed';
        entry.error = redactSecrets(err.message, env);
        publish(projectId, statusOf(entry));
        reject(new Error(entry.error));
      });
      child.once('exit', (code, signal) => {
        dlog(
          'main:server',
          `child exit code=${code} signal=${signal} stopping=${entry.stopping}`,
        ); // DBT-CHARTS-DEBUG
        const wasStopping = entry.stopping;
        if (servers.get(projectId) === entry) servers.delete(projectId);
        if (wasStopping) {
          publish(projectId, { state: 'stopped' });
          reject(new Error('dbt Charts server was stopped'));
          return;
        }
        entry.state = 'crashed';
        entry.error =
          entry.stderr.join('\n') ||
          `dct exited unexpectedly (code ${code ?? signal})`;
        // Keep the crashed entry visible through lastStatus only.
        publish(projectId, statusOf(entry));
        reject(new Error(entry.error));
      });
    });
    failure.catch(() => undefined);

    child.stdout?.on('data', (chunk: Buffer) => collectStderr(entry, chunk));
    child.stderr?.on('data', (chunk: Buffer) => collectStderr(entry, chunk));

    servers.set(projectId, entry);
    publish(projectId, { state: 'starting' });

    const waitReady = (async () => {
      const deadline =
        Date.now() + (options.readyTimeoutMs ?? READY_TIMEOUT_MS);
      let attempts = 0; // DBT-CHARTS-DEBUG
      while (Date.now() < deadline) {
        attempts += 1; // DBT-CHARTS-DEBUG
        if (attempts % 10 === 1)
          dlog(
            'main:server',
            `readiness poll #${attempts} port=${port} state=${entry.state} msLeft=${deadline - Date.now()}`,
          ); // DBT-CHARTS-DEBUG
        if (entry.state === 'crashed') throw new Error(entry.error);
        // eslint-disable-next-line no-await-in-loop
        if (await checkReady(port)) {
          dlog('main:server', `ready after ${attempts} polls`); // DBT-CHARTS-DEBUG
          return;
        }
        // eslint-disable-next-line no-await-in-loop
        await new Promise<void>((resolve) => {
          setTimeout(resolve, POLL_INTERVAL_MS);
        });
      }
      dlog(
        'main:server',
        `READY TIMEOUT port=${port} pid=${child.pid} exitCode=${child.exitCode} lines=${entry.stderr.length}`,
      ); // DBT-CHARTS-DEBUG
      const tail = entry.stderr.slice(-15).join('\n');
      throw new Error(
        `Timed out waiting for the dbt Charts server to start${tail ? `:\n${tail}` : ' (no output from dct)'}`,
      );
    })();

    try {
      await Promise.race([waitReady, failure]);
    } catch (error) {
      if (entry.state === 'starting') {
        entry.error = error instanceof Error ? error.message : String(error);
        // eslint-disable-next-line no-use-before-define
        await stopServer(projectId);
        entry.state = 'crashed';
        publish(projectId, statusOf(entry));
      }
      throw error;
    }

    entry.state = 'running';
    publish(projectId, statusOf(entry));
    return { url, port };
  })();

  pending.set(options.projectId, ready);
  const clear = () => {
    if (pending.get(options.projectId) === ready) {
      pending.delete(options.projectId);
    }
  };
  ready.then(clear, clear).catch(() => undefined);
  return ready;
}

export async function stopServer(projectId: string): Promise<void> {
  const entry = servers.get(projectId);
  if (!entry) {
    if (lastStatus.get(projectId)?.state === 'crashed') {
      publish(projectId, { state: 'stopped' });
    }
    return;
  }
  dlog('main:server', `stopServer project=${projectId} pid=${entry.child.pid}`); // DBT-CHARTS-DEBUG
  entry.stopping = true;
  const { child } = entry;
  if (child.exitCode !== null || child.killed) {
    servers.delete(projectId);
    return;
  }
  await new Promise<void>((resolve) => {
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
    }, KILL_GRACE_MS);
    child.once('exit', () => {
      clearTimeout(timer);
      resolve();
    });
    child.kill('SIGTERM');
  });
  servers.delete(projectId);
}

export async function stopAll(): Promise<void> {
  await Promise.all([...servers.keys()].map((id) => stopServer(id)));
}

export async function stopAllExcept(projectId: string): Promise<void> {
  await Promise.all(
    [...servers.keys()]
      .filter((id) => id !== projectId)
      .map((id) => stopServer(id)),
  );
}
