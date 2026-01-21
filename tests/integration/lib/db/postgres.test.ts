import * as path from 'path';
import * as os from 'os';

import {
  testPostgresConnection,
  executePostgresQuery,
} from '../../../../src/main/utils/connectors';
import { PostgresConnection } from '../../../../src/types/backend';

// Mock electron to prevent MainDatabaseService crash on import
jest.mock('electron', () => ({
  app: {
    getPath: jest
      .fn()
      .mockReturnValue(path.join(os.tmpdir(), 'dbt-studio-postgres-test')),
  },
}));

// Mock other connectors to avoid native module issues (lz4/xxhash from databricks)
jest.mock('@databricks/sql', () => ({
  DBSQLClient: jest.fn(),
}));

jest.mock('snowflake-sdk', () => ({
  createConnection: jest.fn(),
}));

jest.mock('@google-cloud/bigquery', () => ({
  BigQuery: jest.fn(),
}));

const { GenericContainer } = require('testcontainers');

describe('PostgreSQL Connector Integration', () => {
  // Increase timeout for container startup (must exceed withStartupTimeout of 120000)
  jest.setTimeout(130000);

  let container: any;
  let config: PostgresConnection;

  beforeAll(async () => {
    try {
      // eslint-disable-next-line no-console
      console.log('Starting PostgreSQL container...');
      container = await new GenericContainer('postgres:14')
        .withEnvironment({
          POSTGRES_USER: 'testuser',
          POSTGRES_PASSWORD: 'testpassword',
          POSTGRES_DB: 'testdb',
        })
        .withExposedPorts(5432)
        .withStartupTimeout(120000)
        .start();

      // eslint-disable-next-line no-console
      console.log('PostgreSQL container started.');

      config = {
        name: 'Test Postgres',
        type: 'postgres',
        host: container.getHost(),
        port: container.getMappedPort(5432),
        username: 'testuser',
        password: 'testpassword',
        database: 'testdb',
        schema: 'public', // Default schema
      };
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('Failed to start PostgreSQL container:', error);
      // If container fails, tests will fail
      throw error;
    }
  });

  afterAll(async () => {
    if (container) {
      await container.stop();
    }
  });

  it('should connect successfully using testPostgresConnection', async () => {
    const result = await testPostgresConnection(config);
    expect(result).toBe(true);
  });

  it('should fail connection with wrong password', async () => {
    const badConfig = { ...config, password: 'wrong' };
    await expect(testPostgresConnection(badConfig)).rejects.toThrow();
  });

  it('should execute queries using executePostgresQuery', async () => {
    // 1. Create Table
    const createResult = await executePostgresQuery(
      config,
      `
            CREATE TABLE IF NOT EXISTS test_users (
                id SERIAL PRIMARY KEY,
                name VARCHAR(100),
                email VARCHAR(100)
            )
        `,
    );
    expect(createResult.success).toBe(true);

    // 2. Insert Data
    const insertResult = await executePostgresQuery(
      config,
      `
            INSERT INTO test_users (name, email) VALUES 
            ('Alice', 'alice@example.com'),
            ('Bob', 'bob@example.com')
        `,
    );
    expect(insertResult.success).toBe(true);

    // 3. Select Data
    const selectResult = await executePostgresQuery(
      config,
      'SELECT * FROM test_users ORDER BY id',
    );
    expect(selectResult.success).toBe(true);
    expect(selectResult.data).toHaveLength(2);

    // Check fields structure
    expect(selectResult.fields).toBeDefined();
    // Just checking basic properties of fields
    expect(selectResult.fields?.some((f: any) => f.name === 'name')).toBe(true);

    // Access rows - they verify the data inserted
    const rows = selectResult.data as any[];
    expect(rows[0].name).toBe('Alice');
    expect(rows[1].name).toBe('Bob');
  });

  it('should handle query errors', async () => {
    const result = await executePostgresQuery(
      config,
      'SELECT * FROM non_existent_table',
    );
    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
  });
});
