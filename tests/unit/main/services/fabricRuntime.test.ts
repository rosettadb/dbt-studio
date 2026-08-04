import FabricRuntime from '../../../../src/main/services/fabric/fabricRuntime';
import { FabricSparkConnection } from '../../../../src/types/backend';

const connection: FabricSparkConnection = {
  type: 'fabricspark',
  name: 'Fabric test',
  endpoint: 'https://api.fabric.microsoft.com/v1',
  workspaceId: '11111111-1111-4111-8111-111111111111',
  lakehouseId: '22222222-2222-4222-8222-222222222222',
  lakehouse: 'analytics',
  schemaMode: 'schema-enabled',
  schema: 'dbo',
  authentication: 'SPN',
  tenantId: '33333333-3333-4333-8333-333333333333',
  clientId: '44444444-4444-4444-8444-444444444444',
  hasClientSecret: true,
  threads: 1,
  reuseSession: true,
};

const response = (
  body: Record<string, unknown>,
  options: { status?: number; headers?: Record<string, string> } = {},
) => ({
  ok: (options.status ?? 200) < 400,
  status: options.status ?? 200,
  headers: {
    get: (name: string) => options.headers?.[name.toLowerCase()] ?? null,
  },
  json: jest.fn().mockResolvedValue(body),
  text: jest.fn().mockResolvedValue(JSON.stringify(body)),
});

describe('FabricRuntime', () => {
  beforeEach(async () => {
    await FabricRuntime.disposeAll();
    jest.restoreAllMocks();
    delete (global as any).fetch;
    if (!(AbortSignal as any).timeout) {
      (AbortSignal as any).timeout = () => new AbortController().signal;
    }
  });

  it('uses a fixed Base64 Spark harness and returns bounded typed rows', async () => {
    const query = 'SELECT customer_secret FROM dbo.customers';
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce(
        response({ access_token: 'token', expires_in: 3600 }),
      )
      .mockResolvedValueOnce(
        response(
          { id: 7 },
          {
            status: 202,
            headers: { location: '/sessions/7' },
          },
        ),
      )
      .mockResolvedValueOnce(response({ id: 7, state: 'idle' }))
      .mockResolvedValueOnce(response({ id: 3 }, { status: 202 }))
      .mockResolvedValueOnce(
        response({
          id: 3,
          state: 'available',
          output: {
            status: 'ok',
            data: {
              'text/plain':
                '__DBT_STUDIO_FABRIC_RESULT_V1__{"fields":[{"name":"customer_secret","typeName":"string","nullable":true}],"rows":[{"customer_secret":"redacted-value"}],"truncated":false}',
            },
          },
        }),
      );
    (global as any).fetch = fetchMock;

    const progress: string[] = [];
    const result = await FabricRuntime.executeSparkSql(
      'fabric-runtime-test',
      connection,
      { clientSecret: 'client-secret' },
      query,
      {
        rowLimit: 10,
        onProgress: (stage) => progress.push(stage),
      },
    );

    expect(result).toMatchObject({
      success: true,
      rowCount: 1,
      truncated: false,
      statementId: 3,
    });
    expect(result.fields?.[0]).toMatchObject({
      name: 'customer_secret',
      typeName: 'string',
      nullable: true,
    });
    const statementRequest = fetchMock.mock.calls[3][1];
    const statementBody = JSON.parse(String(statementRequest.body));
    expect(statementBody.code).toContain(
      Buffer.from(query, 'utf8').toString('base64'),
    );
    expect(statementBody.code).not.toContain(query);
    expect(progress).toEqual(
      expect.arrayContaining([
        'authenticating',
        'starting-session',
        'executing',
        'reading-results',
        'completed',
      ]),
    );
  });

  it('normalizes authorization failures without returning tokens', async () => {
    (global as any).fetch = jest
      .fn()
      .mockResolvedValueOnce(
        response(
          { error: { message: 'principal is forbidden' } },
          { status: 403 },
        ) as any,
      );

    const result = await FabricRuntime.executeSparkSql(
      'fabric-runtime-auth-test',
      connection,
      { clientSecret: 'client-secret' },
      'SELECT 1',
    );

    expect(result).toEqual({
      success: false,
      error:
        'The Microsoft Fabric identity does not have the required workspace or Lakehouse permission.',
      errorCode: 'FABRIC_PERMISSION_DENIED',
    });
    expect(JSON.stringify(result)).not.toContain('client-secret');
  });

  it('refreshes an expired Fabric token once after a 401', async () => {
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce(
        response({ access_token: 'expired-token', expires_in: 3600 }),
      )
      .mockResolvedValueOnce(
        response({ error: { message: 'expired' } }, { status: 401 }),
      )
      .mockResolvedValueOnce(
        response({ access_token: 'fresh-token', expires_in: 3600 }),
      )
      .mockResolvedValueOnce(response({ id: 8 }, { status: 202 }))
      .mockResolvedValueOnce(response({ id: 8, state: 'idle' }))
      .mockResolvedValueOnce(response({ id: 4 }, { status: 202 }))
      .mockResolvedValueOnce(
        response({
          id: 4,
          state: 'available',
          output: {
            status: 'ok',
            data: {
              'text/plain':
                '__DBT_STUDIO_FABRIC_RESULT_V1__{"fields":[],"rows":[],"truncated":false}',
            },
          },
        }),
      );
    (global as any).fetch = fetchMock;

    const result = await FabricRuntime.executeSparkSql(
      'fabric-runtime-refresh-test',
      connection,
      { clientSecret: 'client-secret' },
      'SELECT 1',
    );

    expect(result.success).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(7);
    expect(fetchMock.mock.calls[3][1].headers.Authorization).toBe(
      'Bearer fresh-token',
    );
  });

  it('deduplicates concurrent token acquisition for one identity and scope', async () => {
    const fetchMock = jest
      .fn()
      .mockResolvedValue(
        response({ access_token: 'shared-token', expires_in: 3600 }),
      );
    (global as any).fetch = fetchMock;

    const acquireToken = (FabricRuntime as any).acquireToken.bind(
      FabricRuntime,
    );
    const tokens = await Promise.all([
      acquireToken(
        'fabric-runtime-token-test',
        connection,
        { clientSecret: 'client-secret' },
        'scope',
      ),
      acquireToken(
        'fabric-runtime-token-test',
        connection,
        { clientSecret: 'client-secret' },
        'scope',
      ),
    ]);

    expect(tokens).toEqual(['shared-token', 'shared-token']);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
