import { DuckDBCatalogAdapter } from '../../../../src/main/services/duckLake/adapters/duckdb.adapter';

jest.mock('@duckdb/node-api', () => ({ DuckDBInstance: {} }));
jest.mock('../../../../src/main/helpers/cloudAuth.helper', () => ({
  generateGCSBearerToken: jest.fn(),
}));
jest.mock('electron-log', () => ({ error: jest.fn() }));

class ConnectedAdapter extends DuckDBCatalogAdapter {
  constructor(name: string, run: jest.Mock) {
    super();
    this.connectionInfo = {
      instance: {},
      connection: { run },
      catalogType: 'duckdb',
      instanceName: name,
      connectedAt: new Date(),
    };
  }
}

describe('DuckLake hidden metadata catalog', () => {
  it.each(['hello', 'lake-"quoted'])(
    'lists tables for %s without catalog discovery',
    async (name) => {
      const run = jest.fn().mockImplementation(async (sql: string) => {
        // Simulate a runtime that hides metadata from catalog enumeration.
        if (sql.includes('duckdb_databases()')) {
          return { getRows: async () => [] };
        }
        return {
          getRows: async () => [[1, 'test', 'main', 'uuid', 1, 1, 0, null]],
        };
      });
      const adapter = new ConnectedAdapter(name, run);
      expect(await adapter.listTables()).toEqual([
        expect.objectContaining({ name: 'test', schema: 'main', rowCount: 1 }),
      ]);
      expect(run).toHaveBeenCalledTimes(1);
      expect(run.mock.calls[0][0]).toContain(
        `"__ducklake_metadata_${name.replace(/"/g, '""')}".main.ducklake_table`,
      );
    },
  );

  it('qualifies view metadata against the connected instance', async () => {
    const run = jest.fn().mockResolvedValue({
      getRows: async () => [],
      columnNames: () => ['view_name'],
      columnTypes: () => [],
    });
    const adapter = new ConnectedAdapter('hello', run);
    await adapter.executeQuery({
      query: 'SELECT view_name FROM ducklake_view',
    } as any);
    expect(run).toHaveBeenCalledWith(
      'SELECT view_name FROM "__ducklake_metadata_hello".main.ducklake_view',
    );
    expect(run).toHaveBeenCalledTimes(1);
  });

  it('lists instance snapshots even when metadata is absent from database enumeration', async () => {
    const run = jest.fn().mockImplementation(async (sql: string) => ({
      getRows: async () => (sql.includes('COUNT(*) as total') ? [[0]] : []),
    }));
    const adapter = new ConnectedAdapter('hello', run);
    await expect(
      adapter.listInstanceSnapshots({ page: 1, pageSize: 10 }),
    ).resolves.toEqual(expect.objectContaining({ total: 0 }));
    expect(
      run.mock.calls.some(([sql]) => sql.includes('duckdb_databases()')),
    ).toBe(false);
    expect(
      run.mock.calls.some(([sql]) =>
        sql.includes('"__ducklake_metadata_hello".main.ducklake_snapshot'),
      ),
    ).toBe(true);
  });
});
