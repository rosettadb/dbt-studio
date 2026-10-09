/**
 * NotebookKernelService.inspect: silent variable inspection for the
 * Notebooks agent. The kernel bridge process is a fake that speaks the
 * bridge's JSON-lines protocol.
 */

import { EventEmitter } from 'events';
import { PassThrough } from 'stream';
import { spawn } from 'child_process';
import NotebookKernelService from '../../../../src/main/services/notebookKernel.service';

jest.mock('child_process', () => ({ spawn: jest.fn() }));
jest.mock('fs-extra', () => ({
  __esModule: true,
  default: {
    existsSync: () => true,
    pathExists: async () => true,
    mkdirp: async () => undefined,
  },
}));
jest.mock('../../../../src/main/utils/rendererBroadcast', () => ({
  broadcastToRenderers: jest.fn(),
}));
jest.mock('../../../../src/main/services/notebookEnv.service', () => ({
  __esModule: true,
  default: {
    getStatus: jest.fn(async () => ({ status: 'ready', venvPath: '/venv' })),
    getVenvPython: () => '/venv/bin/python',
    getWorkDir: () => '/work',
  },
}));

const spawnMock = spawn as jest.MockedFunction<typeof spawn>;

interface FakeKernel {
  commands: any[];
  emit: (event: object) => void;
}

/** Starts a kernel for `notebookId` and returns its fake bridge process. */
async function startKernel(notebookId: string): Promise<FakeKernel> {
  const stdout = new PassThrough();
  const child = new EventEmitter() as any;
  const commands: any[] = [];
  child.stdout = stdout;
  child.stderr = new EventEmitter();
  child.stdin = {
    destroyed: false,
    write: (line: string) => {
      commands.push(JSON.parse(line));
      return true;
    },
    end: jest.fn(),
  };
  child.kill = jest.fn();
  spawnMock.mockReturnValueOnce(child);
  const emit = (event: object) => stdout.write(`${JSON.stringify(event)}\n`);
  const started = NotebookKernelService.start(notebookId);
  // Let spawnKernel reach the readline listener before the kernel is ready.
  await new Promise((resolve) => {
    setTimeout(resolve, 0);
  });
  emit({ type: 'ready', kernel_info: {} });
  await started;
  return { commands, emit };
}

const flush = () =>
  new Promise((resolve) => {
    setTimeout(resolve, 0);
  });

describe('NotebookKernelService.inspect', () => {
  it('reports no kernel without starting one', async () => {
    await expect(
      NotebookKernelService.inspect('never-started'),
    ).resolves.toEqual({ kernelRunning: false });
    expect(spawnMock).not.toHaveBeenCalled();
  });

  it('sends an inspect op and resolves with its result', async () => {
    const kernel = await startKernel('nb-1');
    const pending = NotebookKernelService.inspect('nb-1', 'df');
    const command = kernel.commands.find((c) => c.op === 'inspect');
    expect(command).toMatchObject({ op: 'inspect', name: 'df' });
    kernel.emit({
      type: 'inspect_result',
      id: command.id,
      ok: true,
      data: { name: 'df', rows: 3 },
    });
    await expect(pending).resolves.toEqual({
      kernelRunning: true,
      data: { name: 'df', rows: 3 },
    });
  });

  it('lists all variables when no name is given, and reports errors', async () => {
    const kernel = await startKernel('nb-2');
    const pending = NotebookKernelService.inspect('nb-2');
    const command = kernel.commands.find((c) => c.op === 'inspect');
    expect(command.name).toBeNull();
    kernel.emit({
      type: 'inspect_result',
      id: command.id,
      ok: false,
      ename: 'NameError',
      evalue: "name '_rosetta_inspect' is not defined",
    });
    await expect(pending).resolves.toEqual({
      kernelRunning: true,
      error: "NameError: name '_rosetta_inspect' is not defined",
    });
  });

  it('gives up with "busy" while a cell holds the kernel', async () => {
    const kernel = await startKernel('nb-3');
    jest.useFakeTimers();
    try {
      const pending = NotebookKernelService.inspect('nb-3');
      jest.advanceTimersByTime(10_000);
      await expect(pending).resolves.toMatchObject({
        kernelRunning: true,
        busy: true,
      });
      // A late result is ignored.
      const command = kernel.commands.find((c) => c.op === 'inspect');
      kernel.emit({
        type: 'inspect_result',
        id: command.id,
        ok: true,
        data: {},
      });
    } finally {
      jest.useRealTimers();
    }
    await flush();
  });

  it('resolves pending inspections when the kernel fails', async () => {
    const kernel = await startKernel('nb-4');
    const pending = NotebookKernelService.inspect('nb-4');
    kernel.emit({ type: 'fatal', message: 'boom' });
    await expect(pending).resolves.toEqual({ kernelRunning: false });
    await expect(NotebookKernelService.inspect('nb-4')).resolves.toEqual({
      kernelRunning: false,
    });
  });
});
