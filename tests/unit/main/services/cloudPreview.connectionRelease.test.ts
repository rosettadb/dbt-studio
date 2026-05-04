/**
 * Property-based tests for connection release guarantee
 *
 * Property 6: releaseConnection is called exactly once per getConnection,
 * on every code path — success, validation error, DuckDB runtime error,
 * and connection timeout.
 *
 * DuckDB handles its own caching via enable_http_metadata_cache and
 * enable_object_cache — there is no application-level cache to worry about.
 */

// ─── Mocks (must be declared before any imports) ─────────────────────────────

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
const mockBuildCloudSecretQuery = jest.fn();
const mockHandleProviderError = jest.fn();
const mockConvertDuckDBValue = jest.fn((v: any) => v);

jest.mock('../../../../src/main/helpers', () => ({
  buildCloudSecretQuery: (...args: any[]) => mockBuildCloudSecretQuery(...args),
  getCloudUrl: jest.fn(),
  isPreviewSupported: jest.fn(),
  handleProviderError: (...args: any[]) => mockHandleProviderError(...args),
  convertDuckDBValue: (v: any) => mockConvertDuckDBValue(v),
}));

jest.mock('../../../../src/main/helpers/extensionSetup.helper', () => ({
  setupExtensions: (...args: any[]) => mockSetupExtensions(...args),
}));

// ─── Import after mocks ───────────────────────────────────────────────────────

import CloudPreviewService from '../../../../src/main/services/cloudPreview.service';

// ─── Helpers ──────────────────────────────────────────────────────────────────

let testCounter = 0;
function uniquePath(): string {
  testCounter += 1;
  return `s3://release-test-bucket/file-${testCounter}-${Date.now()}.csv`;
}

const BASE_CLOUD_CONFIG = {
  region: 'us-east-1',
  accessKeyId: 'k',
  secretAccessKey: 's',
} as any;

const DESCRIBE_ROWS = [['id', 'INTEGER', 'YES']];

function makeConn(dispatch: Record<string, any> = {}) {
  return {
    run: jest.fn().mockImplementation(async (sql: string) => {
      const match = Object.keys(dispatch).find((k) => sql.includes(k));
      if (match) return dispatch[match];
      return { getRows: jest.fn().mockResolvedValue([]) };
    }),
  };
}

function happyConn() {
  return makeConn({
    'COUNT(*)': { getRows: jest.fn().mockResolvedValue([[10]]) },
    DESCRIBE: { getRows: jest.fn().mockResolvedValue(DESCRIBE_ROWS) },
    SELECT: {
      schema: { fields: [{ name: 'id', type: 'INTEGER' }] },
      getRows: jest.fn().mockResolvedValue([[1]]),
    },
  });
}

// ─── Property 6 tests ─────────────────────────────────────────────────────────

describe('CloudPreviewService — Property 6: connection always released', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockHandleProviderError.mockReturnValue({
      success: false,
      error: 'mapped',
      objectPath: 'n/a',
      previewType: 'sample',
    });
    mockSetupExtensions.mockResolvedValue(undefined);
    mockBuildCloudSecretQuery.mockResolvedValue('SECRET SQL');
  });

  // ── Happy paths ─────────────────────────────────────────────────────────────

  it('releases connection exactly once on successful sample preview', async () => {
    const conn = happyConn();
    mockGetConnection.mockResolvedValue(conn);

    await CloudPreviewService.previewCloudData({
      provider: 'aws',
      cloudConfig: BASE_CLOUD_CONFIG,
      objectPath: uniquePath(),
      previewType: 'sample',
      pageSize: 25,
      page: 0,
    });

    expect(mockGetConnection).toHaveBeenCalledTimes(1);
    expect(mockReleaseConnection).toHaveBeenCalledTimes(1);
    expect(mockReleaseConnection).toHaveBeenCalledWith(conn);
  });

  it('releases connection exactly once on schema preview', async () => {
    const conn = makeConn({
      DESCRIBE: { getRows: jest.fn().mockResolvedValue(DESCRIBE_ROWS) },
    });
    mockGetConnection.mockResolvedValue(conn);

    await CloudPreviewService.previewCloudData({
      provider: 'aws',
      cloudConfig: BASE_CLOUD_CONFIG,
      objectPath: uniquePath(),
      previewType: 'schema',
    });

    expect(mockGetConnection).toHaveBeenCalledTimes(1);
    expect(mockReleaseConnection).toHaveBeenCalledTimes(1);
    expect(mockReleaseConnection).toHaveBeenCalledWith(conn);
  });

  it('releases connection exactly once on stats preview', async () => {
    const conn = makeConn({
      DESCRIBE: { getRows: jest.fn().mockResolvedValue(DESCRIBE_ROWS) },
      null_count: {
        getRows: jest.fn().mockResolvedValue([[0, 10, '1', '100', '50']]),
      },
    });
    mockGetConnection.mockResolvedValue(conn);

    await CloudPreviewService.previewCloudData({
      provider: 'aws',
      cloudConfig: BASE_CLOUD_CONFIG,
      objectPath: uniquePath(),
      previewType: 'stats',
    });

    expect(mockGetConnection).toHaveBeenCalledTimes(1);
    expect(mockReleaseConnection).toHaveBeenCalledTimes(1);
    expect(mockReleaseConnection).toHaveBeenCalledWith(conn);
  });

  // ── Error paths ─────────────────────────────────────────────────────────────

  it('releases connection exactly once when setupExtensions throws', async () => {
    const consoleErrorSpy = jest
      .spyOn(console, 'error')
      .mockImplementation(() => undefined);

    const conn = makeConn();
    mockGetConnection.mockResolvedValue(conn);
    mockSetupExtensions.mockRejectedValue(new Error('extension load failed'));

    await CloudPreviewService.previewCloudData({
      provider: 'aws',
      cloudConfig: BASE_CLOUD_CONFIG,
      objectPath: uniquePath(),
      previewType: 'sample',
    });

    expect(mockGetConnection).toHaveBeenCalledTimes(1);
    expect(mockReleaseConnection).toHaveBeenCalledTimes(1);
    expect(mockReleaseConnection).toHaveBeenCalledWith(conn);

    consoleErrorSpy.mockRestore();
  });

  it('releases connection exactly once when buildCloudSecretQuery throws', async () => {
    const consoleErrorSpy = jest
      .spyOn(console, 'error')
      .mockImplementation(() => undefined);

    const conn = makeConn();
    mockGetConnection.mockResolvedValue(conn);
    mockBuildCloudSecretQuery.mockRejectedValue(
      new Error('invalid credentials'),
    );

    await CloudPreviewService.previewCloudData({
      provider: 'aws',
      cloudConfig: BASE_CLOUD_CONFIG,
      objectPath: uniquePath(),
      previewType: 'sample',
    });

    expect(mockGetConnection).toHaveBeenCalledTimes(1);
    expect(mockReleaseConnection).toHaveBeenCalledTimes(1);
    expect(mockReleaseConnection).toHaveBeenCalledWith(conn);

    consoleErrorSpy.mockRestore();
  });

  it('releases connection exactly once when the main SELECT query throws', async () => {
    const consoleErrorSpy = jest
      .spyOn(console, 'error')
      .mockImplementation(() => undefined);

    const conn = {
      run: jest.fn().mockImplementation(async (sql: string) => {
        if (
          sql.startsWith('SET') ||
          sql.includes('SECRET') ||
          sql.includes('DROP SECRET')
        ) {
          return { getRows: jest.fn().mockResolvedValue([]) };
        }
        if (sql.includes('DESCRIBE')) {
          return { getRows: jest.fn().mockResolvedValue(DESCRIBE_ROWS) };
        }
        if (sql.includes('SELECT')) {
          throw new Error('DuckDB runtime error');
        }
        return { getRows: jest.fn().mockResolvedValue([]) };
      }),
    };

    mockGetConnection.mockResolvedValue(conn);

    await CloudPreviewService.previewCloudData({
      provider: 'aws',
      cloudConfig: BASE_CLOUD_CONFIG,
      objectPath: uniquePath(),
      previewType: 'sample',
    });

    expect(mockGetConnection).toHaveBeenCalledTimes(1);
    expect(mockReleaseConnection).toHaveBeenCalledTimes(1);
    expect(mockReleaseConnection).toHaveBeenCalledWith(conn);

    consoleErrorSpy.mockRestore();
  });

  it('releases connection exactly once when WHERE clause validation throws', async () => {
    const consoleErrorSpy = jest
      .spyOn(console, 'error')
      .mockImplementation(() => undefined);

    const conn = makeConn();
    mockGetConnection.mockResolvedValue(conn);

    await CloudPreviewService.previewCloudData({
      provider: 'aws',
      cloudConfig: BASE_CLOUD_CONFIG,
      objectPath: uniquePath(),
      previewType: 'sample',
      whereClause: 'col = SECRET',
    });

    expect(mockGetConnection).toHaveBeenCalledTimes(1);
    expect(mockReleaseConnection).toHaveBeenCalledTimes(1);
    expect(mockReleaseConnection).toHaveBeenCalledWith(conn);

    consoleErrorSpy.mockRestore();
  });

  // ── No connection acquired ──────────────────────────────────────────────────

  it('does NOT call releaseConnection when getConnection itself throws (timeout)', async () => {
    const consoleErrorSpy = jest
      .spyOn(console, 'error')
      .mockImplementation(() => undefined);

    mockGetConnection.mockRejectedValue(
      new Error('Connection pool timeout: system is busy, please try again'),
    );

    await CloudPreviewService.previewCloudData({
      provider: 'aws',
      cloudConfig: BASE_CLOUD_CONFIG,
      objectPath: uniquePath(),
      previewType: 'sample',
    });

    expect(mockGetConnection).toHaveBeenCalledTimes(1);
    expect(mockReleaseConnection).not.toHaveBeenCalled();

    consoleErrorSpy.mockRestore();
  });

  // ── Multiple independent calls ──────────────────────────────────────────────

  it('releases exactly N connections for N independent calls', async () => {
    const N = 5;
    const conn = happyConn();
    mockGetConnection.mockResolvedValue(conn);

    await Promise.all(
      Array.from({ length: N }, () =>
        CloudPreviewService.previewCloudData({
          provider: 'aws',
          cloudConfig: BASE_CLOUD_CONFIG,
          objectPath: uniquePath(),
          previewType: 'sample',
          pageSize: 25,
          page: 0,
        }),
      ),
    );

    expect(mockGetConnection).toHaveBeenCalledTimes(N);
    expect(mockReleaseConnection).toHaveBeenCalledTimes(N);
  });

});
