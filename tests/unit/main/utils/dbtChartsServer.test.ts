import { EventEmitter } from 'events';

const broadcast = jest.fn();
jest.mock('../../../../src/main/utils/rendererBroadcast', () => ({
  broadcastToRenderers: (...args: unknown[]) => broadcast(...args),
}));

class FakeChild extends EventEmitter {
  stdout = new EventEmitter();
  stderr = new EventEmitter();
  exitCode: number | null = null;
  killed = false;
  kill = jest.fn((signal?: string) => {
    this.killed = true;
    if (signal === 'SIGTERM') {
      setTimeout(() => this.die(null), 0);
    }
    return true;
  });
  die(code: number | null) {
    this.exitCode = code ?? 0;
    this.emit('exit', code, null);
  }
}

const children: FakeChild[] = [];
jest.mock('child_process', () => ({
  spawn: jest.fn(() => {
    const c = new FakeChild();
    children.push(c);
    return c;
  }),
}));

let httpReady = true;
jest.mock('http', () => ({
  __esModule: true,
  default: {
    get: jest.fn((_url: string, cb: (res: any) => void) => {
      const req = new EventEmitter() as any;
      req.setTimeout = jest.fn();
      req.destroy = jest.fn();
      setTimeout(() => {
        if (httpReady) cb({ statusCode: 200, resume: jest.fn() });
        else req.emit('error', new Error('ECONNREFUSED'));
      }, 0);
      return req;
    }),
  },
}));

import { spawn } from 'child_process';
import {
  getServerStatus,
  startServer,
  stopAll,
  stopAllExcept,
} from '../../../../src/main/utils/dbtChartsServer';

const opts = (projectId: string, extra: Record<string, unknown> = {}) => ({
  projectId,
  projectPath: `/p/${projectId}`,
  dctPath: '/venv/bin/dct',
  env: { 'db-password-x': 'topsecret' },
  ...extra,
});

describe('dbtChartsServer', () => {
  beforeEach(() => {
    httpReady = true;
    children.length = 0;
    broadcast.mockClear();
    (spawn as jest.Mock).mockClear();
  });

  afterEach(async () => {
    await stopAll();
  });

  it('starts dct on a free loopback port and returns the URL once ready', async () => {
    const { url, port } = await startServer(opts('a'));
    expect(port).toBeGreaterThan(0);
    expect(url).toBe(`http://127.0.0.1:${port}`);
    const [cmd, args] = (spawn as jest.Mock).mock.calls[0];
    expect(cmd).toBe('/venv/bin/dct');
    expect(args).toEqual([
      'serve',
      '--host',
      '127.0.0.1',
      '--port',
      String(port),
      '--project-dir',
      '/p/a',
    ]);
    expect(getServerStatus('a')).toEqual({ state: 'running', url });
    const states = broadcast.mock.calls.map((c) => c[1].state);
    expect(states).toEqual(['starting', 'running']);
  });

  it('shares one process between concurrent starts', async () => {
    const [a, b] = await Promise.all([
      startServer(opts('a')),
      startServer(opts('a')),
    ]);
    expect(a).toEqual(b);
    expect(spawn).toHaveBeenCalledTimes(1);
  });

  it('an unexpected exit sets crashed with redacted stderr and broadcasts', async () => {
    await startServer(opts('a'));
    broadcast.mockClear();
    children[0].stderr.emit('data', Buffer.from('boom password=topsecret\n'));
    children[0].die(1);
    const status = getServerStatus('a');
    expect(status.state).toBe('crashed');
    expect(status.error).toContain('boom');
    expect(status.error).not.toContain('topsecret');
    expect(broadcast).toHaveBeenCalledWith(
      'dbt-charts:serverStatus',
      expect.objectContaining({ projectId: 'a', state: 'crashed' }),
    );
  });

  it('can be restarted after a crash', async () => {
    await startServer(opts('a'));
    children[0].die(1);
    await startServer(opts('a'));
    expect(spawn).toHaveBeenCalledTimes(2);
    expect(getServerStatus('a').state).toBe('running');
  });

  it('rejects and stops the process when readiness times out', async () => {
    httpReady = false;
    await expect(
      startServer(opts('a', { readyTimeoutMs: 400 })),
    ).rejects.toThrow(/Timed out/);
    expect(children[0].kill).toHaveBeenCalledWith('SIGTERM');
    expect(getServerStatus('a').state).toBe('crashed');
  });

  it('stopAll stops every process', async () => {
    await startServer(opts('a'));
    await startServer(opts('b'));
    await stopAll();
    children.forEach((c) => expect(c.kill).toHaveBeenCalledWith('SIGTERM'));
    expect(getServerStatus('a').state).toBe('stopped');
    expect(getServerStatus('b').state).toBe('stopped');
  });

  it('stopAllExcept keeps only the given project', async () => {
    await startServer(opts('a'));
    await startServer(opts('b'));
    await stopAllExcept('b');
    expect(getServerStatus('a').state).toBe('stopped');
    expect(getServerStatus('b').state).toBe('running');
  });
});
