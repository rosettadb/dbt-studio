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
import * as yaml from 'js-yaml';

import { SnowflakeAuthManager } from '../../../../src/main/utils/snowflakeAuth';
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
  const cacheDir = path.join(dir, 'Library', 'Caches', 'Snowflake');
  fs.mkdirSync(cacheDir, { recursive: true });
  fs.writeFileSync(
    path.join(cacheDir, 'credential_cache_v1.json'),
    typeof content === 'string' ? content : JSON.stringify(content),
    'utf8',
  );
}

const pairCache = (hash: string) => ({
  tokens: {
    [`SnowflakeTokenCache.v2.OauthAccessToken.${hash}`]: 'access-123',
    [`SnowflakeTokenCache.v2.OauthRefreshToken.${hash}`]: 'refresh-123',
  },
});

describe('Snowflake dbt token bridge', () => {
  let tmpHome = '';

  beforeEach(() => {
    tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), 'snow-bridge-test-'));
    mockHome = tmpHome;
    mockConnections.length = 0;
    delete process.env['db-token-snowflake web login'];
  });

  afterEach(() => {
    mockHome = '';
    delete process.env['db-token-snowflake web login'];
    fs.rmSync(tmpHome, { recursive: true, force: true });
  });

  it('reads the live access token from a single cached pair', () => {
    writeCacheFile(tmpHome, pairCache('aaa'));
    expect(SnowflakeAuthManager.readCachedOAuthAccessToken()).toBe(
      'access-123',
    );
  });

  it('returns null without a cache file, with malformed JSON, or with ambiguity', () => {
    expect(SnowflakeAuthManager.readCachedOAuthAccessToken()).toBeNull();
    writeCacheFile(tmpHome, 'not-json{{{');
    expect(SnowflakeAuthManager.readCachedOAuthAccessToken()).toBeNull();
    writeCacheFile(tmpHome, {
      tokens: {
        ...pairCache('aaa').tokens,
        ...pairCache('bbb').tokens,
      },
    });
    expect(SnowflakeAuthManager.readCachedOAuthAccessToken()).toBeNull();
  });

  it('returns null when the access token has no paired refresh token', () => {
    writeCacheFile(tmpHome, {
      tokens: { 'SnowflakeTokenCache.v2.OauthAccessToken.aaa': 'access-123' },
    });
    expect(SnowflakeAuthManager.readCachedOAuthAccessToken()).toBeNull();
  });

  it('materializes the token env for oauth connections with a warm cache', async () => {
    mockConnections.push(oauthConnection);
    writeCacheFile(tmpHome, pairCache('aaa'));
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
