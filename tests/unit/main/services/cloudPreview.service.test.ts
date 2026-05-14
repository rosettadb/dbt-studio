/**
 * CloudPreviewService — integration-style unit tests
 *
 * Covers the main previewCloudData flows with mocked
 * DuckDB, helpers, and extension setup. Tests verify the full data path:
 * secret injection → format detection → query execution → result conversion.
 */

// ─── Mocks ────────────────────────────────────────────────────────────────────

const mockGetConnection = jest.fn();
const mockReleaseConnection = jest.fn();

jest.mock('../../../../src/main/services/duckdb.service', () => ({
  __esModule: true,
  default: {
    getConnection: (...args: any[]) => mockGetConnection(...args),
    releaseConnection: (...args: any[]) => mockReleaseConnection(...args),
  },
}));

const mockSetupExtensions = jest.fn();

jest.mock('../../../../src/main/helpers/extensionSetup.helper', () => ({
  setupExtensions: (...args: any[]) => mockSetupExtensions(...args),
}));

const mockBuildCloudSecretQuery = jest.fn();
const mockHandleProviderError = jest.fn();
const mockConvertDuckDBValue = jest.fn((v: any) => v);

jest.mock('../../../../src/main/helpers', () => ({
  buildCloudSecretQuery: (...args: any[]) => mockBuildCloudSecretQuery(...args),
  getCloudUrl: jest.fn((provider: string, bucket: string, obj: string) => `s3://${bucket}/${obj}`),
  isPreviewSupported: jest.fn(() => true),
  handleProviderError: (...args: any[]) => mockHandleProviderError(...args),
  convertDuckDBValue: (v: any) => mockConvertDuckDBValue(v),
}));

// ─── Import after mocks ───────────────────────────────────────────────────────

import CloudPreviewService from '../../../../src/main/services/cloudPreview.service';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const BASE_OPTIONS = {
  provider: 'aws' as const,
  cloudConfig: { region: 'us-east-1', accessKeyId: 'k', secretAccessKey: 's' } as any,
  objectPath: 's3://bucket/data.csv',
  previewType: 'sample' as const,
  pageSize: 25,
  page: 0,
};

const DESCRIBE_ROWS = [
  ['id', 'INTEGER', 'YES'],
  ['name', 'VARCHAR', 'YES'],
];

const SCHEMA_COLUMNS = [
  { name: 'id', type: 'INTEGER', nullable: true },
  { name: 'name', type: 'VARCHAR', nullable: true },
];

/** Build a mock connection whose run() dispatches on SQL content */
function makeConnection(
  dispatch: Record<string, any> = {},
  defaultResult: any = { getRows: jest.fn().mockResolvedValue([]) },
) {
  return {
    run: jest.fn().mockImplementation(async (sql: string) => {
      const match = Object.keys(dispatch).find((k) => sql.includes(k));
      return match ? dispatch[match] : defaultResult;
    }),
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('CloudPreviewService.previewCloudData', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSetupExtensions.mockResolvedValue(undefined);
    mockBuildCloudSecretQuery.mockResolvedValue('SECRET SQL');
    mockHandleProviderError.mockReturnValue({
      success: false,
      error: 'mapped error',
      objectPath: BASE_OPTIONS.objectPath,
      previewType: BASE_OPTIONS.previewType,
    });
  });

  // ── Sample preview ──────────────────────────────────────────────────────────

  it('returns converted rows on a successful sample preview', async () => {
    const dataRows = [
      [1, 'alice'],
      [2, 'bob'],
    ];

    const conn = makeConnection({
      'COUNT(*)': { getRows: jest.fn().mockResolvedValue([[2]]) },
      DESCRIBE: { getRows: jest.fn().mockResolvedValue(DESCRIBE_ROWS) },
    }, {
      schema: { fields: [{ name: 'id', type: 'INTEGER' }, { name: 'name', type: 'VARCHAR' }] },
      getRows: jest.fn().mockResolvedValue(dataRows),
    });

    mockGetConnection.mockResolvedValue(conn);

    const result = await CloudPreviewService.previewCloudData({
      ...BASE_OPTIONS,
      objectPath: `s3://bucket/unique-sample-${Date.now()}.csv`,
    });

    expect(result.success).toBe(true);
    expect(result.data).toEqual(dataRows);
    expect(result.columns).toEqual([
      { name: 'id', type: 'INTEGER' },
      { name: 'name', type: 'VARCHAR' },
    ]);
    expect(result.previewType).toBe('sample');
    expect(mockGetConnection).toHaveBeenCalledWith('cloud-preview');
    expect(mockSetupExtensions).toHaveBeenCalledWith(
      conn,
      'aws',
      expect.stringContaining('s3://'),
    );
    expect(mockBuildCloudSecretQuery).toHaveBeenCalledWith('aws', expect.any(Object));
    expect(mockReleaseConnection).toHaveBeenCalledWith(conn);
  });

  it('injects secret SQL before executing the preview query', async () => {
    const callOrder: string[] = [];

    const conn = {
      run: jest.fn().mockImplementation(async (sql: string) => {
        callOrder.push(sql.trim().slice(0, 30));
        if (sql.includes('COUNT(*)')) return { getRows: jest.fn().mockResolvedValue([[0]]) };
        if (sql.includes('DESCRIBE')) return { getRows: jest.fn().mockResolvedValue(DESCRIBE_ROWS) };
        return {
          schema: { fields: [{ name: 'id', type: 'INTEGER' }] },
          getRows: jest.fn().mockResolvedValue([]),
        };
      }),
    };

    mockGetConnection.mockResolvedValue(conn);

    await CloudPreviewService.previewCloudData({
      ...BASE_OPTIONS,
      objectPath: `s3://bucket/order-test-${Date.now()}.csv`,
    });

    const secretIdx = callOrder.findIndex((s) => s.startsWith('SECRET SQL'));
    const selectIdx = callOrder.findIndex((s) => s.startsWith('SELECT'));
    expect(secretIdx).toBeGreaterThanOrEqual(0);
    expect(selectIdx).toBeGreaterThan(secretIdx);
  });

  // ── Schema preview ──────────────────────────────────────────────────────────

  it('returns schema columns for previewType=schema', async () => {
    const conn = makeConnection({
      DESCRIBE: { getRows: jest.fn().mockResolvedValue(DESCRIBE_ROWS) },
    });

    mockGetConnection.mockResolvedValue(conn);

    const result = await CloudPreviewService.previewCloudData({
      ...BASE_OPTIONS,
      previewType: 'schema',
    });

    expect(result.success).toBe(true);
    expect(result.data).toEqual([]);
    expect(result.columns).toEqual(SCHEMA_COLUMNS);
    expect(result.previewType).toBe('schema');
    expect(mockReleaseConnection).toHaveBeenCalledWith(conn);
  });

  // ── Stats preview ───────────────────────────────────────────────────────────

  it('returns column stats for previewType=stats', async () => {
    const conn = makeConnection({
      DESCRIBE: { getRows: jest.fn().mockResolvedValue([['age', 'INTEGER', 'YES']]) },
      'null_count': {
        getRows: jest.fn().mockResolvedValue([[0, 100, '18', '65', '35']]),
      },
    });

    mockGetConnection.mockResolvedValue(conn);

    const result = await CloudPreviewService.previewCloudData({
      ...BASE_OPTIONS,
      previewType: 'stats',
    });

    expect(result.success).toBe(true);
    expect(result.previewType).toBe('stats');
    expect(Array.isArray(result.data)).toBe(true);
    expect(mockReleaseConnection).toHaveBeenCalledWith(conn);
  });

  // ── Pagination ──────────────────────────────────────────────────────────────

  it('applies LIMIT and OFFSET for page > 0', async () => {
    const executedQueries: string[] = [];

    const conn = {
      run: jest.fn().mockImplementation(async (sql: string) => {
        executedQueries.push(sql);
        if (sql.includes('DESCRIBE')) return { getRows: jest.fn().mockResolvedValue(DESCRIBE_ROWS) };
        return {
          schema: { fields: [{ name: 'id', type: 'INTEGER' }] },
          getRows: jest.fn().mockResolvedValue([[3], [4]]),
        };
      }),
    };

    mockGetConnection.mockResolvedValue(conn);

    await CloudPreviewService.previewCloudData({
      ...BASE_OPTIONS,
      objectPath: `s3://bucket/page-test-${Date.now()}.csv`,
      page: 2,
      pageSize: 25,
    });

    const selectQuery = executedQueries.find((q) =>
      q.includes('SELECT') && q.includes('LIMIT') && q.includes('OFFSET'),
    );
    expect(selectQuery).toBeDefined();
    expect(selectQuery).toContain('LIMIT 25');
    expect(selectQuery).toContain('OFFSET 50');
  });

  it('reuses a known total row count on page > 0', async () => {
    const executedQueries: string[] = [];

    const conn = {
      run: jest.fn().mockImplementation(async (sql: string) => {
        executedQueries.push(sql);
        if (sql.includes('DESCRIBE')) return { getRows: jest.fn().mockResolvedValue(DESCRIBE_ROWS) };
        return {
          schema: { fields: [{ name: 'id', type: 'INTEGER' }] },
          getRows: jest.fn().mockResolvedValue([]),
        };
      }),
    };

    mockGetConnection.mockResolvedValue(conn);

    const result = await CloudPreviewService.previewCloudData({
      ...BASE_OPTIONS,
      objectPath: `s3://bucket/no-count-${Date.now()}.csv`,
      page: 3,
      knownTotalRows: 999,
    });

    const countQuery = executedQueries.find(
      (q) => q.includes('COUNT(*)') && !q.includes('DESCRIBE'),
    );
    expect(countQuery).toBeUndefined();
    expect(result.totalRows).toBe(999);
  });

  it('uses parquet file metadata for exact counts when no filter is active', async () => {
    const executedQueries: string[] = [];

    const conn = {
      run: jest.fn().mockImplementation(async (sql: string) => {
        executedQueries.push(sql);
        if (sql.includes('parquet_file_metadata')) {
          return { getRows: jest.fn().mockResolvedValue([[1234]]) };
        }
        if (sql.includes('DESCRIBE')) {
          return { getRows: jest.fn().mockResolvedValue(DESCRIBE_ROWS) };
        }
        return {
          schema: { fields: [{ name: 'id', type: 'INTEGER' }] },
          getRows: jest.fn().mockResolvedValue([[1], [2]]),
        };
      }),
    };

    mockGetConnection.mockResolvedValue(conn);

    const result = await CloudPreviewService.previewCloudData({
      ...BASE_OPTIONS,
      objectPath: `s3://bucket/report-${Date.now()}.parquet`,
    });

    const parquetCountQuery = executedQueries.find((q) =>
      q.includes('parquet_file_metadata'),
    );
    const countQuery = executedQueries.find((q) => q.includes('COUNT(*)'));

    expect(parquetCountQuery).toBeDefined();
    expect(countQuery).toBeUndefined();
    expect(result.totalRows).toBe(1234);
  });

  // ── WHERE clause ────────────────────────────────────────────────────────────

  it('appends WHERE clause to the SELECT query', async () => {
    const executedQueries: string[] = [];

    const conn = {
      run: jest.fn().mockImplementation(async (sql: string) => {
        executedQueries.push(sql);
        if (sql.includes('COUNT(*)')) return { getRows: jest.fn().mockResolvedValue([[5]]) };
        if (sql.includes('DESCRIBE')) return { getRows: jest.fn().mockResolvedValue(DESCRIBE_ROWS) };
        return {
          schema: { fields: [{ name: 'id', type: 'INTEGER' }] },
          getRows: jest.fn().mockResolvedValue([]),
        };
      }),
    };

    mockGetConnection.mockResolvedValue(conn);

    await CloudPreviewService.previewCloudData({
      ...BASE_OPTIONS,
      objectPath: `s3://bucket/where-test-${Date.now()}.csv`,
      whereClause: 'age > 18',
    });

    const selectQuery = executedQueries.find(
      (q) => q.includes('SELECT') && q.includes('WHERE'),
    );
    expect(selectQuery).toBeDefined();
    expect(selectQuery).toContain('WHERE age > 18');
  });

  it('returns success:false when WHERE clause contains forbidden keyword', async () => {
    const consoleErrorSpy = jest
      .spyOn(console, 'error')
      .mockImplementation(() => undefined);

    const conn = makeConnection();
    mockGetConnection.mockResolvedValue(conn);

    const result = await CloudPreviewService.previewCloudData({
      ...BASE_OPTIONS,
      whereClause: 'col = SECRET',
    });

    expect(result.success).toBe(false);
    consoleErrorSpy.mockRestore();
  });

  // ── Error handling ──────────────────────────────────────────────────────────

  it('calls handleProviderError and releases connection on DuckDB failure', async () => {
    const consoleErrorSpy = jest
      .spyOn(console, 'error')
      .mockImplementation(() => undefined);

    const conn = {
      run: jest.fn().mockRejectedValue(new Error('DuckDB boom')),
    };

    mockGetConnection.mockResolvedValue(conn);

    const result = await CloudPreviewService.previewCloudData(BASE_OPTIONS);

    expect(mockHandleProviderError).toHaveBeenCalledWith(
      'aws',
      'DuckDB boom',
      BASE_OPTIONS.objectPath,
      BASE_OPTIONS.previewType,
    );
    expect(result.success).toBe(false);
    expect(mockReleaseConnection).toHaveBeenCalledWith(conn);

    consoleErrorSpy.mockRestore();
  });

  it('returns success:false with timeout message when connection pool times out', async () => {
    const consoleErrorSpy = jest
      .spyOn(console, 'error')
      .mockImplementation(() => undefined);

    mockGetConnection.mockRejectedValue(
      new Error('Connection pool timeout: system is busy, please try again'),
    );

    mockHandleProviderError.mockReturnValue({
      success: false,
      error: 'Connection pool timeout: system is busy, please try again',
      objectPath: BASE_OPTIONS.objectPath,
      previewType: BASE_OPTIONS.previewType,
    });

    const result = await CloudPreviewService.previewCloudData(BASE_OPTIONS);

    expect(result.success).toBe(false);
    expect(mockHandleProviderError).toHaveBeenCalledWith(
      'aws',
      expect.stringContaining('timeout'),
      BASE_OPTIONS.objectPath,
      BASE_OPTIONS.previewType,
    );
    expect(mockReleaseConnection).not.toHaveBeenCalled();

    consoleErrorSpy.mockRestore();
  });

  // ── Undetectable format ─────────────────────────────────────────────────────

  it('returns success:false for undetectable file format', async () => {
    const conn = makeConnection({
      // read_blob returns null magic bytes
      'read_blob': { getRows: jest.fn().mockResolvedValue([[null]]) },
    });

    mockGetConnection.mockResolvedValue(conn);

    const result = await CloudPreviewService.previewCloudData({
      ...BASE_OPTIONS,
      objectPath: 's3://bucket/unknown-file',
    });

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/unsupported|undetectable/i);
    expect(mockReleaseConnection).toHaveBeenCalledWith(conn);
  });

  // ── Performance settings ────────────────────────────────────────────────────

  it('sets enable_http_metadata_cache and enable_object_cache on every call', async () => {
    const executedQueries: string[] = [];

    const conn = {
      run: jest.fn().mockImplementation(async (sql: string) => {
        executedQueries.push(sql);
        if (sql.includes('COUNT(*)')) return { getRows: jest.fn().mockResolvedValue([[0]]) };
        if (sql.includes('DESCRIBE')) return { getRows: jest.fn().mockResolvedValue(DESCRIBE_ROWS) };
        return {
          schema: { fields: [{ name: 'id', type: 'INTEGER' }] },
          getRows: jest.fn().mockResolvedValue([]),
        };
      }),
    };

    mockGetConnection.mockResolvedValue(conn);

    await CloudPreviewService.previewCloudData({
      ...BASE_OPTIONS,
      objectPath: `s3://bucket/perf-${Date.now()}.csv`,
    });

    expect(executedQueries).toContain('SET enable_http_metadata_cache = true');
    expect(executedQueries).toContain('SET enable_object_cache = true');
  });
});
