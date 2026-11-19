import path from 'path';
import {
  resolveVenvPython,
  runProcess,
  stripControlSequences,
} from '../../../../src/main/utils/pythonEnv';
import { INSTALL_CANCELLED_MESSAGE } from '../../../../src/shared/installTasks';

// Real child processes: Node itself stands in for python / pip / dct / dbt.
const node = process.execPath;
const script = (source: string) => ['-e', source];

const withPlatform = (platform: typeof process.platform, run: () => void) => {
  const original = Object.getOwnPropertyDescriptor(process, 'platform')!;
  Object.defineProperty(process, 'platform', { value: platform });
  try {
    run();
  } finally {
    Object.defineProperty(process, 'platform', original);
  }
};

describe('resolveVenvPython', () => {
  it('uses Scripts\\python.exe on Windows', () => {
    withPlatform('win32', () => {
      expect(resolveVenvPython('/x/venv')).toBe(
        path.join('/x/venv', 'Scripts', 'python.exe'),
      );
    });
  });

  it('uses bin/python3 elsewhere', () => {
    withPlatform('darwin', () => {
      expect(resolveVenvPython('/x/venv')).toBe(
        path.join('/x/venv', 'bin', 'python3'),
      );
    });
  });
});

describe('stripControlSequences', () => {
  it('strips ANSI and progress-bar noise from pip output', () => {
    const raw =
      '\u001b[2K\u001b[38;2;249;38;114m━━━━━━━━\u001b[0m 1.2/3.4 MB \u001b[31m1.0 MB/s\u001b[0m';
    expect(stripControlSequences(raw).trim()).toBe('1.2/3.4 MB 1.0 MB/s');
    expect(stripControlSequences('Collecting pyspark')).toBe(
      'Collecting pyspark',
    );
  });
});

describe('runProcess', () => {
  it('returns the exit code and the full stdout and stderr', async () => {
    const result = await runProcess(
      node,
      script(
        'process.stdout.write("out\\n"); process.stderr.write("err\\n"); process.exit(3)',
      ),
    );
    expect(result).toEqual({ code: 3, stdout: 'out\n', stderr: 'err\n' });
  });

  it('streams cleaned, non-empty lines from both streams to onLine', async () => {
    const lines: string[] = [];
    await runProcess(
      node,
      script(
        'process.stdout.write("\\u001b[31mred\\u001b[0m\\r\\nnext\\rlast\\n\\n");' +
          'process.stderr.write("  warn  \\n")',
      ),
      { onLine: (line) => lines.push(line) },
    );
    expect(lines).toEqual(
      expect.arrayContaining(['red', 'next', 'last', 'warn']),
    );
    expect(lines).not.toContain('');
  });

  it('adds options.env on top of the parent environment', async () => {
    const result = await runProcess(
      node,
      script(
        'process.stdout.write(JSON.stringify([process.env.DCT_TEST_VALUE, !!process.env.PATH]))',
      ),
      { env: { DCT_TEST_VALUE: 'hello' } },
    );
    expect(JSON.parse(result.stdout)).toEqual(['hello', true]);
  });

  it('runs in options.cwd', async () => {
    const cwd = path.resolve(__dirname);
    const result = await runProcess(
      node,
      script('process.stdout.write(process.cwd())'),
      { cwd },
    );
    expect(result.stdout).toBe(cwd);
  });

  it('kills the process and rejects on timeout', async () => {
    await expect(
      runProcess(node, script('setTimeout(() => {}, 30000)'), {
        timeoutMs: 200,
      }),
    ).rejects.toThrow(/Process timed out after 0s/);
  });

  it('kills the process and rejects with the cancel message on abort', async () => {
    const controller = new AbortController();
    const pending = runProcess(node, script('setTimeout(() => {}, 30000)'), {
      signal: controller.signal,
    });
    setTimeout(() => controller.abort(), 50);
    await expect(pending).rejects.toThrow(INSTALL_CANCELLED_MESSAGE);
  });

  it('rejects at once when the signal is already aborted', async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(
      runProcess(node, script('setTimeout(() => {}, 30000)'), {
        signal: controller.signal,
      }),
    ).rejects.toThrow(INSTALL_CANCELLED_MESSAGE);
  });

  it('rejects when the command cannot be started', async () => {
    await expect(
      runProcess(path.join(__dirname, 'no-such-binary'), []),
    ).rejects.toThrow(/ENOENT/);
  });
});
