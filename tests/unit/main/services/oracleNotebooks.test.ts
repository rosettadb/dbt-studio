import { NotebooksService } from '../../../../src/main/services/notebooks.service';
import {
  buildPagedQuery,
  buildCountQuery,
  removeTrailingPagination,
} from '../../../../src/main/utils/oracleHelper';
import ConnectorsService from '../../../../src/main/services/connectors.service';

jest.mock('../../../../src/main/services/connectors.service', () => ({
  __esModule: true,
  default: {
    getConnectionById: jest.fn(),
    executeQueryForConnection: jest.fn(),
  },
}));
jest.mock('../../../../src/main/services/duckLake.service', () => ({
  __esModule: true,
  default: { executeQuery: jest.fn() },
}));

const connector = ConnectorsService as jest.Mocked<typeof ConnectorsService>;

describe('Oracle notebook paging', () => {
  it('builds Oracle page and count SQL', () => {
    expect(buildPagedQuery('SELECT * FROM T;', 'ORDER BY ID', 20, 40)).toBe(
      'SELECT * FROM (SELECT * FROM T) studio_page ORDER BY ID OFFSET 40 ROWS FETCH NEXT 20 ROWS ONLY',
    );
    expect(buildCountQuery('SELECT * FROM T;')).toBe(
      'SELECT COUNT(*) AS "count" FROM (SELECT * FROM T) studio_page',
    );
  });
  it.each([
    'OFFSET 9 ROWS FETCH NEXT 2 ROWS ONLY',
    'FETCH FIRST 3 ROWS ONLY',
    'OFFSET 3 ROWS',
  ])('removes trailing Oracle %s', (clause) => {
    expect(removeTrailingPagination(`SELECT * FROM T ${clause};`)).toBe(
      'SELECT * FROM T',
    );
  });
  it('pages through the service and reads string counts as numbers', async () => {
    connector.getConnectionById.mockResolvedValue({
      id: 'oracle',
      connection: { type: 'oracle' } as any,
    });
    connector.executeQueryForConnection.mockImplementation(async ({ query }) =>
      query.includes('COUNT(*)')
        ? { success: true, data: [{ count: '100' }] as any }
        : { success: true, data: [{ ID: 1 }] as any, rowCount: 1 },
    );
    const output = await NotebooksService.fetchCellPage(
      'oracle',
      'notebook',
      'cell',
      'SELECT * FROM T ORDER BY ID FETCH FIRST 2 ROWS ONLY;',
      20,
      40,
    );
    expect(output.totalRows).toBe(100);
    expect(connector.getConnectionById).toHaveBeenCalledTimes(1);
    expect(connector.executeQueryForConnection).toHaveBeenNthCalledWith(1, {
      connectionId: 'oracle',
      query:
        'SELECT * FROM (SELECT * FROM T) studio_page ORDER BY ID OFFSET 40 ROWS FETCH NEXT 20 ROWS ONLY',
    });
  });
});

describe('Notebook routing preserves existing connections', () => {
  const run = (
    method: 'runCell' | 'fetchCellPage',
    connectionId: string,
    sql: string,
    limit = 20,
    offset = 40,
  ) =>
    NotebooksService[method](
      connectionId,
      'notebook',
      'cell',
      sql,
      limit,
      offset,
    );

  beforeEach(() => {
    jest.clearAllMocks();
    jest
      .spyOn(NotebooksService as any, 'updateCellOutput')
      .mockResolvedValue(undefined);
    connector.executeQueryForConnection.mockImplementation(async ({ query }) =>
      query.includes('COUNT(*)')
        ? { success: true, data: [{ count: BigInt(100) }] as any }
        : { success: true, data: [{ ID: 1 }] as any, rowCount: 1 },
    );
  });
  afterEach(() => jest.restoreAllMocks());

  it.each(
    [
      'postgres',
      'mysql',
      'duckdb',
      'sqlite',
      'snowflake',
      'bigquery',
      'redshift',
      'databricks',
      'kinetica',
    ].flatMap((type) =>
      (['runCell', 'fetchCellPage'] as const).map(
        (method) => [type, method] as const,
      ),
    ),
  )(
    'keeps %s %s page SQL, count SQL and bigint conversion unchanged',
    async (type, method) => {
      connector.getConnectionById.mockResolvedValue({
        id: type,
        connection: { type } as any,
      });
      const output = await run(method, type, 'SELECT * FROM T ORDER BY ID');
      expect(output).toMatchObject({ type: 'table', totalRows: 100 });
      expect(
        connector.executeQueryForConnection.mock.calls.map(
          ([request]) => request.query,
        ),
      ).toEqual([
        'SELECT * FROM (SELECT * FROM T) AS subquery ORDER BY ID LIMIT 20 OFFSET 40',
        'SELECT COUNT(*) as count FROM (SELECT * FROM T) as subquery',
      ]);
    },
  );

  it('preserves explicit LIMIT handling in existing notebook queries', async () => {
    connector.getConnectionById.mockResolvedValue({
      id: 'postgres',
      connection: { type: 'postgres' } as any,
    });
    await run('fetchCellPage', 'postgres', 'SELECT * FROM T LIMIT 7');
    expect(
      connector.executeQueryForConnection.mock.calls.map(
        ([request]) => request.query,
      ),
    ).toEqual([
      'SELECT * FROM (SELECT * FROM T LIMIT 7) AS subquery LIMIT 20 OFFSET 40',
      'SELECT COUNT(*) as count FROM (SELECT * FROM T LIMIT 7) as subquery',
    ]);
  });

  it.each(['runCell', 'fetchCellPage'] as const)(
    'preserves DuckLake routing in %s',
    async (method) => {
      const duckLake = jest.requireMock(
        '../../../../src/main/services/duckLake.service',
      ).default;
      duckLake.executeQuery.mockImplementation(
        async ({ query }: { query: string }) =>
          query.includes('COUNT(*)')
            ? { success: true, data: [{ count: BigInt(100) }] }
            : { success: true, data: [{ ID: 1 }], rowCount: 1 },
      );
      const output = await run(
        method,
        'ducklake-instance',
        'SELECT * FROM T ORDER BY ID',
      );
      expect(output).toMatchObject({ type: 'table', totalRows: 100 });
      expect(connector.getConnectionById).not.toHaveBeenCalled();
      expect(connector.executeQueryForConnection).not.toHaveBeenCalled();
      expect(
        duckLake.executeQuery.mock.calls.map(
          ([request]: [{ query: string }]) => request.query,
        ),
      ).toEqual([
        'SELECT * FROM (SELECT * FROM T) AS subquery ORDER BY ID LIMIT 20 OFFSET 40',
        'SELECT COUNT(*) as count FROM (SELECT * FROM T) as subquery',
      ]);
    },
  );

  it.each(['runCell', 'fetchCellPage'] as const)(
    'keeps Oracle pagination validation and string counts in %s',
    async (method) => {
      connector.getConnectionById.mockResolvedValue({
        id: 'oracle',
        connection: { type: 'oracle' } as any,
      });
      connector.executeQueryForConnection.mockImplementation(
        async ({ query }) =>
          query.includes('COUNT(*)')
            ? { success: true, data: [{ count: '100' }] as any }
            : { success: true, data: [{ ID: 1 }] as any, rowCount: 1 },
      );
      const output = await run(
        method,
        'oracle',
        'SELECT * FROM T ORDER BY ID OFFSET 1 ROWS FETCH NEXT 2 ROWS ONLY;',
        5000,
      );
      expect(output).toMatchObject({ type: 'table', totalRows: 100 });
      expect(
        connector.executeQueryForConnection.mock.calls.map(
          ([request]) => request.query,
        ),
      ).toEqual([
        'SELECT * FROM (SELECT * FROM T) studio_page ORDER BY ID OFFSET 40 ROWS FETCH NEXT 1000 ROWS ONLY',
        'SELECT COUNT(*) AS "count" FROM (SELECT * FROM T) studio_page',
      ]);
    },
  );
});
