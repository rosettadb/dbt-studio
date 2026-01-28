const getConnection = jest.fn();
const releaseConnection = jest.fn();

jest.mock('../../../../src/main/services/duckdb.service', () => ({
  __esModule: true,
  default: {
    getConnection: (...args: any[]) => getConnection(...args),
    releaseConnection: (...args: any[]) => releaseConnection(...args),
  },
}));

const setupExtensions = jest.fn();
const buildCloudSecretQuery = jest.fn();
const buildPreviewQuery = jest.fn();
const extractColumns = jest.fn();
const handleProviderError = jest.fn();
const convertDuckDBValue = jest.fn((v) => v);

jest.mock('../../../../src/main/helpers', () => ({
  buildCloudSecretQuery,
  getCloudUrl: jest.fn(),
  isPreviewSupported: jest.fn(),
  handleProviderError,
  convertDuckDBValue,
}));

jest.mock('../../../../src/main/helpers/extensionSetup.helper', () => ({
  buildPreviewQuery,
  extractColumns,
  setupExtensions,
}));

import CloudPreviewService from '../../../../src/main/services/cloudPreview.service';

describe('CloudPreviewService (main)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('runs secret + preview queries and returns converted rows', async () => {
    const connection = {
      run: jest.fn(),
    };

    const result = {
      getRows: jest.fn().mockResolvedValue([[1, 2]]),
    };

    connection.run.mockResolvedValue(result);

    getConnection.mockResolvedValue(connection);

    setupExtensions.mockResolvedValue(undefined);
    buildCloudSecretQuery.mockResolvedValue('SECRET SQL');
    buildPreviewQuery.mockResolvedValue('PREVIEW SQL');
    extractColumns.mockResolvedValue([{ name: 'a' }, { name: 'b' }]);

    const out = await CloudPreviewService.previewCloudData({
      provider: 'aws',
      cloudConfig: { region: 'us-east-1' } as any,
      objectPath: 's3://bucket/file.csv',
      previewType: 'sample',
      limit: 10,
    });

    expect(getConnection).toHaveBeenCalledWith('cloud-preview');
    expect(setupExtensions).toHaveBeenCalledWith(connection, 'aws', 's3://bucket/file.csv');
    expect(buildCloudSecretQuery).toHaveBeenCalledWith('aws', expect.any(Object));
    expect(connection.run).toHaveBeenCalledWith('SECRET SQL');
    expect(buildPreviewQuery).toHaveBeenCalled();
    expect(connection.run).toHaveBeenCalledWith('PREVIEW SQL');

    expect(out).toEqual({
      success: true,
      data: [[1, 2]],
      columns: [{ name: 'a' }, { name: 'b' }],
      totalRows: 1,
      objectPath: 's3://bucket/file.csv',
      previewType: 'sample',
    });

    expect(releaseConnection).toHaveBeenCalledWith(connection);
  });

  it('returns handleProviderError result on failure and releases connection', async () => {
    const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);

    const connection = {
      run: jest.fn().mockRejectedValue(new Error('boom')),
    };

    getConnection.mockResolvedValue(connection);

    handleProviderError.mockReturnValue({
      success: false,
      error: 'mapped',
      objectPath: 's3://bucket/file.csv',
      previewType: 'schema',
      data: [],
      columns: [],
      totalRows: 0,
    });

    const out = await CloudPreviewService.previewCloudData({
      provider: 'aws',
      cloudConfig: {} as any,
      objectPath: 's3://bucket/file.csv',
      previewType: 'schema',
      limit: 10,
    });

    expect(handleProviderError).toHaveBeenCalledWith(
      'aws',
      'boom',
      's3://bucket/file.csv',
      'schema',
    );
    expect(out).toEqual(
      expect.objectContaining({ success: false, error: 'mapped' }),
    );
    expect(releaseConnection).toHaveBeenCalledWith(connection);

    consoleErrorSpy.mockRestore();
  });
});
