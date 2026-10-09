import {
  PYTHON_RUN_ALLOW_SCOPE,
  classifyAgentRun,
  createPythonNotebookTools,
  findShellCommands,
} from '../../../../../src/main/services/ai/tools/studio/pythonNotebook.tools';
import type { PythonNotebookToolDeps } from '../../../../../src/main/services/ai/tools/studio/pythonNotebook.tools';
import { TerminalConfirmGate } from '../../../../../src/main/services/ai/tools/terminalConfirmGate';
import type { AgentCellSource } from '../../../../../src/types/pythonNotebooks';

// The real deps are never built here: every test passes fakes.
jest.mock('../../../../../src/main/services/agent.service', () => ({
  __esModule: true,
  default: { getAgentContext: jest.fn(), requestPythonNotebook: jest.fn() },
}));
jest.mock('../../../../../src/main/services/notebookEnv.service', () => ({
  __esModule: true,
  default: {},
}));
jest.mock('../../../../../src/main/services/notebookKernel.service', () => ({
  __esModule: true,
  default: {},
}));
jest.mock('../../../../../src/main/services/connectors.service', () => ({
  __esModule: true,
  default: {},
}));
jest.mock(
  '../../../../../src/main/services/ai/agentEditorBridge.service',
  () => ({ AgentEditorBridgeService: {} }),
);

const source = (overrides: Partial<AgentCellSource> = {}): AgentCellSource => ({
  cellId: 'c3',
  index: 3,
  type: 'code',
  source: 'df.plot()',
  notebookName: 'Revenue analysis',
  ...overrides,
});

/** A promise that never settles: a cell still running. */
const neverSettles = () =>
  new Promise<never>(() => {
    // never settles
  });

const runResult = (overrides: Record<string, unknown> = {}) => ({
  cellId: 'c3',
  index: 3,
  type: 'code',
  status: 'ok',
  executionCount: 7,
  outputs: [],
  omittedOutputs: 0,
  finished: true,
  ...overrides,
});

function makeDeps() {
  const deps = {
    request: jest.fn(),
    confirm: jest.fn().mockResolvedValue(true),
    notebookId: jest.fn(() => 'nb'),
    kernel: {
      inspect: jest.fn(),
      getStatus: jest.fn(() => ({
        notebookId: 'nb',
        status: 'busy',
        queue: [] as string[],
      })),
      interrupt: jest.fn().mockResolvedValue({}),
    },
    env: { listPackages: jest.fn(), installPackages: jest.fn() },
  };
  return deps;
}

type Deps = ReturnType<typeof makeDeps>;

const tools = (deps: Deps) =>
  createPythonNotebookTools(1, deps as unknown as PythonNotebookToolDeps);

const exec = (toolDef: any, input: unknown, options: object = {}) =>
  toolDef.execute(input, { toolCallId: 't', messages: [], ...options });

/** cell-read returns `cell`; cell-run returns `run`. */
function routeRequests(deps: Deps, cell: AgentCellSource, run: unknown) {
  deps.request.mockImplementation(async (op: string) => {
    if (op === 'cell-read') return cell;
    if (op === 'cell-run') return run;
    if (op === 'state') return { name: 'Revenue analysis' };
    throw new Error(`unexpected op ${op}`);
  });
}

describe('findShellCommands', () => {
  it('finds shell escapes, magics and get_ipython().system', () => {
    const lines = findShellCommands(
      [
        '!pip install pandas',
        'if ok:',
        '    !ls -la',
        'files = !ls',
        '%pip install plotly',
        '%%bash',
        'get_ipython().system("rm -rf x")',
        'out = get_ipython().getoutput("ls")',
        '%run other.py',
      ].join('\n'),
    );
    expect(lines).toEqual([
      '!pip install pandas',
      '!ls -la',
      'files = !ls',
      '%pip install plotly',
      '%%bash',
      'get_ipython().system("rm -rf x")',
      'out = get_ipython().getoutput("ls")',
      '%run other.py',
    ]);
  });

  it('has no false positives on != and ordinary magics', () => {
    expect(
      findShellCommands(
        [
          'if a != b:',
          'x = a != b',
          '# !not a command',
          '%matplotlib inline',
          '%%time',
          'print("done")',
        ].join('\n'),
      ),
    ).toEqual([]);
  });
});

describe('classifyAgentRun', () => {
  it('maps each cell kind to its approval rule', () => {
    expect(classifyAgentRun({ type: 'markdown', source: '# x' }).ask).toBe(
      'never',
    );
    expect(classifyAgentRun({ type: 'sql', source: 'SELECT 1' })).toMatchObject(
      { ask: 'never', reason: 'read-only-sql' },
    );
    expect(
      classifyAgentRun({ type: 'sql', source: 'DELETE FROM orders' }),
    ).toMatchObject({ ask: 'always', reason: 'mutation-sql' });
    expect(classifyAgentRun({ type: 'code', source: 'x = 1' })).toMatchObject({
      ask: 'once-per-chat',
      reason: 'python',
    });
    expect(
      classifyAgentRun({ type: 'code', source: 'x = 1\n!ls' }),
    ).toMatchObject({ ask: 'always', reason: 'shell', shellLines: ['!ls'] });
  });
});

describe('notebooks_cell_run', () => {
  it('asks once per chat for Python and runs the approved source', async () => {
    const deps = makeDeps();
    routeRequests(deps, source(), runResult());
    const result = await exec(tools(deps).notebooks_cell_run, {
      cellId: 'c3',
      waitSeconds: 30,
    });
    expect(deps.confirm).toHaveBeenCalledWith(
      expect.objectContaining({
        toolName: 'notebooks_cell_run',
        cwd: 'notebook:Revenue analysis',
        allowScope: PYTHON_RUN_ALLOW_SCOPE,
        command: expect.stringContaining(
          'Run Python cell 3 in "Revenue analysis":',
        ),
      }),
    );
    expect(deps.request).toHaveBeenCalledWith(
      'cell-run',
      { cellId: 'c3', expectedSource: 'df.plot()', waitMs: 30_000 },
      45_000,
    );
    expect(result).toMatchObject({ ok: true, data: { finished: true } });
  });

  it('stops when the user denies the run', async () => {
    const deps = makeDeps();
    deps.confirm.mockResolvedValue(false);
    routeRequests(deps, source(), runResult());
    const result = await exec(tools(deps).notebooks_cell_run, { cellId: 'c3' });
    expect(result).toMatchObject({
      ok: false,
      error: 'The user denied running this cell.',
      meta: { requiresApproval: true },
    });
    expect(deps.request).not.toHaveBeenCalledWith(
      'cell-run',
      expect.anything(),
      expect.anything(),
    );
  });

  it('runs read-only SQL without asking', async () => {
    const deps = makeDeps();
    routeRequests(
      deps,
      source({ type: 'sql', source: 'SELECT * FROM orders' }),
      runResult({ type: 'sql' }),
    );
    await exec(tools(deps).notebooks_cell_run, { cellId: 'c3' });
    expect(deps.confirm).not.toHaveBeenCalled();
  });

  it('asks every time for shell commands, listing them, with no per-chat option', async () => {
    const deps = makeDeps();
    routeRequests(
      deps,
      source({ source: 'import os\n!rm -rf data' }),
      runResult(),
    );
    await exec(tools(deps).notebooks_cell_run, { cellId: 'c3' });
    const [{ allowScope, command }] = deps.confirm.mock.calls[0];
    expect(allowScope).toBeUndefined();
    expect(command).toContain('It runs shell commands:\n!rm -rf data');
  });

  it('asks every time for SQL that changes data', async () => {
    const deps = makeDeps();
    routeRequests(
      deps,
      source({ type: 'sql', source: 'UPDATE orders SET x = 1' }),
      runResult(),
    );
    await exec(tools(deps).notebooks_cell_run, { cellId: 'c3' });
    expect(deps.confirm).toHaveBeenCalledWith(
      expect.objectContaining({
        allowScope: undefined,
        command: expect.stringContaining('It modifies your database'),
      }),
    );
  });

  it('has nothing to run for Markdown', async () => {
    const deps = makeDeps();
    routeRequests(deps, source({ type: 'markdown', source: '# Notes' }), null);
    const result = await exec(tools(deps).notebooks_cell_run, { cellId: 'c3' });
    expect(result.data.message).toBe('Markdown cells have nothing to run.');
    expect(deps.confirm).not.toHaveBeenCalled();
  });

  it('reports a blocked run as a failure', async () => {
    const deps = makeDeps();
    routeRequests(
      deps,
      source({ type: 'sql', source: 'SELECT 1' }),
      runResult({
        finished: false,
        blocked: 'The environment is still being created.',
      }),
    );
    const result = await exec(tools(deps).notebooks_cell_run, { cellId: 'c3' });
    expect(result).toMatchObject({
      ok: false,
      error: 'The environment is still being created.',
    });
  });

  it('tells the agent to check later when the cell is still running', async () => {
    const deps = makeDeps();
    routeRequests(
      deps,
      source({ type: 'sql', source: 'SELECT 1' }),
      runResult({ finished: false, status: 'running' }),
    );
    const result = await exec(tools(deps).notebooks_cell_run, { cellId: 'c3' });
    expect(result.data.note).toContain('notebooks_cell_result');
  });

  it('interrupts the kernel on abort when this cell is running', async () => {
    const deps = makeDeps();
    deps.kernel.getStatus.mockReturnValue({
      notebookId: 'nb',
      status: 'busy',
      queue: ['c3', 'other'],
    });
    routeRequests(deps, source({ type: 'sql', source: 'SELECT 1' }), null);
    deps.request.mockImplementation(async (op: string) =>
      op === 'cell-read'
        ? source({ type: 'sql', source: 'SELECT 1' })
        : neverSettles(),
    );
    const controller = new AbortController();
    const pending = exec(
      tools(deps).notebooks_cell_run,
      { cellId: 'c3' },
      { abortSignal: controller.signal },
    );
    await new Promise((resolve) => {
      setTimeout(resolve, 0);
    });
    // Stopping the chat clears the agent context before the abort lands.
    deps.notebookId.mockReturnValue(null as unknown as string);
    controller.abort();
    const result = await pending;
    expect(deps.kernel.interrupt).toHaveBeenCalledWith('nb');
    expect(result.error).toBe('Stopped. The cell was interrupted.');
  });

  it('does not interrupt another cell on abort', async () => {
    const deps = makeDeps();
    deps.kernel.getStatus.mockReturnValue({
      notebookId: 'nb',
      status: 'busy',
      queue: ['other', 'c3'],
    });
    deps.request.mockImplementation(async (op: string) =>
      op === 'cell-read'
        ? source({ type: 'sql', source: 'SELECT 1' })
        : neverSettles(),
    );
    const controller = new AbortController();
    const pending = exec(
      tools(deps).notebooks_cell_run,
      { cellId: 'c3' },
      { abortSignal: controller.signal },
    );
    await new Promise((resolve) => {
      setTimeout(resolve, 0);
    });
    controller.abort();
    const result = await pending;
    expect(deps.kernel.interrupt).not.toHaveBeenCalled();
    expect(result.error).toBe('Stopped waiting for the cell.');
  });
});

describe('notebooks_variables', () => {
  it('reports a stopped kernel without starting one', async () => {
    const deps = makeDeps();
    deps.kernel.inspect.mockResolvedValue({ kernelRunning: false });
    const result = await exec(tools(deps).notebooks_variables, {});
    expect(deps.kernel.inspect).toHaveBeenCalledWith('nb', undefined);
    expect(result).toMatchObject({ ok: true, data: { kernelRunning: false } });
  });

  it('returns one variable in detail', async () => {
    const deps = makeDeps();
    deps.kernel.inspect.mockResolvedValue({
      kernelRunning: true,
      data: { name: 'df', type: 'DataFrame', rows: 3, cols: 2 },
    });
    const result = await exec(tools(deps).notebooks_variables, { name: 'df' });
    expect(result.data).toMatchObject({
      kernelRunning: true,
      name: 'df',
      rows: 3,
    });
  });

  it('fails for an unknown name and for a busy kernel', async () => {
    const deps = makeDeps();
    deps.kernel.inspect.mockResolvedValueOnce({
      kernelRunning: true,
      data: { error: "No variable named 'zz'" },
    });
    expect(
      await exec(tools(deps).notebooks_variables, { name: 'zz' }),
    ).toMatchObject({ ok: false, error: "No variable named 'zz'" });

    deps.kernel.inspect.mockResolvedValueOnce({
      kernelRunning: true,
      busy: true,
      error: 'The kernel is busy running a cell. Try again when it finishes.',
    });
    expect(await exec(tools(deps).notebooks_variables, {})).toMatchObject({
      ok: false,
      error: expect.stringContaining('busy'),
    });
  });
});

describe('notebooks_packages_install', () => {
  it('always asks, with no per-chat option, then installs', async () => {
    const deps = makeDeps();
    routeRequests(deps, source(), null);
    deps.env.installPackages.mockResolvedValue(`${'x'.repeat(2000)}Done`);
    const result = await exec(tools(deps).notebooks_packages_install, {
      packages: ['pandas', 'plotly>=5'],
    });
    expect(deps.confirm).toHaveBeenCalledWith({
      toolName: 'notebooks_packages_install',
      command: 'pip install pandas plotly>=5',
      cwd: 'notebook env: Revenue analysis',
    });
    expect(deps.env.installPackages).toHaveBeenCalledWith('nb', [
      'pandas',
      'plotly>=5',
    ]);
    expect(result.data.logTail).toHaveLength(1500);
    expect(result.data.logTail.endsWith('Done')).toBe(true);
  });

  it('does not install when denied, and passes service errors through', async () => {
    const deps = makeDeps();
    routeRequests(deps, source(), null);
    deps.confirm.mockResolvedValueOnce(false);
    const denied = await exec(tools(deps).notebooks_packages_install, {
      packages: ['pandas'],
    });
    expect(denied).toMatchObject({
      ok: false,
      meta: { requiresApproval: true },
    });
    expect(deps.env.installPackages).not.toHaveBeenCalled();

    deps.env.installPackages.mockRejectedValueOnce(
      new Error('The notebook environment is still being created.'),
    );
    const failed = await exec(tools(deps).notebooks_packages_install, {
      packages: ['pandas'],
    });
    expect(failed).toMatchObject({
      ok: false,
      error: 'The notebook environment is still being created.',
    });
  });
});

describe('notebooks_cell_update', () => {
  it('needs at least one change', async () => {
    const deps = makeDeps();
    const result = await exec(tools(deps).notebooks_cell_update, {
      cellId: 'c3',
    });
    expect(result.ok).toBe(false);
    expect(deps.request).not.toHaveBeenCalled();
  });
});

describe('TerminalConfirmGate grants', () => {
  const sent: any[] = [];
  const event = {
    send: (_channel: string, payload: any) => sent.push(payload),
  };

  const ask = (conversationId: number, allowScope?: string) =>
    TerminalConfirmGate.request({
      event: event as any,
      conversationId,
      toolName: 'notebooks_cell_run',
      command: 'Run Python cell 1',
      cwd: 'notebook:x',
      allowScope,
    });

  beforeEach(() => {
    sent.length = 0;
    TerminalConfirmGate.abortAll();
  });

  it('skips the prompt once the scope is allowed for the chat', async () => {
    const first = ask(1, 'notebook-python');
    expect(sent[0].allowScope).toBe('notebook-python');
    TerminalConfirmGate.resolve(sent[0].requestId, true, true);
    await expect(first).resolves.toBe(true);

    await expect(ask(1, 'notebook-python')).resolves.toBe(true);
    expect(sent).toHaveLength(1);
  });

  it('grants nothing for remember without a scope, or for a plain allow', async () => {
    const noScope = ask(1);
    TerminalConfirmGate.resolve(sent[0].requestId, true, true);
    await noScope;
    const plain = ask(1, 'notebook-python');
    TerminalConfirmGate.resolve(sent[1].requestId, true);
    await plain;

    ask(1, 'notebook-python');
    expect(sent).toHaveLength(3);
  });

  it('keeps grants per conversation and clears them', async () => {
    const first = ask(1, 'notebook-python');
    TerminalConfirmGate.resolve(sent[0].requestId, true, true);
    await first;

    ask(2, 'notebook-python');
    expect(sent).toHaveLength(2);

    TerminalConfirmGate.clearGrants(1);
    ask(1, 'notebook-python');
    expect(sent).toHaveLength(3);
  });
});
