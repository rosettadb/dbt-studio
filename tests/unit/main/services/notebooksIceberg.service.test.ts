import { NotebooksService } from '../../../../src/main/services/notebooks.service';
import { IcebergDatalakeService } from '../../../../src/main/services/icebergDatalake.service';

jest.mock('../../../../src/main/services/icebergDatalake.service', () => ({
  IcebergDatalakeService: {
    executeSql: jest.fn(),
    cancelSql: jest.fn(),
  },
}));

describe('NotebooksService Iceberg execution', () => {
  const executeSql = IcebergDatalakeService.executeSql as jest.Mock;
  const cancelSql = IcebergDatalakeService.cancelSql as jest.Mock;
  const notebook = {
    id: 'notebook-1',
    name: 'Iceberg notebook',
    cells: [
      { id: 'cell-1', type: 'sql' as const, content: 'SELECT 1', order: 0 },
    ],
    createdAt: '2026-09-07T00:00:00.000Z',
    updatedAt: '2026-09-07T00:00:00.000Z',
    cellCount: 1,
  };

  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(NotebooksService, 'getNotebook').mockResolvedValue(notebook);
    jest
      .spyOn(NotebooksService as any, 'updateCellOutput')
      .mockResolvedValue(undefined);
  });

  it('executes the original cell through the paginated Iceberg runtime', async () => {
    executeSql.mockResolvedValue({
      statementClass: 'select',
      rows: [{ id: 1 }],
      columns: ['id'],
      rowsChanged: 0,
      truncated: false,
      totalRows: 1_001,
    });

    const output = await NotebooksService.runCell(
      'iceberg-instance-1',
      notebook.id,
      'cell-1',
      'SELECT * FROM iceberg.sales.orders',
      10,
      20,
      { executionId: 'cell-run' },
    );

    expect(executeSql).toHaveBeenCalledWith(
      {
        instanceId: 'instance-1',
        executionId: 'cell-run',
        sql: 'SELECT * FROM iceberg.sales.orders',
        pageLimit: 10,
        pageOffset: 20,
        mutationConfirmed: undefined,
      },
      expect.any(AbortSignal),
    );
    expect(output).toMatchObject({
      type: 'table',
      truncated: false,
      totalRows: 1_001,
      statementClass: 'select',
    });
  });

  it('rejects the direct Run All route without a confirmed cell payload', async () => {
    await expect(
      NotebooksService.runAllCells('iceberg-instance-1', notebook.id),
    ).rejects.toThrow('ICEBERG_NOTEBOOK_CELL_CONFIRMATION_REQUIRED');
    expect(executeSql).not.toHaveBeenCalled();
  });

  it('runs one confirmed Run All cell and propagates its failure', async () => {
    executeSql.mockRejectedValue(new Error('write failed'));

    await expect(
      NotebooksService.runAllCells('iceberg-instance-1', notebook.id, {
        executionId: 'run-all-cell',
        cellId: 'cell-1',
        sql: 'DELETE FROM iceberg.sales.orders',
        mutationConfirmed: true,
      }),
    ).rejects.toThrow('write failed');
  });

  it('interrupts an active cell and records a cancelled output', async () => {
    let rejectExecution!: (error: Error) => void;
    executeSql.mockImplementation(
      () =>
        new Promise((_resolve, reject) => {
          rejectExecution = reject;
        }),
    );

    const run = NotebooksService.runCell(
      'iceberg-instance-1',
      notebook.id,
      'cell-1',
      'SELECT * FROM iceberg.sales.orders',
      undefined,
      undefined,
      { executionId: 'cancel-me' },
    );
    await Promise.resolve();
    await Promise.resolve();
    expect(NotebooksService.cancelIcebergCell('cancel-me')).toBe(true);
    rejectExecution(new Error('interrupted'));

    await expect(run).resolves.toMatchObject({
      type: 'error',
      cancelled: true,
      error: 'Iceberg execution cancelled.',
    });
    expect(cancelSql).toHaveBeenCalledWith('cancel-me');
  });
});
