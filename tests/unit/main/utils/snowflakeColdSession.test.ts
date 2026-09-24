/* eslint-disable import/first */
jest.mock('snowflake-sdk', () => ({
  createConnection: jest.fn(),
}));

// Import after mock so the modules under test use the mocked SDK.
import * as snowflake from 'snowflake-sdk';
import { executeSnowflakeQuery } from '../../../../src/main/utils/connectors';
import SnowflakeExtractor from '../../../../src/main/extractor/snowflake.extractor';
import {
  SNOWFLAKE_REAUTH_MESSAGE,
  SnowflakeAuthManager,
} from '../../../../src/main/utils/snowflakeAuth';

const createConnectionMock = snowflake.createConnection as jest.Mock;

const oauthConfig = {
  type: 'snowflake',
  name: 'snowflake web login',
  account: 'xy12345.us-east-2.aws',
  username: 'alice',
  warehouse: 'COMPUTE_WH',
  database: 'DB',
  schema: 'PUBLIC',
  role: 'SYSADMIN',
  authMethod: 'oauth_browser',
} as any;

describe('Snowflake cold-session redirect (Option B: auth lives in Connections screen)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest
      .spyOn(SnowflakeAuthManager, 'hasSnowflakeToken')
      .mockReturnValue(false);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('SQL Editor path returns guidance without opening a browser flow', async () => {
    const connection = {
      connectAsync: jest.fn(() => undefined),
      destroy: jest.fn(() => undefined),
    };
    createConnectionMock.mockReturnValueOnce(connection);
    const result = await executeSnowflakeQuery(
      oauthConfig,
      'SELECT CURRENT_USER()',
    );
    expect(result).toEqual({ success: false, error: SNOWFLAKE_REAUTH_MESSAGE });
    // connectAsync never invoked: no browser, no 120s orphan.
    expect(connection.connectAsync).not.toHaveBeenCalled();
  });

  it('schema extract path throws guidance without opening a browser flow', async () => {
    const extractor = new SnowflakeExtractor({
      account: oauthConfig.account,
      username: oauthConfig.username,
      warehouse: oauthConfig.warehouse,
      database: oauthConfig.database,
      schema: oauthConfig.schema,
      role: oauthConfig.role,
      authMethod: 'oauth_browser',
    });
    await expect(extractor.connect()).rejects.toThrow(SNOWFLAKE_REAUTH_MESSAGE);
  });

  it('password mode is unaffected by the session check', async () => {
    const connection = {
      connect: jest.fn((cb: (err: null) => void) => {
        cb(null);
      }),
      destroy: jest.fn(() => undefined),
      execute: jest.fn((opts: { complete: Function }) => {
        opts.complete(null, null, []);
      }),
    };
    createConnectionMock.mockReturnValueOnce(connection);
    const result = await executeSnowflakeQuery(
      { ...oauthConfig, authMethod: 'password', password: 'secret' },
      'SELECT 1',
    );
    expect(createConnectionMock).toHaveBeenCalled();
    expect(result).toEqual({ success: true, data: [], fields: [] });
  });
});
