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

// SQL cells run queries through the connectors / DuckLake services; neither
// stack is needed here beyond the query entry points.
const executeQueryForConnection = jest.fn();
const duckLakeExecuteQuery = jest.fn();
jest.mock('../../../../src/main/services/connectors.service', () => ({
  __esModule: true,
  default: {
    executeQueryForConnection: (...args: unknown[]) =>
      executeQueryForConnection(...args),
  },
}));
jest.mock('../../../../src/main/services/duckLake.service', () => ({
  __esModule: true,
  default: {
    executeQuery: (...args: unknown[]) => duckLakeExecuteQuery(...args),
  },
}));

// Only the recommended interpreter version is needed from the settings stack.
jest.mock('../../../../src/main/services/settings.service', () => ({
  RECOMMENDED_PYTHON_VERSION: '3.10.17',
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

  it('stores SQL cells as %%sql code cells and reads them back (incl. JupySQL files)', async () => {
    const service = await load();
    const [notebook] = await service.listNotebooks(connectionId);

    await service.updateNotebook(connectionId, notebook.id, {
      cells: [
        {
          id: 'cell-sql',
          cell_type: 'sql',
          source: 'select 1 as n',
          outputs: [],
          execution_count: null,
          metadata: { rosetta: { language: 'sql', variable: 'orders' } },
        },
      ],
    });

    const raw = await fs.readJson(
      path.join(
        tmpUserData,
        'notebooks',
        `db:${connectionId}`,
        `${notebook.id}.ipynb`,
      ),
    );
    // Valid nbformat: a code cell carrying the JupySQL magic + studio flag
    expect(raw.cells[0]).toMatchObject({
      cell_type: 'code',
      source: ['%%sql orders <<\n', 'select 1 as n'],
      metadata: { rosetta: { language: 'sql', variable: 'orders' } },
      outputs: [],
    });

    const reloaded = await service.getNotebook(connectionId, notebook.id);
    expect(reloaded!.cells[0]).toMatchObject({
      cell_type: 'sql',
      source: 'select 1 as n',
      metadata: { rosetta: { language: 'sql', variable: 'orders' } },
    });

    // A notebook written by JupySQL (no studio metadata) imports as SQL cells
    const foreign = path.join(tmpUserData, 'jupysql.ipynb');
    await fs.writeJson(foreign, {
      nbformat: 4,
      nbformat_minor: 5,
      metadata: {},
      cells: [
        {
          cell_type: 'code',
          source: ['%%sql\n', 'select 2'],
          metadata: {},
          outputs: [],
          execution_count: null,
        },
        {
          cell_type: 'code',
          source: '%%sql result <<\nselect 3',
          metadata: {},
          outputs: [],
          execution_count: null,
        },
        {
          cell_type: 'code',
          source: 'x = 1',
          metadata: {},
          outputs: [],
          execution_count: null,
        },
      ],
    });
    const imported = await service.importNotebook(
      connectionId,
      foreign,
      '3.12.10',
    );
    expect(imported.cells.map((c) => c.cell_type)).toEqual([
      'sql',
      'sql',
      'code',
    ]);
    expect(imported.cells[0].source).toBe('select 2');
    expect(imported.cells[0].metadata.rosetta?.variable).toBe('df');
    expect(imported.cells[1].source).toBe('select 3');
    expect(imported.cells[1].metadata.rosetta?.variable).toBe('result');
  });

  it('runs SQL cells on the connection and hands the rows to the kernel', async () => {
    const service = await load();
    const kernelService = (
      await import('../../../../src/main/services/notebookKernel.service')
    ).default;
    const [notebook] = await service.listNotebooks(connectionId);
    (kernelService.execute as jest.Mock).mockClear();

    executeQueryForConnection.mockResolvedValueOnce({
      success: true,
      fields: [{ name: 'id' }, { name: 'when' }, { name: 'big' }],
      data: [
        {
          id: 1,
          when: new Date('2026-01-02T03:04:05.000Z'),
          big: BigInt(42),
        },
        { id: 2, when: null, big: BigInt('9007199254740993') },
      ],
    });

    const result = await service.executeCell(
      connectionId,
      notebook.id,
      'cell-sql',
      'select * from t',
      { cellType: 'sql', variable: 'orders' },
    );
    expect(result.status).toBe('ok');
    expect(executeQueryForConnection).toHaveBeenCalledWith({
      connectionId,
      query: 'select * from t',
    });

    const [, cellId, code] = (kernelService.execute as jest.Mock).mock.calls[0];
    expect(cellId).toBe('cell-sql');
    expect(code).toContain(
      'orders = _rs_pd.DataFrame(_rs_rows, columns=_rs_columns)',
    );
    expect(code).toContain('orders = _rs_rows');
    expect(code).toContain('application/vnd.rosetta.sql-fallback+json');
    // Driver values are made JSON-safe before they reach the kernel
    expect(code).toContain('2026-01-02T03:04:05.000Z');
    expect(code).toContain('\\"big\\":42');
    expect(code).toContain('\\"big\\":\\"9007199254740993\\"');
    expect(code).toContain('\\"when\\":null');

    // DuckLake instances go through the DuckLake service
    duckLakeExecuteQuery.mockResolvedValueOnce({
      success: true,
      fields: [{ name: 'n' }],
      data: [{ n: 1 }],
    });
    await service
      .executeCell('ducklake-inst', notebook.id, 'cell-sql', 'select 1 as n', {
        cellType: 'sql',
      })
      .catch(() => undefined);
    expect(duckLakeExecuteQuery).toHaveBeenCalledWith({
      instanceId: 'inst',
      query: 'select 1 as n',
    });
  });

  it('reports SQL failures and row-less statements without touching the kernel', async () => {
    const service = await load();
    const kernelService = (
      await import('../../../../src/main/services/notebookKernel.service')
    ).default;
    const [notebook] = await service.listNotebooks(connectionId);
    (kernelService.execute as jest.Mock).mockClear();
    executeQueryForConnection.mockClear();

    executeQueryForConnection.mockResolvedValueOnce({
      success: false,
      error: 'relation "nope" does not exist',
    });
    const failed = await service.executeCell(
      connectionId,
      notebook.id,
      'cell-sql',
      'select * from nope',
      { cellType: 'sql', variable: 'df' },
    );
    expect(failed.status).toBe('error');
    expect(failed.outputs[0]).toMatchObject({
      output_type: 'error',
      ename: 'QueryError',
      evalue: 'relation "nope" does not exist',
    });

    const badName = await service.executeCell(
      connectionId,
      notebook.id,
      'cell-sql',
      'select 1',
      { cellType: 'sql', variable: 'not valid' },
    );
    expect(badName.status).toBe('error');
    expect(executeQueryForConnection).toHaveBeenCalledTimes(1);

    executeQueryForConnection.mockResolvedValueOnce({
      success: true,
      data: [],
      rowCount: 3,
    });
    const ddl = await service.executeCell(
      connectionId,
      notebook.id,
      'cell-sql',
      'update t set x = 1',
      { cellType: 'sql', variable: 'df' },
    );
    expect(ddl.status).toBe('ok');
    expect(ddl.outputs[0]).toMatchObject({
      output_type: 'stream',
      text: 'Statement executed. 3 row(s) affected.\n',
    });
    expect(kernelService.execute).not.toHaveBeenCalled();
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

  describe('legacy SQL notebook conversion', () => {
    const dir = path.join(tmpUserData, 'notebooks', `db:${connectionId}`);
    const legacy = {
      id: 'legacy-sql',
      name: 'Old SQL',
      description: 'from the json era',
      createdAt: '2024-01-01T00:00:00.000Z',
      updatedAt: '2024-02-01T00:00:00.000Z',
      lastExecutedAt: '2024-02-01T00:00:00.000Z',
      cellCount: 3,
      cells: [
        {
          id: 'c-md',
          type: 'markdown',
          content: '# Title',
          order: 1,
        },
        {
          id: 'c-sql',
          type: 'sql',
          content: 'select 1 as a',
          order: 0,
          output: {
            type: 'table',
            columns: ['a'],
            data: [{ a: 1 }],
            rowCount: 1,
          },
        },
        {
          id: 'c-err',
          type: 'sql',
          content: 'select boom',
          order: 2,
          output: { type: 'error', error: 'no such column' },
        },
      ],
    };

    it('writes an .ipynb with the same id, removes the .json and builds the env on the recommended python', async () => {
      const service = await load();
      const envService = (
        await import('../../../../src/main/services/notebookEnv.service')
      ).default;
      (envService.createEnv as jest.Mock).mockClear();
      await fs.writeJson(path.join(dir, 'legacy-sql.json'), legacy);

      const converted = await service.convertSqlNotebook(
        connectionId,
        'legacy-sql',
      );

      expect(converted).toMatchObject({
        id: 'legacy-sql',
        kind: 'python',
        name: 'Old SQL',
        description: 'from the json era',
        createdAt: legacy.createdAt,
        lastExecutedAt: legacy.lastExecutedAt,
        cellCount: 3,
        runtime: { pythonVersion: '3.10.17', status: 'creating' },
      });
      // Cells are ordered by the legacy `order`, not array position
      expect(converted.cells.map((c) => c.id)).toEqual([
        'c-sql',
        'c-md',
        'c-err',
      ]);
      expect(converted.cells[0]).toMatchObject({
        cell_type: 'sql',
        source: 'select 1 as a',
        metadata: { rosetta: { language: 'sql', variable: 'df' } },
      });
      expect(converted.cells[0].outputs[0]).toMatchObject({
        output_type: 'display_data',
        data: { 'text/html': expect.stringContaining('<td>1</td>') },
      });
      expect(converted.cells[1]).toMatchObject({
        cell_type: 'markdown',
        source: '# Title',
        outputs: [],
      });
      expect(converted.cells[2].outputs[0]).toMatchObject({
        output_type: 'error',
        evalue: 'no such column',
      });

      expect(await fs.pathExists(path.join(dir, 'legacy-sql.json'))).toBe(
        false,
      );
      const raw = await fs.readJson(path.join(dir, 'legacy-sql.ipynb'));
      expect(raw.metadata.rosetta.id).toBe('legacy-sql');
      expect(raw.cells[0].source[0]).toBe('%%sql df <<\n');
      expect(envService.createEnv).toHaveBeenCalledWith(
        'legacy-sql',
        '3.10.17',
      );

      // Now listed as a Python notebook
      const list = await service.listNotebooks(connectionId);
      expect(list.some((n) => n.id === 'legacy-sql')).toBe(true);
    });

    it('refuses to overwrite an existing .ipynb with the same id', async () => {
      const service = await load();
      await fs.writeJson(path.join(dir, 'legacy-sql.json'), legacy);

      await expect(
        service.convertSqlNotebook(connectionId, 'legacy-sql'),
      ).rejects.toThrow(/already been converted/);
      // The legacy file is left untouched
      expect(await fs.pathExists(path.join(dir, 'legacy-sql.json'))).toBe(true);
    });
  });
});
