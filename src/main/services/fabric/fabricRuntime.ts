/* eslint-disable max-classes-per-file, no-await-in-loop, no-restricted-syntax, no-continue, class-methods-use-this */
import { spawn } from 'child_process';
import {
  Column,
  FabricSparkConnection,
  QueryResponseType,
  QueryProgressStage,
  Table,
} from '../../../types/backend';

const FABRIC_SCOPE = 'https://analysis.windows.net/powerbi/api/.default';
const STORAGE_SCOPE = 'https://storage.azure.com/.default';
const ONELAKE_TABLE_BASE = 'https://onelake.table.fabric.microsoft.com/delta';
const LIVY_API_VERSION = '2023-12-01';
const HTTP_TIMEOUT_MS = 30_000;
const SESSION_START_TIMEOUT_MS = 5 * 60_000;
const STATEMENT_TIMEOUT_MS = 10 * 60_000;
const RESULT_MARKER = '__DBT_STUDIO_FABRIC_RESULT_V1__';
const DEFAULT_ROW_LIMIT = 1_000;
const MAX_ROW_OFFSET = 10_000_000;
const MAX_METADATA_TABLES = 5_000;
const METADATA_CACHE_TTL_MS = 60_000;
const MAX_RESULT_BYTES = 5 * 1024 * 1024;
const MAX_CELL_CHARACTERS = 100_000;
const SESSION_IDLE_TIMEOUT_MS = 15 * 60_000;

type TokenEntry = { token: string; expiresAt: number };
type FabricAuth = { clientSecret?: string };
type LivySession = {
  id: number;
  lastUsedAt: number;
  connection: FabricSparkConnection;
  token: string;
};
type JsonRecord = Record<string, any>;

type ExecutionControl = {
  abortController: AbortController;
  cancelled: boolean;
  cancelRemote?: () => Promise<void>;
};

export type FabricExecutionOptions = {
  rowLimit?: number;
  offset?: number;
  registerCancel?: (cancel: () => Promise<void>) => void;
  onProgress?: (stage: QueryProgressStage, message: string) => void;
};

const delay = (milliseconds: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, milliseconds);
  });

const safeErrorMessage = (status: number): string => {
  if (status === 401) {
    return 'Microsoft Fabric authentication expired or was rejected. Sign in again and retry.';
  }
  if (status === 403) {
    return 'The Microsoft Fabric identity does not have the required workspace or Lakehouse permission.';
  }
  if (status === 404) {
    return 'The Microsoft Fabric workspace, Lakehouse, session, or statement was not found.';
  }
  if (status === 429) {
    return 'Microsoft Fabric is throttling requests. Wait briefly and retry.';
  }
  if (status === 409 || status === 503) {
    return 'Microsoft Fabric Spark capacity is unavailable. Check capacity state and retry.';
  }
  return `Microsoft Fabric request failed with status ${status}.`;
};

const fabricErrorCode = (status: number): string => {
  if (status === 401) return 'FABRIC_AUTH_REQUIRED';
  if (status === 403) return 'FABRIC_PERMISSION_DENIED';
  if (status === 404) return 'FABRIC_NOT_FOUND';
  if (status === 429) return 'FABRIC_RATE_LIMITED';
  if (status === 409 || status === 503) return 'FABRIC_CAPACITY_UNAVAILABLE';
  return 'FABRIC_REQUEST_FAILED';
};

class FabricRuntimeError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'FabricRuntimeError';
  }
}

const runAzureCliToken = (
  scope: string,
  signal?: AbortSignal,
): Promise<TokenEntry> =>
  new Promise((resolve, reject) => {
    const child = spawn(
      'az',
      ['account', 'get-access-token', '--scope', scope, '--output', 'json'],
      { shell: false },
    );
    let stdout = '';
    let stderr = '';
    const abort = () => {
      child.kill('SIGTERM');
      reject(
        new FabricRuntimeError(
          'FABRIC_QUERY_CANCELLED',
          'Microsoft Fabric query was cancelled.',
        ),
      );
    };
    signal?.addEventListener('abort', abort, { once: true });
    const cleanup = () => signal?.removeEventListener('abort', abort);
    const timeout = setTimeout(() => {
      child.kill('SIGTERM');
      reject(
        new FabricRuntimeError(
          'FABRIC_AUTH_REQUIRED',
          'Azure CLI token request timed out. Run az login and retry.',
        ),
      );
    }, HTTP_TIMEOUT_MS);
    child.stdout.on('data', (chunk) => {
      stdout += String(chunk);
    });
    child.stderr.on('data', (chunk) => {
      stderr += String(chunk);
    });
    child.on('error', () => {
      clearTimeout(timeout);
      cleanup();
      reject(
        new FabricRuntimeError(
          'FABRIC_AUTH_REQUIRED',
          'Azure CLI is unavailable. Install Azure CLI, run az login, and retry.',
        ),
      );
    });
    child.on('close', (exitCode) => {
      clearTimeout(timeout);
      cleanup();
      if (signal?.aborted) return;
      if (exitCode !== 0) {
        reject(
          new FabricRuntimeError(
            'FABRIC_AUTH_REQUIRED',
            `Azure CLI authentication failed. Run az login and retry. ${stderr.slice(-500)}`,
          ),
        );
        return;
      }
      try {
        const parsed = JSON.parse(stdout) as JsonRecord;
        if (typeof parsed.accessToken !== 'string') {
          throw new Error('Azure CLI did not return an access token');
        }
        const parsedExpiry = Date.parse(parsed.expiresOn ?? parsed.expires_on);
        resolve({
          token: parsed.accessToken,
          expiresAt: Number.isFinite(parsedExpiry)
            ? parsedExpiry
            : Date.now() + 45 * 60_000,
        });
      } catch {
        reject(
          new FabricRuntimeError(
            'FABRIC_AUTH_REQUIRED',
            'Azure CLI returned an invalid token response.',
          ),
        );
      }
    });
  });

const normalizeColumn = (column: JsonRecord, index: number): Column => ({
  name: String(column.name ?? column.column_name ?? ''),
  typeName: String(
    column.type_name ?? column.type_text ?? column.type ?? 'unknown',
  ),
  ordinalPosition: Number(
    column.position ?? column.ordinal_position ?? index + 1,
  ),
  primaryKeySequenceId: 0,
  columnDisplaySize: 0,
  scale: Number(column.type_scale ?? column.scale ?? 0),
  precision: Number(column.type_precision ?? column.precision ?? 0),
  columnProperties: [],
  autoincrement: false,
  primaryKey: false,
  nullable: column.nullable !== false,
  foreignKeys: [],
});

class FabricRuntime {
  private readonly tokens = new Map<string, TokenEntry>();

  private readonly tokenRequests = new Map<string, Promise<TokenEntry>>();

  private readonly sessions = new Map<string, LivySession>();

  private readonly sessionChains = new Map<string, Promise<void>>();

  private readonly metadataCache = new Map<
    string,
    { expiresAt: number; tables: Table[] }
  >();

  private readonly idleCleanupTimer: ReturnType<typeof setInterval>;

  constructor() {
    this.idleCleanupTimer = setInterval(() => {
      const expired = [...this.sessions.entries()].filter(
        ([, session]) =>
          Date.now() - session.lastUsedAt > SESSION_IDLE_TIMEOUT_MS,
      );
      expired.forEach(([connectionId, session]) => {
        this.closeSession(
          connectionId,
          session.connection,
          session.token,
        ).catch(() => undefined);
      });
    }, 60_000);
    this.idleCleanupTimer.unref?.();
  }

  private async collectPagedItems(
    initialUrl: string,
    connectionId: string,
    connection: FabricSparkConnection,
    auth: FabricAuth,
    initialToken: string,
    property: 'schemas' | 'tables',
  ): Promise<{ items: JsonRecord[]; token: string }> {
    const collected: JsonRecord[] = [];
    let token = initialToken;
    let nextUrl: string | undefined = initialUrl;
    let pages = 0;
    while (nextUrl && pages < 100 && collected.length < MAX_METADATA_TABLES) {
      const page = await this.requestWithAuthRefresh(
        nextUrl,
        connectionId,
        connection,
        auth,
        STORAGE_SCOPE,
        token,
      );
      token = page.token;
      const items = Array.isArray(page.json[property])
        ? page.json[property]
        : [];
      collected.push(...items.slice(0, MAX_METADATA_TABLES - collected.length));
      const tokenValue =
        page.json.next_page_token ??
        page.json.nextPageToken ??
        page.json.continuation_token;
      const nextLink = page.json.next ?? page.json.nextLink;
      if (
        typeof nextLink === 'string' &&
        nextLink.startsWith(ONELAKE_TABLE_BASE)
      ) {
        nextUrl = nextLink;
      } else if (typeof tokenValue === 'string' && tokenValue) {
        const parsed = new URL(initialUrl);
        parsed.searchParams.set('page_token', tokenValue);
        nextUrl = parsed.toString();
      } else {
        nextUrl = undefined;
      }
      pages += 1;
    }
    return { items: collected, token };
  }

  private quoteSparkIdentifier(identifier: string): string {
    return `\`${identifier.replace(/`/g, '``')}\``;
  }

  private tokenKey(
    connectionId: string,
    connection: FabricSparkConnection,
    scope: string,
  ): string {
    return [
      connectionId,
      connection.authentication,
      connection.tenantId ?? 'cli',
      connection.clientId ?? 'cli',
      scope,
    ].join(':');
  }

  private async acquireToken(
    connectionId: string,
    connection: FabricSparkConnection,
    auth: FabricAuth,
    scope: string,
    signal?: AbortSignal,
  ): Promise<string> {
    const key = this.tokenKey(connectionId, connection, scope);
    const cached = this.tokens.get(key);
    if (cached && cached.expiresAt > Date.now() + 2 * 60_000) {
      return cached.token;
    }
    const pending = this.tokenRequests.get(key);
    if (pending) return (await pending).token;

    const request = (async (): Promise<TokenEntry> => {
      if (connection.authentication === 'CLI') {
        return runAzureCliToken(scope, signal);
      }
      if (!connection.tenantId || !connection.clientId || !auth.clientSecret) {
        throw new FabricRuntimeError(
          'FABRIC_AUTH_REQUIRED',
          'Microsoft Fabric service principal credentials are incomplete.',
        );
      }
      const body = new URLSearchParams({
        client_id: connection.clientId,
        client_secret: auth.clientSecret,
        grant_type: 'client_credentials',
        scope,
      });
      const response = await fetch(
        `https://login.microsoftonline.com/${encodeURIComponent(
          connection.tenantId,
        )}/oauth2/v2.0/token`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body,
          signal: signal ?? AbortSignal.timeout(HTTP_TIMEOUT_MS),
        },
      );
      const json = (await response.json()) as JsonRecord;
      if (!response.ok || typeof json.access_token !== 'string') {
        throw new FabricRuntimeError(
          fabricErrorCode(response.status),
          safeErrorMessage(response.status),
        );
      }
      return {
        token: json.access_token,
        expiresAt: Date.now() + Number(json.expires_in ?? 3_600) * 1_000,
      };
    })();
    this.tokenRequests.set(key, request);
    try {
      const entry = await request;
      this.tokens.set(key, entry);
      return entry.token;
    } finally {
      if (this.tokenRequests.get(key) === request) {
        this.tokenRequests.delete(key);
      }
    }
  }

  private async request(
    url: string,
    token: string,
    init?: Parameters<typeof fetch>[1],
  ): Promise<{ response: Response; json: JsonRecord }> {
    const method = String(init?.method ?? 'GET').toUpperCase();
    const maxAttempts = method === 'GET' ? 3 : 1;
    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
      const response = await fetch(url, {
        ...init,
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/json',
          ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
          ...init?.headers,
        },
        signal: init?.signal ?? AbortSignal.timeout(HTTP_TIMEOUT_MS),
      });
      let json: JsonRecord = {};
      const responseText = await response.text();
      if (responseText) {
        try {
          json = JSON.parse(responseText) as JsonRecord;
        } catch {
          json = { text: responseText.slice(0, 20_000) };
        }
      }
      if (response.ok || response.status === 202) return { response, json };
      if (
        ![429, 503].includes(response.status) ||
        attempt === maxAttempts - 1
      ) {
        throw new FabricRuntimeError(
          fabricErrorCode(response.status),
          safeErrorMessage(response.status),
        );
      }
      const retryAfter = response.headers.get('retry-after');
      const retrySeconds = Number(retryAfter);
      const retryAt = retryAfter ? Date.parse(retryAfter) : Number.NaN;
      let retryMilliseconds = 500 * (attempt + 1);
      if (Number.isFinite(retrySeconds)) {
        retryMilliseconds = retrySeconds * 1_000;
      } else if (Number.isFinite(retryAt)) {
        retryMilliseconds = retryAt - Date.now();
      }
      await delay(
        Math.min(Math.max(retryMilliseconds, 100), 10_000) +
          Math.floor(Math.random() * 100),
      );
    }
    throw new FabricRuntimeError(
      'FABRIC_REQUEST_FAILED',
      'Microsoft Fabric request failed.',
    );
  }

  private async requestWithAuthRefresh(
    url: string,
    connectionId: string,
    connection: FabricSparkConnection,
    auth: FabricAuth,
    scope: string,
    token: string,
    init?: Parameters<typeof fetch>[1],
  ): Promise<{ response: Response; json: JsonRecord; token: string }> {
    try {
      const result = await this.request(url, token, init);
      return { ...result, token };
    } catch (error) {
      if (
        !(error instanceof FabricRuntimeError) ||
        error.code !== 'FABRIC_AUTH_REQUIRED'
      ) {
        throw error;
      }
      this.tokens.delete(this.tokenKey(connectionId, connection, scope));
      const refreshedToken = await this.acquireToken(
        connectionId,
        connection,
        auth,
        scope,
        init?.signal ?? undefined,
      );
      const result = await this.request(url, refreshedToken, init);
      return { ...result, token: refreshedToken };
    }
  }

  private sessionsUrl(connection: FabricSparkConnection): string {
    return `${connection.endpoint}/workspaces/${encodeURIComponent(
      connection.workspaceId,
    )}/lakehouses/${encodeURIComponent(
      connection.lakehouseId,
    )}/livyapi/versions/${LIVY_API_VERSION}/sessions`;
  }

  private async getSession(
    connectionId: string,
    connection: FabricSparkConnection,
    auth: FabricAuth,
    control: ExecutionControl,
    onProgress?: FabricExecutionOptions['onProgress'],
  ): Promise<{ session: LivySession; token: string }> {
    onProgress?.('authenticating', 'Authenticating with Microsoft Fabric');
    let token = await this.acquireToken(
      connectionId,
      connection,
      auth,
      FABRIC_SCOPE,
      control.abortController.signal,
    );
    const existing = this.sessions.get(connectionId);
    if (
      existing &&
      Date.now() - existing.lastUsedAt <= SESSION_IDLE_TIMEOUT_MS
    ) {
      onProgress?.('queued', 'Using warm Microsoft Fabric session');
      onProgress?.('session-ready', 'Microsoft Fabric session is ready');
      return { session: existing, token };
    }
    if (existing) {
      await this.closeSession(connectionId, connection, existing.token);
    }
    if (control.cancelled) {
      throw new FabricRuntimeError(
        'FABRIC_QUERY_CANCELLED',
        'Microsoft Fabric query was cancelled.',
      );
    }
    onProgress?.('starting-session', 'Starting Microsoft Fabric Spark session');
    const payload = connection.environmentId
      ? {
          conf: {
            'spark.fabric.environmentDetails': JSON.stringify({
              id: connection.environmentId,
            }),
          },
        }
      : {};
    const created = await this.requestWithAuthRefresh(
      this.sessionsUrl(connection),
      connectionId,
      connection,
      auth,
      FABRIC_SCOPE,
      token,
      {
        method: 'POST',
        body: JSON.stringify(payload),
        signal: control.abortController.signal,
      },
    );
    token = created.token;
    const location = created.response.headers.get('location') ?? '';
    const idFromLocation = location.match(/\/sessions\/(\d+)/)?.[1];
    const sessionId = Number(created.json.id ?? idFromLocation);
    if (!Number.isInteger(sessionId)) {
      throw new FabricRuntimeError(
        'FABRIC_SESSION_START_FAILED',
        'Microsoft Fabric did not return a Livy session ID.',
      );
    }
    const deadline = Date.now() + SESSION_START_TIMEOUT_MS;
    while (Date.now() < deadline) {
      const current = await this.requestWithAuthRefresh(
        `${this.sessionsUrl(connection)}/${sessionId}`,
        connectionId,
        connection,
        auth,
        FABRIC_SCOPE,
        token,
        { signal: control.abortController.signal },
      );
      token = current.token;
      const state = String(current.json.state ?? '').toLowerCase();
      if (state === 'idle') {
        const session = {
          id: sessionId,
          lastUsedAt: Date.now(),
          connection: { ...connection },
          token,
        };
        this.sessions.set(connectionId, session);
        onProgress?.('session-ready', 'Microsoft Fabric session is ready');
        return { session, token };
      }
      if (['error', 'dead', 'killed', 'shutting_down'].includes(state)) {
        throw new FabricRuntimeError(
          'FABRIC_SESSION_START_FAILED',
          `Microsoft Fabric Livy session entered state ${state}.`,
        );
      }
      await delay(1_500);
    }
    await this.closeSession(connectionId, connection, token);
    throw new FabricRuntimeError(
      'FABRIC_SESSION_START_TIMEOUT',
      'Microsoft Fabric Livy session startup timed out.',
    );
  }

  private buildStatementCode(
    query: string,
    rowLimit: number,
    offset: number,
  ): string {
    const encoded = Buffer.from(query, 'utf8').toString('base64');
    return [
      'import base64, datetime, decimal, json',
      `_dbt_studio_query = base64.b64decode("${encoded}").decode("utf-8")`,
      '_dbt_studio_df = spark.sql(_dbt_studio_query)',
      ...(offset > 0
        ? [
            `_dbt_studio_rows = (_dbt_studio_df.rdd.zipWithIndex().filter(lambda pair: ${offset} <= pair[1] < ${offset + rowLimit + 1}).map(lambda pair: pair[0]).collect())`,
          ]
        : [
            `_dbt_studio_rows = _dbt_studio_df.limit(${rowLimit + 1}).collect()`,
          ]),
      '_dbt_studio_fields = [{"name": f.name, "typeName": f.dataType.simpleString(), "nullable": f.nullable} for f in _dbt_studio_df.schema.fields]',
      '_dbt_studio_value_truncated = [False]',
      'def _dbt_studio_safe(value):',
      '    if value is None or isinstance(value, bool): return value',
      '    if isinstance(value, int): return str(value) if abs(value) > 9007199254740991 else value',
      '    if isinstance(value, decimal.Decimal): return str(value)',
      '    if isinstance(value, (datetime.date, datetime.datetime, datetime.time)): return value.isoformat()',
      '    if isinstance(value, (bytes, bytearray)):',
      '        encoded_value = base64.b64encode(bytes(value)).decode("ascii")',
      '        if len(encoded_value) > 100000: _dbt_studio_value_truncated[0] = True',
      '        return encoded_value[:100000]',
      '    if isinstance(value, str):',
      '        if len(value) > 100000: _dbt_studio_value_truncated[0] = True',
      '        return value[:100000]',
      '    if hasattr(value, "asDict"): return _dbt_studio_safe(value.asDict(recursive=True))',
      '    if isinstance(value, dict): return {str(k): _dbt_studio_safe(v) for k, v in value.items()}',
      '    if isinstance(value, (list, tuple)): return [_dbt_studio_safe(v) for v in value]',
      '    if isinstance(value, float): return value',
      '    return str(value)',
      `_dbt_studio_page = _dbt_studio_rows[:${rowLimit}]`,
      '_dbt_studio_safe_rows = [_dbt_studio_safe(r) for r in _dbt_studio_page]',
      `_dbt_studio_payload = {"fields": _dbt_studio_fields, "rows": _dbt_studio_safe_rows, "truncated": len(_dbt_studio_rows) > ${rowLimit} or _dbt_studio_value_truncated[0]}`,
      `print("${RESULT_MARKER}" + json.dumps(_dbt_studio_payload, default=str))`,
    ].join('\n');
  }

  private parseStatementResult(statement: JsonRecord): QueryResponseType {
    const output = statement.output as JsonRecord | undefined;
    if (output?.status === 'error') {
      const category = String(output.ename ?? '')
        .replace(/[^A-Za-z0-9_.-]/g, '')
        .slice(0, 80);
      throw new FabricRuntimeError(
        'FABRIC_STATEMENT_FAILED',
        category
          ? `Microsoft Fabric Spark SQL failed (${category}). Check the statement and Lakehouse permissions.`
          : 'Microsoft Fabric Spark SQL failed. Check the statement and Lakehouse permissions.',
      );
    }
    const text = String(output?.data?.['text/plain'] ?? output?.text ?? '');
    const markerIndex = text.lastIndexOf(RESULT_MARKER);
    if (markerIndex < 0) {
      throw new Error(
        'Microsoft Fabric returned an unsupported result format.',
      );
    }
    const afterMarker = text.slice(markerIndex + RESULT_MARKER.length);
    const firstLine = afterMarker
      .split(/\r?\n/)[0]
      .replace(/\\n.*$/, '')
      .trim();
    let payload: JsonRecord;
    try {
      payload = JSON.parse(firstLine) as JsonRecord;
    } catch {
      const end = afterMarker.lastIndexOf('}');
      payload = JSON.parse(afterMarker.slice(0, end + 1)) as JsonRecord;
    }
    const rawRows = Array.isArray(payload.rows) ? payload.rows : [];
    let valueTruncated = false;
    const rows = rawRows.map((row: JsonRecord) =>
      Object.fromEntries(
        Object.entries(row).map(([key, value]) => {
          if (typeof value === 'string' && value.length > MAX_CELL_CHARACTERS) {
            valueTruncated = true;
            return [key, value.slice(0, MAX_CELL_CHARACTERS)];
          }
          return [key, value];
        }),
      ),
    );
    const fields = Array.isArray(payload.fields) ? payload.fields : [];
    return {
      success: true,
      data: rows as any,
      fields: fields.map((field: JsonRecord) => ({
        name: String(field.name ?? ''),
        type: 0,
        typeName: String(field.typeName ?? 'unknown'),
        nullable: field.nullable !== false,
      })),
      rowCount: rows.length,
      truncated: payload.truncated === true || valueTruncated,
    };
  }

  private async runStatement(
    connectionId: string,
    connection: FabricSparkConnection,
    auth: FabricAuth,
    query: string,
    options?: FabricExecutionOptions,
    control?: ExecutionControl,
  ): Promise<QueryResponseType> {
    const executionControl =
      control ??
      ({
        abortController: new AbortController(),
        cancelled: false,
      } as ExecutionControl);
    const sessionResult = await this.getSession(
      connectionId,
      connection,
      auth,
      executionControl,
      options?.onProgress,
    );
    const { session } = sessionResult;
    let { token } = sessionResult;
    const statementsUrl = `${this.sessionsUrl(connection)}/${session.id}/statements`;
    const limit = Math.min(
      Math.max(Math.floor(options?.rowLimit ?? DEFAULT_ROW_LIMIT), 1),
      DEFAULT_ROW_LIMIT,
    );
    const offset = Math.max(Math.floor(options?.offset ?? 0), 0);
    if (offset > MAX_ROW_OFFSET) {
      throw new FabricRuntimeError(
        'FABRIC_PAGE_LIMIT_EXCEEDED',
        'Microsoft Fabric paging is limited to the first 10,000,000 rows.',
      );
    }
    options?.onProgress?.('executing', 'Executing Spark SQL');
    const submitted = await this.requestWithAuthRefresh(
      statementsUrl,
      connectionId,
      connection,
      auth,
      FABRIC_SCOPE,
      token,
      {
        method: 'POST',
        body: JSON.stringify({
          code: this.buildStatementCode(query, limit, offset),
        }),
        signal: executionControl.abortController.signal,
      },
    );
    token = submitted.token;
    const statementId = Number(submitted.json.id);
    if (!Number.isInteger(statementId)) {
      throw new FabricRuntimeError(
        'FABRIC_STATEMENT_FAILED',
        'Microsoft Fabric did not return a statement ID.',
      );
    }
    let cancelled = false;
    executionControl.cancelRemote = async () => {
      cancelled = true;
      try {
        await this.request(`${statementsUrl}/${statementId}/cancel`, token, {
          method: 'POST',
          body: JSON.stringify({}),
        });
      } catch {
        await this.closeSession(connectionId, connection, token);
      }
    };
    const deadline = Date.now() + STATEMENT_TIMEOUT_MS;
    while (Date.now() < deadline) {
      if (cancelled || executionControl.cancelled) {
        throw new FabricRuntimeError(
          'FABRIC_QUERY_CANCELLED',
          'Microsoft Fabric query was cancelled.',
        );
      }
      const current = await this.requestWithAuthRefresh(
        `${statementsUrl}/${statementId}`,
        connectionId,
        connection,
        auth,
        FABRIC_SCOPE,
        token,
      );
      token = current.token;
      const state = String(current.json.state ?? '').toLowerCase();
      if (state === 'available') {
        options?.onProgress?.(
          'reading-results',
          'Reading bounded query results',
        );
        session.lastUsedAt = Date.now();
        const result = this.parseStatementResult(current.json);
        result.statementId = statementId;
        if (
          Buffer.byteLength(JSON.stringify(result), 'utf8') > MAX_RESULT_BYTES
        ) {
          throw new FabricRuntimeError(
            'FABRIC_RESULT_TOO_LARGE',
            'Microsoft Fabric result exceeded the maximum response size.',
          );
        }
        return result;
      }
      if (['error', 'cancelled', 'cancelling'].includes(state)) {
        throw new FabricRuntimeError(
          state.startsWith('cancel')
            ? 'FABRIC_QUERY_CANCELLED'
            : 'FABRIC_STATEMENT_FAILED',
          `Microsoft Fabric statement entered state ${state}.`,
        );
      }
      await delay(1_000);
    }
    await this.closeSession(connectionId, connection, token);
    throw new FabricRuntimeError(
      'FABRIC_QUERY_TIMEOUT',
      'Microsoft Fabric query timed out.',
    );
  }

  async executeSparkSql(
    connectionId: string,
    connection: FabricSparkConnection,
    auth: FabricAuth,
    query: string,
    options?: FabricExecutionOptions,
  ): Promise<QueryResponseType> {
    const previous = this.sessionChains.get(connectionId) ?? Promise.resolve();
    let release: () => void = () => undefined;
    const current = new Promise<void>((resolve) => {
      release = resolve;
    });
    const chained = previous.then(() => current);
    this.sessionChains.set(connectionId, chained);
    const control: ExecutionControl = {
      abortController: new AbortController(),
      cancelled: false,
    };
    options?.registerCancel?.(async () => {
      control.cancelled = true;
      options.onProgress?.('cancelling', 'Cancelling Microsoft Fabric query');
      control.abortController.abort();
      await control.cancelRemote?.();
    });
    options?.onProgress?.('queued', 'Waiting for Microsoft Fabric session');
    await previous;
    try {
      if (control.cancelled) {
        throw new FabricRuntimeError(
          'FABRIC_QUERY_CANCELLED',
          'Microsoft Fabric query was cancelled.',
        );
      }
      const result = await this.runStatement(
        connectionId,
        connection,
        auth,
        query,
        options,
        control,
      );
      options?.onProgress?.('completed', 'Microsoft Fabric query completed');
      return result;
    } catch (error) {
      const runtimeError =
        error instanceof FabricRuntimeError
          ? error
          : new FabricRuntimeError(
              control.cancelled
                ? 'FABRIC_QUERY_CANCELLED'
                : 'FABRIC_REQUEST_FAILED',
              error instanceof Error
                ? error.message
                : 'Microsoft Fabric query failed.',
            );
      options?.onProgress?.(
        runtimeError.code === 'FABRIC_QUERY_CANCELLED' ? 'cancelled' : 'failed',
        runtimeError.message,
      );
      return {
        success: false,
        error: runtimeError.message.slice(0, 2_000),
        errorCode: runtimeError.code,
      };
    } finally {
      if (!connection.reuseSession) {
        const activeSession = this.sessions.get(connectionId);
        if (activeSession) {
          await this.closeSession(
            connectionId,
            connection,
            activeSession.token,
          );
        }
      }
      release();
      if (this.sessionChains.get(connectionId) === chained) {
        this.sessionChains.delete(connectionId);
      }
    }
  }

  async testConnection(
    connectionId: string,
    connection: FabricSparkConnection,
    auth: FabricAuth,
  ): Promise<boolean> {
    await this.extractSchema(connectionId, connection, auth);
    const result = await this.executeSparkSql(
      connectionId,
      connection,
      auth,
      'SELECT 1 AS dbt_studio_connection_test',
      { rowLimit: 1 },
    );
    return result.success === true;
  }

  async extractSchema(
    connectionId: string,
    connection: FabricSparkConnection,
    auth: FabricAuth,
  ): Promise<{ tables: Table[] }> {
    const cached = this.metadataCache.get(connectionId);
    if (cached && cached.expiresAt > Date.now()) {
      return { tables: cached.tables.map((table) => ({ ...table })) };
    }
    let token = await this.acquireToken(
      connectionId,
      connection,
      auth,
      STORAGE_SCOPE,
    );
    const base = `${ONELAKE_TABLE_BASE}/${encodeURIComponent(
      connection.workspaceId,
    )}/${encodeURIComponent(connection.lakehouseId)}/api/2.1/unity-catalog`;
    const schemaPage = await this.collectPagedItems(
      `${base}/schemas?catalog_name=${encodeURIComponent(connection.lakehouseId)}`,
      connectionId,
      connection,
      auth,
      token,
      'schemas',
    );
    token = schemaPage.token;
    const schemaItems = schemaPage.items;
    let schemas = schemaItems
      .map((schema) => String(schema.name ?? ''))
      .filter(Boolean);
    if (schemas.length === 0 && connection.schemaMode === 'non-schema') {
      schemas = ['dbo'];
    }
    const tables: Table[] = [];
    let requiresFallback = schemas.length === 0;
    for (const schema of schemas) {
      if (tables.length >= MAX_METADATA_TABLES) break;
      const tablePage = await this.collectPagedItems(
        `${base}/tables?catalog_name=${encodeURIComponent(
          connection.lakehouseId,
        )}&schema_name=${encodeURIComponent(schema)}`,
        connectionId,
        connection,
        auth,
        token,
        'tables',
      );
      token = tablePage.token;
      const remoteTables = tablePage.items;
      for (const remote of remoteTables) {
        if (tables.length >= MAX_METADATA_TABLES) break;
        const table = remote as JsonRecord;
        const name =
          String(table.name ?? '')
            .split('.')
            .pop() ?? '';
        if (!name) continue;
        let columns = Array.isArray(table.columns) ? table.columns : [];
        if (columns.length === 0) {
          try {
            const detail = await this.requestWithAuthRefresh(
              `${base}/tables/${encodeURIComponent(
                name,
              )}?catalog_name=${encodeURIComponent(
                connection.lakehouseId,
              )}&schema_name=${encodeURIComponent(schema)}`,
              connectionId,
              connection,
              auth,
              STORAGE_SCOPE,
              token,
            );
            token = detail.token;
            columns = Array.isArray(detail.json.columns)
              ? detail.json.columns
              : [];
          } catch {
            columns = [];
            requiresFallback = true;
          }
        }
        if (columns.length === 0) requiresFallback = true;
        tables.push({
          name,
          schema,
          type: String(table.table_type ?? table.type ?? 'TABLE').toUpperCase(),
          columns: columns.map(normalizeColumn),
        });
      }
    }
    if (requiresFallback) {
      const fallbackSchemas =
        schemas.length > 0 ? schemas : [connection.schema];
      for (const schema of fallbackSchemas.slice(0, 100)) {
        const showTables = await this.executeSparkSql(
          connectionId,
          connection,
          auth,
          `SHOW TABLES IN ${this.quoteSparkIdentifier(schema)}`,
          { rowLimit: 1_000 },
        );
        if (!showTables.success) continue;
        const rows = (showTables.data ?? []) as any[];
        for (const row of rows) {
          const name = String(
            row.tableName ?? row.table_name ?? row.name ?? '',
          );
          if (!name || tables.length >= MAX_METADATA_TABLES) continue;
          const existing = tables.find(
            (table) => table.schema === schema && table.name === name,
          );
          if (existing?.columns.length) continue;
          const described = await this.executeSparkSql(
            connectionId,
            connection,
            auth,
            `DESCRIBE ${this.quoteSparkIdentifier(schema)}.${this.quoteSparkIdentifier(name)}`,
            { rowLimit: 500 },
          );
          const columns = described.success
            ? ((described.data ?? []) as any[])
                .filter((item) => {
                  const columnName = String(
                    item.col_name ?? item.column_name ?? item.name ?? '',
                  );
                  return columnName && !columnName.startsWith('#');
                })
                .map((item, index) =>
                  normalizeColumn(
                    {
                      name: item.col_name ?? item.column_name ?? item.name,
                      type: item.data_type ?? item.type,
                      nullable: true,
                    },
                    index,
                  ),
                )
            : [];
          if (existing) existing.columns = columns;
          else {
            tables.push({ name, schema, type: 'TABLE', columns });
          }
        }
      }
    }
    tables.sort((left, right) =>
      `${left.schema}.${left.name}`.localeCompare(
        `${right.schema}.${right.name}`,
      ),
    );
    this.metadataCache.set(connectionId, {
      expiresAt: Date.now() + METADATA_CACHE_TTL_MS,
      tables,
    });
    return { tables };
  }

  invalidateMetadata(connectionId: string): void {
    this.metadataCache.delete(connectionId);
  }

  async closeSession(
    connectionId: string,
    connection: FabricSparkConnection,
    existingToken?: string,
  ): Promise<void> {
    const session = this.sessions.get(connectionId);
    this.sessions.delete(connectionId);
    this.tokens.forEach((_value, key) => {
      if (key.startsWith(`${connectionId}:`)) this.tokens.delete(key);
    });
    this.tokenRequests.forEach((_value, key) => {
      if (key.startsWith(`${connectionId}:`)) this.tokenRequests.delete(key);
    });
    if (!session || !existingToken) return;
    try {
      await this.request(
        `${this.sessionsUrl(connection)}/${session.id}`,
        existingToken,
        { method: 'DELETE' },
      );
    } catch {
      // The session may already be terminal or unreachable.
    }
  }

  async disposeConnection(
    connectionId: string,
    connection?: FabricSparkConnection,
  ): Promise<void> {
    const session = this.sessions.get(connectionId);
    let token: string | undefined;
    this.tokens.forEach((entry, key) => {
      if (key.startsWith(`${connectionId}:`) && key.endsWith(FABRIC_SCOPE)) {
        token = entry.token;
      }
    });
    if (connection && session && token) {
      await this.closeSession(connectionId, connection, token);
    } else {
      this.sessions.delete(connectionId);
      this.tokens.forEach((_value, key) => {
        if (key.startsWith(`${connectionId}:`)) this.tokens.delete(key);
      });
      this.tokenRequests.forEach((_value, key) => {
        if (key.startsWith(`${connectionId}:`)) this.tokenRequests.delete(key);
      });
    }
    this.sessionChains.delete(connectionId);
    this.metadataCache.delete(connectionId);
  }

  async disposeAll(): Promise<void> {
    clearInterval(this.idleCleanupTimer);
    const entries = [...this.sessions.entries()];
    await Promise.allSettled(
      entries.map(([connectionId, session]) =>
        this.closeSession(connectionId, session.connection, session.token),
      ),
    );
    this.sessions.clear();
    this.tokens.clear();
    this.tokenRequests.clear();
    this.sessionChains.clear();
    this.metadataCache.clear();
  }
}

export default new FabricRuntime();
