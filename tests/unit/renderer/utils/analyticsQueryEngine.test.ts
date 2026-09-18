import { executeQueryForConnection } from '../../../../src/renderer/services/connectors.service';
import { DuckLakeService } from '../../../../src/renderer/services/duckLake.service';
import { executeIcebergSql } from '../../../../src/renderer/services/iceberg.service';
import { executeAnalyticsQuery } from '../../../../src/renderer/utils/analyticsQueryEngine';

jest.mock('../../../../src/renderer/services/connectors.service', () => ({
  executeQueryForConnection: jest.fn(),
}));

jest.mock('../../../../src/renderer/services/duckLake.service', () => ({
  DuckLakeService: {
    executeQuery: jest.fn(),
  },
}));

jest.mock('../../../../src/renderer/services/iceberg.service', () => ({
  executeIcebergSql: jest.fn(),
}));

const executeConnectorQuery = executeQueryForConnection as jest.Mock;
const executeDuckLakeQuery = DuckLakeService.executeQuery as jest.Mock;
const executeIcebergQuery = executeIcebergSql as jest.Mock;

describe('executeAnalyticsQuery', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('routes SQLite through the regular connector path with the preview cap', async () => {
    executeConnectorQuery.mockResolvedValue({
      success: true,
      data: [{ customer_count: 3 }],
      fields: [{ name: 'customer_count', type: -1 }],
      duration: 4,
    });

    await expect(
      executeAnalyticsQuery({
        queryName: 'customer_summary',
        sql: 'SELECT COUNT(*) AS customer_count FROM customers',
        connectionId: 'sqlite-connection',
      }),
    ).resolves.toEqual({
      name: 'customer_summary',
      status: 'success',
      data: [{ customer_count: 3 }],
      fields: ['customer_count'],
      rowCount: 1,
      duration: 4,
    });

    expect(executeConnectorQuery).toHaveBeenCalledWith({
      connectionId: 'sqlite-connection',
      query:
        'SELECT * FROM (\nSELECT COUNT(*) AS customer_count FROM customers\n) AS _limit_wrapper LIMIT 500',
    });
    expect(executeDuckLakeQuery).not.toHaveBeenCalled();
  });

  it('returns regular connector errors without invoking DuckLake', async () => {
    executeConnectorQuery.mockResolvedValue({
      success: false,
      error: 'no such table: missing_table',
    });

    await expect(
      executeAnalyticsQuery({
        queryName: 'missing',
        sql: 'SELECT * FROM missing_table',
        connectionId: 'sqlite-connection',
      }),
    ).resolves.toMatchObject({
      name: 'missing',
      status: 'error',
      error: 'no such table: missing_table',
    });
    expect(executeDuckLakeQuery).not.toHaveBeenCalled();
  });

  it('routes Iceberg reads through validation and a bounded trusted execution', async () => {
    executeIcebergQuery
      .mockResolvedValueOnce({ statementClass: 'select' })
      .mockResolvedValueOnce({
        statementClass: 'select',
        columns: ['station_id'],
        rows: [{ station_id: 1 }],
        truncated: false,
      });

    await expect(
      executeAnalyticsQuery({
        queryName: 'stations',
        sql: 'SELECT station_id FROM iceberg.default.stations',
        connectionId: 'iceberg-catalog-id',
      }),
    ).resolves.toEqual({
      name: 'stations',
      status: 'success',
      data: [{ station_id: 1 }],
      fields: ['station_id'],
      rowCount: 1,
    });

    expect(executeIcebergQuery).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        instanceId: 'catalog-id',
        sql: 'SELECT station_id FROM iceberg.default.stations',
        pageLimit: 500,
        pageOffset: 0,
        validateOnly: true,
      }),
    );
    expect(executeIcebergQuery).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        instanceId: 'catalog-id',
        pageLimit: 500,
        pageOffset: 0,
      }),
    );
    expect(executeConnectorQuery).not.toHaveBeenCalled();
    expect(executeDuckLakeQuery).not.toHaveBeenCalled();
  });

  it('rejects Iceberg mutations after trusted classification', async () => {
    executeIcebergQuery.mockResolvedValueOnce({ statementClass: 'delete' });

    await expect(
      executeAnalyticsQuery({
        queryName: 'remove_stations',
        sql: 'DELETE FROM iceberg.default.stations',
        connectionId: 'iceberg-catalog-id',
      }),
    ).resolves.toMatchObject({
      name: 'remove_stations',
      status: 'error',
      error: 'Analytics pages support read-only Iceberg SELECT queries.',
    });
    expect(executeIcebergQuery).toHaveBeenCalledTimes(1);
  });
});
