import { notebooksService } from '../../../../src/renderer/services/notebooks.service';
import {
  getIcebergNotebookTables,
  icebergQualifiedName,
} from '../../../../src/renderer/services/iceberg.service';

describe('Iceberg Notebook renderer execution', () => {
  const invoke = window.electron.ipcRenderer.invoke as jest.Mock;

  beforeEach(() => {
    invoke.mockReset();
    (window.confirm as jest.Mock | undefined)?.mockReset?.();
  });

  it('classifies comments before asking for mutation confirmation', async () => {
    invoke
      .mockResolvedValueOnce({ statementClass: 'delete' })
      .mockResolvedValueOnce({ id: 'instance-1', name: 'Warehouse' });
    jest.spyOn(window, 'confirm').mockReturnValue(false);

    await expect(
      notebooksService.runCell(
        'iceberg-instance-1',
        'notebook-1',
        'cell-1',
        '/* comment */ DELETE FROM iceberg.sales.orders',
      ),
    ).rejects.toThrow('confirmation declined');
    expect(invoke).toHaveBeenCalledTimes(2);
    expect(invoke.mock.calls[0][1]).toMatchObject({ validateOnly: true });
  });

  it('Run All confirms sequentially and stops after rejection', async () => {
    invoke
      .mockResolvedValueOnce({
        id: 'notebook-1',
        cells: [
          { id: 'cell-1', type: 'sql', content: 'SELECT 1', order: 0 },
          {
            id: 'cell-2',
            type: 'sql',
            content: 'DELETE FROM iceberg.sales.orders',
            order: 1,
          },
          { id: 'cell-3', type: 'sql', content: 'SELECT 3', order: 2 },
        ],
      })
      .mockResolvedValueOnce({ statementClass: 'select' })
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce({ statementClass: 'delete' })
      .mockResolvedValueOnce({ id: 'instance-1', name: 'Warehouse' });
    jest.spyOn(window, 'confirm').mockReturnValue(false);

    await expect(
      notebooksService.runAllCells('iceberg-instance-1', 'notebook-1'),
    ).rejects.toThrow('confirmation declined');
    expect(
      invoke.mock.calls.some((call) => call[0] === 'notebooks:runAll'),
    ).toBe(true);
    expect(
      invoke.mock.calls.some(
        (call) => call[1]?.sql === 'SELECT 3' && call[1]?.validateOnly,
      ),
    ).toBe(false);
  });

  it('forwards cancellation for the active execution ID', async () => {
    const controller = new AbortController();
    invoke.mockResolvedValueOnce({ statementClass: 'select' });
    invoke.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          controller.signal.addEventListener('abort', () => resolve(undefined));
        }),
    );

    const run = notebooksService.runCell(
      'iceberg-instance-1',
      'notebook-1',
      'cell-1',
      'SELECT * FROM iceberg.sales.orders',
      undefined,
      undefined,
      { executionId: 'active-cell', signal: controller.signal },
    );
    await Promise.resolve();
    controller.abort();
    await run;

    expect(invoke).toHaveBeenCalledWith(
      'notebooks:cancelIcebergCell',
      'active-cell',
    );
  });

  it('maps Iceberg schema data for the existing Notebook tree and completion model', async () => {
    invoke.mockResolvedValueOnce({
      catalogName: 'iceberg',
      namespaces: [
        {
          name: 'sales',
          tables: [
            {
              name: 'order"items',
              type: 'TABLE',
              columns: [{ name: 'item"id', type: 'BIGINT', position: 1 }],
            },
          ],
        },
      ],
    });

    await expect(
      getIcebergNotebookTables('iceberg-instance-1'),
    ).resolves.toMatchObject([
      {
        schema: 'sales',
        name: 'order"items',
        columns: [{ name: 'item"id', typeName: 'BIGINT', ordinalPosition: 1 }],
      },
    ]);
    expect(icebergQualifiedName('sales', 'order"items')).toBe(
      'iceberg.sales."order""items"',
    );
    expect(icebergQualifiedName('default', 'keywords')).toBe(
      'iceberg.default.keywords',
    );
  });
});
