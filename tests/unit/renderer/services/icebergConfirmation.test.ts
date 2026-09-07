import { executeConfirmedIcebergSql } from '../../../../src/renderer/services/iceberg.service';

describe('Iceberg mutation confirmation', () => {
  const invoke = window.electron.ipcRenderer.invoke as jest.Mock;
  beforeEach(() => {
    invoke.mockReset();
  });
  it.each([
    '/* comment */ DELETE FROM iceberg.sales.orders',
    'WITH ids AS (SELECT 1) DELETE FROM iceberg.sales.orders',
  ])('does not execute rejected confirmation: %s', async (sql) => {
    invoke.mockResolvedValueOnce({ statementClass: 'delete' });
    const confirm = jest.fn(() => false);
    expect(
      await executeConfirmedIcebergSql(
        { instanceId: 'id', executionId: 'run', sql },
        confirm,
      ),
    ).toBeUndefined();
    expect(confirm).toHaveBeenCalledWith('delete');
    expect(invoke).toHaveBeenCalledTimes(1);
    expect(invoke.mock.calls[0][1].validateOnly).toBe(true);
  });
  it('executes exactly the SQL that was confirmed', async () => {
    invoke
      .mockResolvedValueOnce({ statementClass: 'delete' })
      .mockResolvedValueOnce({ rows: [] });
    const params = {
      instanceId: 'id',
      executionId: 'run',
      sql: 'DELETE FROM iceberg.sales.orders',
    };
    await executeConfirmedIcebergSql(params, () => {
      params.sql = 'changed';
      return true;
    });
    expect(invoke.mock.calls[1][1]).toMatchObject({
      sql: 'DELETE FROM iceberg.sales.orders',
      mutationConfirmed: true,
      validateOnly: false,
    });
  });
  it('does not prompt for a backend-classified read', async () => {
    invoke
      .mockResolvedValueOnce({ statementClass: 'select' })
      .mockResolvedValueOnce({ rows: [], truncated: true });
    const confirm = jest.fn();
    expect(
      await executeConfirmedIcebergSql(
        { instanceId: 'id', executionId: 'run', sql: 'SELECT 1' },
        confirm,
      ),
    ).toMatchObject({ truncated: true });
    expect(confirm).not.toHaveBeenCalled();
  });
});
