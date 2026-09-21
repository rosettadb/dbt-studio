/**
 * Python notebooks are stored as .ipynb; these tests round-trip a notebook
 * through the service on a temp directory and check the nbformat shape plus
 * the studio metadata under `metadata.rosetta`.
 */

import fs from 'fs-extra';
import os from 'os';
import path from 'path';

const tmpUserData = fs.mkdtempSync(path.join(os.tmpdir(), 'rosetta-pynb-'));

jest.mock('electron', () => ({
  app: { getPath: () => tmpUserData },
  dialog: { showOpenDialog: jest.fn(), showSaveDialog: jest.fn() },
  BrowserWindow: { getAllWindows: () => [] },
}));

// The SQL notebook service drags in the connectors stack; only its two path
// helpers are needed here, so replicate them against the temp userData dir.
jest.mock('../../../../src/main/services/notebooks.service', () => ({
  normalizeConnectionKey: (connectionId: string) =>
    connectionId.startsWith('ducklake-')
      ? `ducklake:${connectionId.replace('ducklake-', '')}`
      : `db:${connectionId}`,
  getConnectionDir: (connectionKey: string) =>
    // eslint-disable-next-line global-require
    require('path').join(tmpUserData, 'notebooks', connectionKey),
}));

jest.mock('../../../../src/main/services/notebookEnv.service', () => ({
  __esModule: true,
  default: {
    getVenvDir: (id: string) => `/venvs/${id}`,
    getStatus: jest.fn(async (_id: string, fallback: string) => ({
      pythonVersion: fallback,
      venvPath: '/venvs/x',
      status: 'ready',
    })),
    createEnv: jest.fn(async () => ({ status: 'ready' })),
    deleteEnv: jest.fn(async () => undefined),
    freeze: jest.fn(async () => ['pandas==2.2.0']),
    installPackages: jest.fn(async () => ''),
  },
}));

jest.mock('../../../../src/main/services/notebookKernel.service', () => ({
  __esModule: true,
  default: {
    shutdown: jest.fn(async () => undefined),
    execute: jest.fn(async (_nb: string, cellId: string) => ({
      cellId,
      status: 'ok',
      execution_count: 7,
      outputs: [
        { output_type: 'stream', name: 'stdout', text: 'a\n' },
        { output_type: 'stream', name: 'stdout', text: 'b\n' },
        {
          output_type: 'execute_result',
          execution_count: 7,
          data: { 'text/plain': '42' },
          metadata: {},
        },
      ],
    })),
  },
}));

describe('PythonNotebooksService', () => {
  const connectionId = 'conn-abc';

  afterAll(async () => {
    await fs.remove(tmpUserData);
  });

  const load = async () =>
    (await import('../../../../src/main/services/pythonNotebooks.service'))
      .default;

  it('creates an nbformat 4 file with studio metadata and kicks off env creation', async () => {
    const service = await load();
    const envService = (
      await import('../../../../src/main/services/notebookEnv.service')
    ).default;

    const created = await service.createNotebook(connectionId, {
      name: 'Analysis',
      description: 'desc',
      pythonVersion: '3.10.17',
    });

    expect(created.kind).toBe('python');
    expect(created.cells).toHaveLength(1);
    expect(created.runtime.status).toBe('creating');
    expect(envService.createEnv).toHaveBeenCalledWith(created.id, '3.10.17');

    const filePath = path.join(
      tmpUserData,
      'notebooks',
      `db:${connectionId}`,
      `${created.id}.ipynb`,
    );
    const raw = await fs.readJson(filePath);
    expect(raw.nbformat).toBe(4);
    expect(raw.nbformat_minor).toBe(5);
    expect(raw.metadata.kernelspec.language).toBe('python');
    expect(raw.metadata.language_info.version).toBe('3.10.17');
    expect(raw.metadata.rosetta).toMatchObject({
      id: created.id,
      kind: 'python',
      name: 'Analysis',
      description: 'desc',
      runtime: { pythonVersion: '3.10.17' },
    });
    expect(raw.cells[0]).toMatchObject({
      cell_type: 'code',
      source: [],
      outputs: [],
      execution_count: null,
    });
  });

  it('lists only .ipynb files and ignores SQL notebook json files', async () => {
    const service = await load();
    const dir = path.join(tmpUserData, 'notebooks', `db:${connectionId}`);
    await fs.writeJson(path.join(dir, 'sql-one.json'), {
      id: 'sql-one',
      name: 'SQL',
      cells: [],
    });

    const list = await service.listNotebooks(connectionId);
    expect(list.length).toBeGreaterThan(0);
    expect(list.every((n) => n.kind === 'python')).toBe(true);
    expect(list.some((n) => n.id === 'sql-one')).toBe(false);
  });

  it('round-trips cell edits and merges streamed outputs on execute', async () => {
    const service = await load();
    const [notebook] = await service.listNotebooks(connectionId);

    const updated = await service.updateNotebook(connectionId, notebook.id, {
      cells: [
        {
          id: 'cell-a',
          cell_type: 'markdown',
          source: '# Title\nline two',
          outputs: [],
          execution_count: null,
          metadata: {},
        },
        {
          id: 'cell-b',
          cell_type: 'code',
          source: 'print(1)',
          outputs: [],
          execution_count: null,
          metadata: {},
        },
      ],
    });
    expect(updated.cellCount).toBe(2);

    const raw = await fs.readJson(
      path.join(
        tmpUserData,
        'notebooks',
        `db:${connectionId}`,
        `${notebook.id}.ipynb`,
      ),
    );
    // nbformat multiline source with trailing newlines preserved
    expect(raw.cells[0].source).toEqual(['# Title\n', 'line two']);
    expect(raw.cells[0]).not.toHaveProperty('outputs');

    const result = await service.executeCell(
      connectionId,
      notebook.id,
      'cell-b',
      'print(1)',
    );
    expect(result.status).toBe('ok');

    const reloaded = await service.getNotebook(connectionId, notebook.id);
    const codeCell = reloaded!.cells.find((c) => c.id === 'cell-b')!;
    expect(codeCell.execution_count).toBe(7);
    // consecutive stdout chunks are merged into one stream output
    expect(codeCell.outputs).toHaveLength(2);
    expect(codeCell.outputs[0]).toEqual({
      output_type: 'stream',
      name: 'stdout',
      text: 'a\nb\n',
    });
    expect(reloaded!.lastExecutedAt).toBeDefined();
  });

  it('reads foreign ipynb files (string sources, list mime values, missing ids)', async () => {
    const service = await load();
    const foreign = path.join(tmpUserData, 'foreign.ipynb');
    await fs.writeJson(foreign, {
      nbformat: 4,
      nbformat_minor: 4,
      metadata: { kernelspec: { name: 'python3' } },
      cells: [
        { cell_type: 'markdown', source: 'hello', metadata: {} },
        {
          cell_type: 'code',
          source: ['x = 1\n', 'x'],
          metadata: {},
          execution_count: 3,
          outputs: [
            {
              output_type: 'execute_result',
              execution_count: 3,
              data: { 'text/plain': ['1'] },
              metadata: {},
            },
            { output_type: 'stream', name: 'stdout', text: ['a', 'b'] },
          ],
        },
        { cell_type: 'raw', source: 'ignored raw', metadata: {} },
      ],
    });

    const imported = await service.importNotebook(
      connectionId,
      foreign,
      '3.12.10',
    );
    expect(imported.name).toBe('foreign');
    expect(imported.runtime.pythonVersion).toBe('3.12.10');
    expect(imported.cells).toHaveLength(3);
    expect(imported.cells[0].source).toBe('hello');
    expect(imported.cells[1].source).toBe('x = 1\nx');
    expect(imported.cells[1].outputs[0]).toMatchObject({
      output_type: 'execute_result',
      data: { 'text/plain': '1' },
    });
    expect(imported.cells[1].outputs[1]).toMatchObject({
      output_type: 'stream',
      text: 'ab',
    });
    // raw cells are kept as code so no content is lost
    expect(imported.cells[2].cell_type).toBe('code');
    expect(imported.cells.every((c) => /^[A-Za-z0-9_-]+$/.test(c.id))).toBe(
      true,
    );
  });

  it('deletes the file, the kernel and the environment together', async () => {
    const service = await load();
    const envService = (
      await import('../../../../src/main/services/notebookEnv.service')
    ).default;
    const kernelService = (
      await import('../../../../src/main/services/notebookKernel.service')
    ).default;
    const [notebook] = await service.listNotebooks(connectionId);

    await service.deleteNotebook(connectionId, notebook.id);

    expect(kernelService.shutdown).toHaveBeenCalledWith(notebook.id);
    expect(envService.deleteEnv).toHaveBeenCalledWith(notebook.id);
    expect(await service.getNotebook(connectionId, notebook.id)).toBeNull();
  });
});
