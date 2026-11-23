import path from 'path';
import { spawn } from 'child_process';
import { INSTALL_CANCELLED_MESSAGE } from '../../shared/installTasks';

// Shared Python environment helpers: run a child process (python, pip, dct,
// dbt) and find the interpreter inside a venv. Nothing here is specific to
// one feature.
//
// Used by dbt Charts. notebookEnv.service.ts still has its own copies of
// these; a separate PR moves Notebooks onto this file.

// Default timeout: long enough for a big pip install.
const DEFAULT_TIMEOUT_MS = 15 * 60 * 1000;

// ANSI CSI / OSC sequences (colours, cursor moves, "erase line") plus the
// box-drawing characters pip's rich progress bar paints with.
const CONTROL_SEQUENCE_PATTERN =
  // eslint-disable-next-line no-control-regex
  /\u001b\[[0-9;?]*[ -/]*[@-~]|\u001b\][^\u0007]*\u0007|[─-╿]/g;

export function stripControlSequences(text: string): string {
  return text.replace(CONTROL_SEQUENCE_PATTERN, '');
}

export interface RunProcessResult {
  code: number | null;
  stdout: string;
  stderr: string;
}

export function runProcess(
  command: string,
  args: string[],
  options: {
    cwd?: string;
    env?: Record<string, string | undefined>;
    timeoutMs?: number;
    onLine?: (line: string) => void;
    // Aborting stops the process (used to stop an install while it is
    // still downloading).
    signal?: AbortSignal;
  } = {},
): Promise<RunProcessResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      env: { ...process.env, ...options.env },
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
      shell: false,
    });

    let stdout = '';
    let stderr = '';
    let settled = false;

    const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      child.kill('SIGKILL');
      reject(
        new Error(
          `Process timed out after ${Math.round(timeoutMs / 1000)}s: ${command} ${args.join(' ')}`,
        ),
      );
    }, timeoutMs);

    if (options.signal) {
      const stopProcess = () => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        child.kill('SIGKILL');
        reject(new Error(INSTALL_CANCELLED_MESSAGE));
      };
      if (options.signal.aborted) stopProcess();
      else
        options.signal.addEventListener('abort', stopProcess, { once: true });
    }

    const forward = (chunk: Buffer) => {
      if (!options.onLine) return;
      chunk
        .toString()
        .split(/\r?\n|\r/)
        .map((line) => stripControlSequences(line).trim())
        .filter(Boolean)
        .forEach((line) => options.onLine?.(line));
    };

    child.stdout?.on('data', (chunk: Buffer) => {
      stdout += chunk.toString();
      forward(chunk);
    });
    child.stderr?.on('data', (chunk: Buffer) => {
      stderr += chunk.toString();
      forward(chunk);
    });
    child.on('error', (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(error);
    });
    child.on('close', (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({ code, stdout, stderr });
    });
  });
}

/** The interpreter inside a venv: Scripts\python.exe on Windows, bin/python3 elsewhere. */
export function resolveVenvPython(venvDir: string): string {
  return process.platform === 'win32'
    ? path.join(venvDir, 'Scripts', 'python.exe')
    : path.join(venvDir, 'bin', 'python3');
}
