/* eslint-disable import/first */
jest.mock('snowflake-sdk', () => ({
  createConnection: jest.fn(),
}));

jest.mock('openai', () => ({
  OpenAI: jest.fn(),
}));

// Stub @aws-sdk (pulled in via cloudExplorer.service in the import graph;
// the real dist-cjs bundle cannot be parsed by jest). Only the names used at
// module scope need to exist.
jest.mock('@aws-sdk/client-s3', () => {
  const Dummy = class {};
  return {
    S3Client: Dummy,
    ListBucketsCommand: Dummy,
    ListObjectsV2Command: Dummy,
    ListObjectsCommand: Dummy,
    GetObjectCommand: Dummy,
    PutObjectCommand: Dummy,
    CreateMultipartUploadCommand: Dummy,
    UploadPartCommand: Dummy,
    CompleteMultipartUploadCommand: Dummy,
    AbortMultipartUploadCommand: Dummy,
    DeleteObjectCommand: Dummy,
    DeleteObjectsCommand: Dummy,
    CreateBucketCommand: Dummy,
    DeleteBucketCommand: Dummy,
    ListObjectVersionsCommand: Dummy,
    HeadBucketCommand: Dummy,
  };
});

jest.mock('@aws-sdk/s3-request-presigner', () => ({
  getSignedUrl: jest.fn(),
}));

// os.homedir() does not reliably follow process.env.HOME on every platform,
// so redirect it directly for a hermetic cache location. (Prefixed `mock`
// to satisfy jest's factory scoping rules.)
let mockHome = '';
jest.mock('os', () => {
  const actual = jest.requireActual('os') as Record<string, unknown>;
  return {
    ...actual,
    homedir: () => mockHome || (actual.homedir as () => string)(),
  };
});

const mockConnections: any[] = [];

jest.mock('../../../../src/main/database', () => ({
  __esModule: true,
  default: {
    getField: jest.fn((key: string) =>
      Promise.resolve(key === 'connections' ? mockConnections : undefined),
    ),
    updateField: jest.fn(),
  },
}));

jest.mock('../../../../src/main/services/index', () => ({
  ProjectsService: {
    loadProjects: jest.fn().mockResolvedValue([]),
    updateProject: jest.fn(),
  },
}));

jest.mock('../../../../src/main/services/secureStorage.service', () => ({
  __esModule: true,
  default: {
    setCredential: jest.fn(),
    getCredential: jest.fn(),
    deleteCredential: jest.fn(),
  },
}));

// Import after mocks.
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { createHash } from 'crypto';
import * as yaml from 'js-yaml';
import * as snowflake from 'snowflake-sdk';

import {
  SNOWFLAKE_REAUTH_MESSAGE,
  SnowflakeAuthManager,
} from '../../../../src/main/utils/snowflakeAuth';
import ConnectorsService from '../../../../src/main/services/connectors.service';
import { updateProfilesYml } from '../../../../src/main/utils/yamlPartialUpdate';

const oauthConnection = {
  id: 'conn-oauth-1',
  connection: {
    type: 'snowflake',
    name: 'snowflake web login',
    account: 'xy12345.us-east-2.aws',
    username: 'alice',
    warehouse: 'COMPUTE_WH',
    database: 'DB',
    schema: 'PUBLIC',
    role: 'SYSADMIN',
    authMethod: 'oauth_browser',
  },
} as any;

const passwordConnection = {
  id: 'conn-pw-1',
  connection: {
    type: 'snowflake',
    name: 'snowflake pw',
    account: 'xy12345.us-east-2.aws',
    username: 'alice',
    password: 'secret',
    warehouse: 'COMPUTE_WH',
    database: 'DB',
    schema: 'PUBLIC',
    authMethod: 'password',
  },
} as any;

function writeCacheFile(dir: string, content: unknown): void {
  let cacheDir = path.join(dir, '.cache', 'snowflake');
  if (process.platform === 'win32') {
    cacheDir = path.join(dir, 'AppData', 'Local', 'Snowflake', 'Caches');
  } else if (process.platform === 'darwin') {
    cacheDir = path.join(dir, 'Library', 'Caches', 'Snowflake');
  }
  fs.mkdirSync(cacheDir, { recursive: true });
  fs.writeFileSync(
    path.join(cacheDir, 'credential_cache_v1.json'),
    typeof content === 'string' ? content : JSON.stringify(content),
    'utf8',
  );
}

const accountHost = 'xy12345.us-east-2.aws.snowflakecomputing.com';
const accountUrl = `https://${accountHost}`;
const keyHash = createHash('sha256')
  .update(
    JSON.stringify({
      snowflakeHost: accountHost,
      username: 'alice',
      oauthIdpUrl: `${accountUrl}/oauth/token-request`,
      role: 'sysadmin',
    }),
  )
  .digest('hex');

const pairCache = (hash: string, accessToken = 'access-123') => ({
  tokens: {
    [`SnowflakeTokenCache.v2.OauthAccessToken.${hash}`]: accessToken,
    [`SnowflakeTokenCache.v2.OauthRefreshToken.${hash}`]: 'refresh-123',
  },
});

describe('Snowflake dbt token bridge', () => {
  let tmpHome = '';
  const originalUserProfile = process.env.USERPROFILE;

  beforeEach(() => {
    tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), 'snow-bridge-test-'));
    mockHome = tmpHome;
    if (process.platform === 'win32') process.env.USERPROFILE = tmpHome;
    (snowflake.createConnection as jest.Mock).mockImplementation((options) => {
      options.host = accountHost;
      options.accessUrl = accountUrl;
      return {
        connectAsync: jest.fn((callback) => callback(null)),
        destroy: jest.fn((callback) => callback(null)),
      };
    });
    mockConnections.length = 0;
    delete process.env['db-token-snowflake web login'];
  });

  afterEach(() => {
    mockHome = '';
    if (process.platform === 'win32') {
      if (originalUserProfile === undefined) delete process.env.USERPROFILE;
      else process.env.USERPROFILE = originalUserProfile;
    }
    jest.clearAllMocks();
    delete process.env['db-token-snowflake web login'];
    fs.rmSync(tmpHome, { recursive: true, force: true });
  });

  it('reads the named connection token after a silent SDK connection', async () => {
    writeCacheFile(tmpHome, pairCache(keyHash));
    expect(SnowflakeAuthManager.hasSnowflakeToken()).toBe(true);
    await expect(
      SnowflakeAuthManager.readCachedOAuthAccessToken(
        oauthConnection.connection,
      ),
    ).resolves.toBe('access-123');
    const options = (snowflake.createConnection as jest.Mock).mock.calls[0][0];
    expect(options.openExternalBrowserCallback).toEqual(expect.any(Function));
    expect(() =>
      options.openExternalBrowserCallback('https://example.com'),
    ).toThrow(SNOWFLAKE_REAUTH_MESSAGE);
  });

  it('returns null without a cache file or with malformed JSON', async () => {
    await expect(
      SnowflakeAuthManager.readCachedOAuthAccessToken(
        oauthConnection.connection,
      ),
    ).resolves.toBeNull();
    writeCacheFile(tmpHome, 'not-json{{{');
    await expect(
      SnowflakeAuthManager.readCachedOAuthAccessToken(
        oauthConnection.connection,
      ),
    ).resolves.toBeNull();
  });

  it('selects only the matching identity when multiple accounts are cached', async () => {
    writeCacheFile(tmpHome, {
      tokens: {
        ...pairCache(keyHash).tokens,
        ...pairCache('other-account', 'wrong-token').tokens,
      },
    });
    await expect(
      SnowflakeAuthManager.readCachedOAuthAccessToken(
        oauthConnection.connection,
      ),
    ).resolves.toBe('access-123');
    writeCacheFile(tmpHome, pairCache('other-account', 'wrong-token'));
    await expect(
      SnowflakeAuthManager.readCachedOAuthAccessToken(
        oauthConnection.connection,
      ),
    ).resolves.toBeNull();
  });

  it('returns null when the matching access token has no paired refresh token', async () => {
    writeCacheFile(tmpHome, {
      tokens: {
        [`SnowflakeTokenCache.v2.OauthAccessToken.${keyHash}`]: 'access-123',
      },
    });
    await expect(
      SnowflakeAuthManager.readCachedOAuthAccessToken(
        oauthConnection.connection,
      ),
    ).resolves.toBeNull();
  });

  it('does not read a token when the silent SDK connection fails', async () => {
    writeCacheFile(tmpHome, pairCache(keyHash));
    (snowflake.createConnection as jest.Mock).mockImplementationOnce(
      (options) => {
        options.host = accountHost;
        options.accessUrl = accountUrl;
        return {
          connectAsync: jest.fn((callback) => callback(new Error('expired'))),
          destroy: jest.fn((callback) => callback(null)),
        };
      },
    );
    await expect(
      SnowflakeAuthManager.readCachedOAuthAccessToken(
        oauthConnection.connection,
      ),
    ).resolves.toBeNull();
  });

  it('materializes the token env for oauth connections with a warm cache', async () => {
    mockConnections.push(oauthConnection);
    writeCacheFile(tmpHome, pairCache(keyHash));
    const ok = await ConnectorsService.materializeSnowflakeOAuthEnv(
      'snowflake web login',
    );
    expect(ok).toBe(true);
    expect(process.env['db-token-snowflake web login']).toBe('access-123');
  });

  it('materialize clears a stale OAuth env token when the cache is cold', async () => {
    mockConnections.push(oauthConnection, passwordConnection);
    process.env['db-token-snowflake web login'] = 'stale-access-token';
    expect(
      await ConnectorsService.materializeSnowflakeOAuthEnv(
        'snowflake web login',
      ),
    ).toBe(false);
    expect(process.env['db-token-snowflake web login']).toBeUndefined();
    expect(
      await ConnectorsService.materializeSnowflakeOAuthEnv('snowflake pw'),
    ).toBe(false);
    expect(await ConnectorsService.materializeSnowflakeOAuthEnv('nope')).toBe(
      false,
    );
    expect(await ConnectorsService.materializeSnowflakeOAuthEnv('')).toBe(
      false,
    );
  });

  it('generates oauth+token profiles with no password for dbt', async () => {
    const yml = await ConnectorsService.generateProfilesYml(
      'snowflake_web',
      oauthConnection.connection,
    );
    const parsed = yaml.load(yml) as any;
    const { dev } = parsed.snowflake_web.outputs;
    expect(dev.authenticator).toBe('oauth');
    expect(dev.token).toBe('{{ env_var("db-token-snowflake web login") }}');
    expect(dev.password).toBeUndefined();
    expect(dev.client_store_temporary_credential).toBeUndefined();
    expect(JSON.stringify(parsed)).not.toContain('oauth_authorization_code');
  });

  it('partial update migrates a stale password profile to oauth+token', async () => {
    const projectPath = await fs.promises.mkdtemp(
      path.join(os.tmpdir(), 'snow-bridge-profiles-'),
    );
    try {
      await fs.promises.writeFile(
        path.join(projectPath, 'profiles.yml'),
        yaml.dump({
          snowflake_web: {
            target: 'dev',
            outputs: {
              dev: {
                type: 'snowflake',
                password: '{{ env_var("db-password-snowflake web login") }}',
                authenticator: 'oauth_authorization_code',
                client_store_temporary_credential: true,
              },
            },
          },
        }),
        'utf8',
      );
      await updateProfilesYml(
        projectPath,
        'snowflake_web',
        oauthConnection.connection,
      );
      const result = yaml.load(
        await fs.promises.readFile(
          path.join(projectPath, 'profiles.yml'),
          'utf8',
        ),
      ) as any;
      const { dev } = result.snowflake_web.outputs;
      expect(dev.authenticator).toBe('oauth');
      expect(dev.token).toBe('{{ env_var("db-token-snowflake web login") }}');
      expect(dev.password).toBeUndefined();
      expect(dev.client_store_temporary_credential).toBeUndefined();
    } finally {
      await fs.promises.rm(projectPath, { recursive: true, force: true });
    }
  });
});
