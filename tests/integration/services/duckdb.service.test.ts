import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import DuckDBBootstrap from '../../../src/main/services/duckdb.service';

// Mock electron setup
// We need to define the path outside the mock to be used in tests,
// but we also need to use it inside the mock factory.
const TEST_DIR_NAME = 'dbt-studio-duckdb-test';
const TEST_DIR_PATH = path.join(os.tmpdir(), TEST_DIR_NAME);

// Jest mock hoisting means this runs before imports (mostly), but we can use require inside.
jest.mock('electron', () => {
  // eslint-disable-next-line global-require
  const osModule = require('os');
  // eslint-disable-next-line global-require
  const pathModule = require('path');
  const testPath = pathModule.join(osModule.tmpdir(), 'dbt-studio-duckdb-test');

  return {
    app: {
      getPath: jest.fn().mockReturnValue(testPath),
    },
  };
});

describe('DuckDB Service Integration', () => {
  // Ensure test directory exists before running tests
  beforeAll(() => {
    if (!fs.existsSync(TEST_DIR_PATH)) {
      fs.mkdirSync(TEST_DIR_PATH, { recursive: true });
    }
  });

  // Thorough cleanup after all tests
  afterAll(async () => {
    await DuckDBBootstrap.shutdown();
    try {
      if (fs.existsSync(TEST_DIR_PATH)) {
        fs.rmSync(TEST_DIR_PATH, { recursive: true, force: true });
      }
    } catch (e) {
      // eslint-disable-next-line no-console
      console.warn('Could not cleanup test directory:', e);
    }
  });

  // CRITICAL: Reset the singleton state before EACH test.
  // The service is a singleton. If one test shuts it down or leaves it in a weird state,
  // the next test fails. reinitialize() forces a fresh start.
  beforeEach(async () => {
    await DuckDBBootstrap.reinitialize();
  });

  // We do NOT shut down after each test to avoid race conditions or
  // leaving the promise in a resolved-but-stopped state if we didn't use reinitialize.
  // reinitialize() handles the shutdown of the previous instance if needed.

  it('should initialize and create a database file', async () => {
    // reinitialize() in beforeEach already did the work
    const dbPath = path.join(TEST_DIR_PATH, 'main.duckdb');

    // Check if the file exists
    expect(fs.existsSync(dbPath)).toBe(true);

    const metadata = await DuckDBBootstrap.getMetadata();
    expect(metadata.status).toBe('ready');
    expect(metadata.path).toBe(dbPath);
  });

  it('should get a connection and execute a query', async () => {
    const connection = await DuckDBBootstrap.getConnection('test');

    try {
      const result = await connection.run('SELECT 1 as val');
      const rows = await result.getRows();

      let val;
      if (rows.length > 0) {
        const [row] = rows;
        if (Array.isArray(row)) {
          const [firstValue] = row;
          val = firstValue;
        } else if (row && typeof row === 'object') {
          val = (row as any).val;
        } else {
          val = row;
        }
      }
      expect(val).toBe(1);
    } finally {
      await DuckDBBootstrap.releaseConnection(connection);
    }
  });

  it('should handle connection pooling and release', async () => {
    const conn1 = await DuckDBBootstrap.getConnection('c1');
    const conn2 = await DuckDBBootstrap.getConnection('c2');

    const metadata = await DuckDBBootstrap.getMetadata();
    expect(metadata.activeConnections).toBeGreaterThanOrEqual(2);

    await DuckDBBootstrap.releaseConnection(conn1);
    const metadataAfterRelease = await DuckDBBootstrap.getMetadata();
    expect(metadataAfterRelease.activeConnections).toBeLessThan(
      metadata.activeConnections,
    );

    await DuckDBBootstrap.releaseConnection(conn2);
  });

  it('should use withConnection helper', async () => {
    const result = await DuckDBBootstrap.withConnection(async (conn) => {
      const res = await conn.run("SELECT 'test_string' as str");
      const rows = await res.getRows();
      return rows[0];
    }, 'test-helper');

    // Check result structure again
    let str;
    if (Array.isArray(result)) {
      const [firstValue] = result;
      str = firstValue;
    } else if (result && typeof result === 'object') {
      str = (result as any).str;
    } else {
      str = result;
    }

    expect(str).toBe('test_string');

    // Verify connection is released
    const metadata = await DuckDBBootstrap.getMetadata();
    expect(metadata.activeConnections).toBe(0);
  });
});
