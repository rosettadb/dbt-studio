/**
 * IcebergDatalakeService
 * Main backend service for Iceberg Data Lake instance management.
 * Handles CRUD, secure credential storage, Python bridge invocation,
 * and pyiceberg installation.
 *
 * Follows BE-03 (one cohesive service), BE-04 (no await inside Promise constructor).
 */

import * as fs from 'fs';
import { v4 as uuidv4 } from 'uuid';
import * as path from 'path';
import { pathToFileURL } from 'url';
import { spawn } from 'child_process';
import { app } from 'electron';
import { DuckDBInstance, StatementType } from '@duckdb/node-api';

import { loadDatabaseFile, updateDatabase } from '../utils/fileHelper';
import secureStorage from './secureStorage.service';
import SettingsService from './settings.service';

import type {
  IcebergInstanceConfig,
  IcebergInstanceListItem,
  CreateIcebergInstanceDTO,
  UpdateIcebergInstanceDTO,
  IcebergTestCatalogParams,
  IcebergTestStorageParams,
  IcebergListStorageBucketsParams,
  IcebergTestResult,
  IcebergFieldSpec,
  IcebergSchemaResult,
  IcebergSnapshotInfo,
  IcebergPreviewResult,
  IcebergLocalCatalogResult,
  IcebergCapabilities,
  IcebergCatalogCapability,
  IcebergImportTableResult,
  IcebergImportFileFormat,
  IcebergTableOperationResult,
  IcebergNamespaceOperationResult,
  IcebergSqlCapability,
  IcebergSqlExecutionParams,
  IcebergSqlExecutionResult,
  IcebergSqlSchemaInfo,
  IcebergSqlStatementClass,
} from '../../types/iceberg';
import type { CloudConnection, CloudStorageConfig } from '../../types/frontend';
import type { PostgresConnection } from '../../types/backend';

export class IcebergDatalakeService {
  private static readonly activeSqlExecutions = new Map<string, any>();

  private static readonly sqlStatementClasses: Partial<
    Record<StatementType, IcebergSqlStatementClass>
  > = {
    [StatementType.SELECT]: 'select',
    [StatementType.CREATE]: 'create',
    [StatementType.DROP]: 'drop',
    [StatementType.INSERT]: 'insert',
    [StatementType.UPDATE]: 'update',
    [StatementType.DELETE]: 'delete',
  };

  private static readonly cloudProviders = [
    'aws',
    'azure',
    'gcs',
    'minio',
    'cloudflare-r2',
    'backblaze-b2',
    'rustfs',
    'garage',
  ] as const;

  private static readonly duckdbIcebergStorageProviders = [
    'aws',
    'minio',
    'cloudflare-r2',
    'backblaze-b2',
    'rustfs',
    'garage',
  ] as const;

  private static readonly catalogCapabilities: IcebergCatalogCapability[] = [
    {
      type: 'sqlite',
      label: 'SQLite (Local)',
      pyicebergType: 'sql',
      enabled: true,
      requiredFields: ['catalogPath'],
      authModes: ['none'],
      allowedStorageTypes: ['local', 'cloud'],
    },
    {
      type: 'sql',
      label: 'PostgreSQL / Neon',
      pyicebergType: 'sql',
      enabled: true,
      requiredFields: ['databaseConnectionId', 'catalogName'],
      authModes: ['none'],
      allowedStorageTypes: ['local', 'cloud'],
    },
    {
      type: 'rest',
      label: 'REST Catalog',
      pyicebergType: 'rest',
      enabled: true,
      requiredFields: ['endpoint', 'catalogName'],
      authModes: ['none', 'token', 'oauth-client-credentials'],
      allowedStorageTypes: ['server-managed'],
    },
    {
      type: 'polaris',
      label: 'Apache Polaris',
      pyicebergType: 'rest',
      enabled: true,
      requiredFields: ['endpoint', 'catalogName'],
      authModes: ['none', 'token', 'oauth-client-credentials'],
      allowedStorageTypes: ['server-managed'],
    },
    {
      type: 'lakekeeper',
      label: 'Lakekeeper',
      pyicebergType: 'rest',
      enabled: true,
      requiredFields: ['endpoint', 'catalogName'],
      authModes: ['none', 'token', 'oauth-client-credentials'],
      allowedStorageTypes: ['server-managed'],
    },
    {
      type: 'nessie',
      label: 'Project Nessie',
      pyicebergType: 'rest',
      enabled: true,
      requiredFields: ['endpoint', 'nessieReference'],
      authModes: ['none', 'token', 'oauth-client-credentials'],
      allowedStorageTypes: ['server-managed'],
    },
    {
      type: 'hive',
      label: 'Hive Metastore',
      pyicebergType: 'hive',
      enabled: true,
      requiredFields: ['hiveUri'],
      authModes: ['none'],
      allowedStorageTypes: ['local'],
    },
  ];

  // In-process cache: once we confirm pyiceberg is installed for this app
  // session we skip the Python bridge check on subsequent calls.
  private static installedCache: {
    installed: boolean;
    version?: string;
  } | null = null;

  // ─────────────────────────────────────────────
  //  Private: persistence helpers
  // ─────────────────────────────────────────────

  private static async readInstances(): Promise<IcebergInstanceConfig[]> {
    try {
      const db = await loadDatabaseFile();
      return (db.icebergInstances ?? []).map((instance) => {
        const persisted = instance as unknown as { catalogType: string };
        if (persisted.catalogType !== 'file') return instance;
        return { ...instance, catalogType: 'sqlite' };
      });
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('[IcebergDatalakeService] readInstances error:', error);
      return [];
    }
  }

  private static async writeInstances(
    instances: IcebergInstanceConfig[],
  ): Promise<void> {
    await updateDatabase('icebergInstances', instances);
  }

  // ─────────────────────────────────────────────
  //  Private: Python bridge helpers
  // ─────────────────────────────────────────────

  private static getBridgePath(): string {
    if (app.isPackaged) {
      return path.join(process.resourcesPath, 'python', 'iceberg_bridge.py');
    }
    return path.join(
      __dirname,
      '..',
      '..',
      'resources',
      'python',
      'iceberg_bridge.py',
    );
  }

  private static async getPythonPath(): Promise<string> {
    try {
      const settings = await SettingsService.loadSettings();
      if (settings.pythonPath) return settings.pythonPath;
    } catch {
      // fall through to default
    }
    return 'python3';
  }

  private static redactBridgeSecrets(
    message: string,
    env: Record<string, string>,
  ): string {
    const secrets = new Set<string>();
    Object.entries(env).forEach(([key, value]) => {
      if (!value) return;
      secrets.add(value);
      if (key === 'ICEBERG_OAUTH_CREDENTIAL') {
        secrets.add(value.slice(value.indexOf(':') + 1));
      }
      if (key === 'ICEBERG_SQL_CATALOG_URI') {
        try {
          const parsed = new URL(
            value.replace(/^postgresql\+psycopg2:/, 'postgresql:'),
          );
          if (parsed.password) secrets.add(decodeURIComponent(parsed.password));
        } catch {
          // The complete URI is still redacted below.
        }
      }
    });
    return [...secrets]
      .filter((secret) => secret.length >= 4)
      .sort((left, right) => right.length - left.length)
      .reduce(
        (redacted, secret) => redacted.split(secret).join('[REDACTED]'),
        message,
      );
  }

  /**
   * Spawns the Python bridge, writes command JSON to stdin, reads result from stdout.
   * BE-04: all async values resolved BEFORE entering new Promise constructor.
   */
  private static async runBridge(
    command: object,
    env: Record<string, string> = {},
    timeoutMs = 120_000,
  ): Promise<unknown> {
    const pythonPath = await IcebergDatalakeService.getPythonPath();
    const bridgePath = IcebergDatalakeService.getBridgePath();

    return new Promise((resolve, reject) => {
      const child = spawn(pythonPath, [bridgePath], {
        env: { ...process.env, ...env },
      });
      let stdout = '';
      let stderr = '';
      let settled = false;
      let timer: ReturnType<typeof setTimeout>;
      const finish = (fn: () => void) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        fn();
      };
      timer = setTimeout(() => {
        child.kill('SIGKILL');
        finish(() => reject(new Error('ICEBERG_BRIDGE_TIMEOUT')));
      }, timeoutMs);
      child.stdout.on('data', (d: Buffer) => {
        stdout += d.toString();
      });
      child.stderr.on('data', (d: Buffer) => {
        stderr += d.toString();
      });
      child.stdin.on('error', (err: Error) => finish(() => reject(err)));
      child.stdin.write(JSON.stringify(command));
      child.stdin.end();
      child.on('close', (code: number) => {
        finish(() => {
          try {
            const result = JSON.parse(stdout) as Record<string, unknown>;
            if (!result.ok) {
              reject(
                new Error(
                  IcebergDatalakeService.redactBridgeSecrets(
                    (result.error as string) ?? 'Bridge error',
                    env,
                  ),
                ),
              );
            } else {
              resolve(result);
            }
          } catch {
            reject(
              new Error(
                IcebergDatalakeService.redactBridgeSecrets(
                  `Bridge parse error (exit ${code}): ${stderr}`,
                  env,
                ),
              ),
            );
          }
        });
      });
      child.on('error', (err: Error) => finish(() => reject(err)));
    });
  }

  // ─────────────────────────────────────────────
  //  Private: catalog properties builder
  // ─────────────────────────────────────────────

  /**
   * Builds the catalog properties object and env map from an instance config.
   * Secrets are passed via env vars using the __ENV:VARNAME__ placeholder pattern.
   */
  private static async buildCatalogProperties(
    instance: IcebergInstanceConfig,
  ): Promise<{ props: Record<string, string>; env: Record<string, string> }> {
    const props: Record<string, string> = {};
    const env: Record<string, string> = {};

    switch (instance.catalogType) {
      case 'sqlite':
        props.type = 'sql';
        if (instance.catalogPath) {
          props.uri = `sqlite:///${instance.catalogPath}`;
        }
        if (instance.localPath) {
          props.warehouse = pathToFileURL(instance.localPath).href;
        }
        break;

      case 'sql': {
        const sqlCatalog =
          await IcebergDatalakeService.buildPostgresCatalogUri(instance);
        props.type = 'sql';
        props.uri = '__ENV:ICEBERG_SQL_CATALOG_URI';
        env.ICEBERG_SQL_CATALOG_URI = sqlCatalog;
        break;
      }

      case 'rest':
      case 'polaris':
      case 'lakekeeper':
      case 'nessie':
        props.type = 'rest';
        if (instance.catalogType === 'nessie') {
          props.uri = IcebergDatalakeService.buildNessieRestUri(instance);
          props['header.X-Iceberg-Access-Delegation'] = 'remote-signing';
        } else {
          if (instance.endpoint) props.uri = instance.endpoint;
          if (instance.catalogName) props.warehouse = instance.catalogName;
          if (instance.catalogType === 'lakekeeper') {
            props['header.X-Iceberg-Access-Delegation'] = 'remote-signing';
          }
        }
        // Access token via env var
        if (instance.catalogAccessTokenKey) {
          try {
            const token = await secureStorage.getCredential(
              instance.catalogAccessTokenKey,
            );
            if (token) {
              props.token = '__ENV:ICEBERG_ACCESS_TOKEN';
              // eslint-disable-next-line dot-notation
              env['ICEBERG_ACCESS_TOKEN'] = token;
            }
          } catch (tokenError) {
            // eslint-disable-next-line no-console
            console.error(
              '[IcebergDatalakeService] token retrieval error:',
              tokenError,
            );
          }
        }
        if (
          instance.catalogAuthMode === 'oauth-client-credentials' &&
          instance.oauthClientId &&
          instance.oauthClientSecretKey
        ) {
          const clientSecret = await secureStorage.getCredential(
            instance.oauthClientSecretKey,
          );
          if (!clientSecret) {
            throw new Error('ICEBERG_OAUTH_SECRET_NOT_FOUND');
          }
          props.credential = '__ENV:ICEBERG_OAUTH_CREDENTIAL';
          env.ICEBERG_OAUTH_CREDENTIAL = `${instance.oauthClientId}:${clientSecret}`;
          if (instance.oauthServerUri) {
            props['oauth2-server-uri'] = instance.oauthServerUri;
          }
          if (instance.oauthScope) props.scope = instance.oauthScope;
          delete props.token;
          delete env.ICEBERG_ACCESS_TOKEN;
        }
        break;

      case 'hive':
        props.type = 'hive';
        props.uri = IcebergDatalakeService.buildHiveMetastoreUri(instance);
        if (instance.hiveUgi?.trim()) props.ugi = instance.hiveUgi.trim();
        break;

      default:
        throw new Error(`ICEBERG_CATALOG_NOT_ENABLED: ${instance.catalogType}`);
    }

    const warehouse =
      await IcebergDatalakeService.buildWarehouseProperties(instance);
    return {
      props: { ...props, ...warehouse.props },
      env: { ...env, ...warehouse.env },
    };
  }

  private static buildNessieRestUri(
    config: Pick<
      IcebergInstanceConfig,
      'endpoint' | 'nessieReference' | 'nessieWarehouse'
    >,
  ): string {
    const endpoint = config.endpoint?.trim().replace(/\/+$/, '');
    const reference = config.nessieReference?.trim();
    if (!endpoint) throw new Error('ICEBERG_REQUIRED_FIELD: endpoint');
    if (!reference) {
      throw new Error('ICEBERG_REQUIRED_FIELD: nessieReference');
    }
    let parsed: URL;
    try {
      parsed = new URL(endpoint);
    } catch {
      throw new Error('ICEBERG_NESSIE_ENDPOINT_INVALID');
    }
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      throw new Error('ICEBERG_NESSIE_ENDPOINT_INVALID');
    }
    if (!parsed.pathname.endsWith('/iceberg')) {
      throw new Error('ICEBERG_NESSIE_ICEBERG_REST_ENDPOINT_REQUIRED');
    }
    const warehouse = config.nessieWarehouse?.trim();
    return `${endpoint}/${encodeURIComponent(reference)}${
      warehouse ? `|${encodeURIComponent(warehouse)}` : ''
    }`;
  }

  private static buildHiveMetastoreUri(
    config: Pick<IcebergInstanceConfig, 'hiveUri'>,
  ): string {
    const rawUri = config.hiveUri?.trim();
    if (!rawUri) throw new Error('ICEBERG_REQUIRED_FIELD: hiveUri');

    const uris = rawUri.split(',').map((value) => value.trim());
    if (uris.some((value) => !value)) {
      throw new Error('ICEBERG_HIVE_URI_INVALID');
    }
    const hasInvalidUri = uris.some((uri) => {
      try {
        const parsed = new URL(uri);
        return (
          parsed.protocol !== 'thrift:' ||
          !parsed.hostname ||
          !parsed.port ||
          !!parsed.username ||
          !!parsed.password ||
          (!!parsed.pathname && parsed.pathname !== '/')
        );
      } catch {
        return true;
      }
    });
    if (hasInvalidUri) throw new Error('ICEBERG_HIVE_URI_INVALID');
    return uris.join(',');
  }

  private static async buildWarehouseProperties(
    instance: IcebergInstanceConfig,
  ): Promise<{ props: Record<string, string>; env: Record<string, string> }> {
    const props: Record<string, string> = {};
    const env: Record<string, string> = {};

    if (instance.storageType === 'server-managed') return { props, env };
    if (instance.storageType === 'local' && instance.localPath) {
      props.warehouse = pathToFileURL(instance.localPath).href;
    }

    if (instance.storageConnectionId) {
      try {
        const db = await loadDatabaseFile();
        const conn: CloudConnection | undefined = (db.sources ?? []).find(
          (s) => s.id === instance.storageConnectionId,
        );
        if (conn) {
          const { provider, config, id: connId } = conn;

          // Non-secret config fields are safe to read from the persisted config object.
          // Secrets (secretAccessKey, accountKey, credentials JSON) are stored in keytar
          // under provider-specific keys — matching the pattern used by DuckLake.service.ts.
          const cfg = config as unknown as Record<string, string>;

          const s3LikeProviders = [
            'aws',
            'minio',
            'cloudflare-r2',
            'backblaze-b2',
            'rustfs',
            'garage',
          ];

          if (s3LikeProviders.includes(provider)) {
            // Non-secret fields from config
            if (cfg.endpoint) props['s3.endpoint'] = cfg.endpoint;
            if (cfg.region) props['s3.region'] = cfg.region;
            if (cfg.accessKeyId) {
              props['s3.access-key-id'] = cfg.accessKeyId;
            }
            // Secret key from keytar: cloud-{provider}-{connectionId}
            const secretKey = await secureStorage.getCredential(
              `cloud-${provider}-${connId}`,
            );
            if (secretKey) {
              props['s3.secret-access-key'] = '__ENV:ICEBERG_S3_SECRET__';
              // eslint-disable-next-line dot-notation
              env['ICEBERG_S3_SECRET__'] = secretKey;
            }
            // Optional session token (AWS only)
            if (provider === 'aws') {
              const sessionToken = await secureStorage.getCredential(
                `cloud-aws-session-${connId}`,
              );
              if (sessionToken) {
                props['s3.session-token'] = '__ENV:ICEBERG_S3_SESSION__';
                // eslint-disable-next-line dot-notation
                env['ICEBERG_S3_SESSION__'] = sessionToken;
              }
            }
          } else if (provider === 'azure') {
            if (cfg.accountName) props['adls.account-name'] = cfg.accountName;
            // Secret from keytar: cloud-azure-{connectionId}
            const accountKey = await secureStorage.getCredential(
              `cloud-azure-${connId}`,
            );
            if (accountKey) {
              props['adls.account-key'] = '__ENV:ICEBERG_ADLS_KEY__';
              // eslint-disable-next-line dot-notation
              env['ICEBERG_ADLS_KEY__'] = accountKey;
            }
          } else if (provider === 'gcs') {
            if (cfg.projectId) props['gcs.project-id'] = cfg.projectId;
            // GCS credentials JSON from keytar: cloud-gcs-{connectionId}
            const gcsCreds = await secureStorage.getCredential(
              `cloud-gcs-${connId}`,
            );
            if (gcsCreds) {
              props['gcs.credentials'] = '__ENV:ICEBERG_GCS_CREDS__';
              // eslint-disable-next-line dot-notation
              env['ICEBERG_GCS_CREDS__'] = gcsCreds;
            }
          }

          if (instance.storageBucket) {
            const prefix = instance.storagePrefix
              ? `/${instance.storagePrefix.replace(/^\/+|\/+$/g, '')}`
              : '';
            if (provider === 'azure' && cfg.accountName) {
              props.warehouse = `abfs://${instance.storageBucket}@${cfg.accountName}.dfs.core.windows.net${prefix}`;
            } else if (provider === 'gcs') {
              props.warehouse = `gs://${instance.storageBucket}${prefix}`;
            } else if (s3LikeProviders.includes(provider)) {
              props.warehouse = `s3://${instance.storageBucket}${prefix}`;
            }
          }
        }
      } catch (connError) {
        // eslint-disable-next-line no-console
        console.error(
          '[IcebergDatalakeService] cloud connection lookup error:',
          connError,
        );
      }
    }

    return { props, env };
  }

  private static async buildPostgresCatalogUri(
    config: Pick<IcebergInstanceConfig, 'databaseConnectionId'>,
  ): Promise<string> {
    if (!config.databaseConnectionId) {
      throw new Error('ICEBERG_REQUIRED_FIELD: databaseConnectionId');
    }
    const db = await loadDatabaseFile();
    const model = (db.connections ?? []).find(
      (item) => item.id === config.databaseConnectionId,
    );
    if (!model || model.connection.type !== 'postgres') {
      throw new Error('ICEBERG_SQL_CONNECTION_INVALID');
    }
    const connection = model.connection as PostgresConnection;
    const username = await secureStorage.getCredential(
      `db-user-${connection.name}`,
    );
    const password = await secureStorage.getCredential(
      `db-password-${connection.name}`,
    );
    if (!username || !password) {
      throw new Error('ICEBERG_SQL_CREDENTIALS_MISSING');
    }
    const auth = `${encodeURIComponent(username)}:${encodeURIComponent(
      password,
    )}`;
    const host = connection.host.trim();
    const database = encodeURIComponent(connection.database);
    const sslMode = connection.ssl ? '?sslmode=require' : '';
    return `postgresql+psycopg2://${auth}@${host}:${connection.port}/${database}${sslMode}`;
  }

  private static getCatalogCapability(
    catalogType: IcebergInstanceConfig['catalogType'],
  ): IcebergCatalogCapability {
    const capability = IcebergDatalakeService.catalogCapabilities.find(
      (item) => item.type === catalogType,
    );
    if (!capability) {
      throw new Error(`ICEBERG_CATALOG_UNSUPPORTED: ${catalogType}`);
    }
    return capability;
  }

  private static validateCatalogWarehousePair(
    config: Pick<
      IcebergInstanceConfig,
      | 'catalogType'
      | 'storageType'
      | 'catalogPath'
      | 'endpoint'
      | 'catalogName'
      | 'databaseConnectionId'
      | 'localPath'
      | 'storageConnectionId'
      | 'storageBucket'
      | 'nessieReference'
      | 'nessieWarehouse'
      | 'hiveUri'
      | 'hiveUgi'
    >,
    validateWarehouseFields = true,
  ): void {
    const capability = IcebergDatalakeService.getCatalogCapability(
      config.catalogType,
    );
    if (!capability.enabled) {
      throw new Error(`ICEBERG_CATALOG_NOT_ENABLED: ${config.catalogType}`);
    }
    if (!capability.allowedStorageTypes.includes(config.storageType)) {
      throw new Error(
        `ICEBERG_WAREHOUSE_NOT_ALLOWED: ${config.catalogType}/${config.storageType}`,
      );
    }
    const missingField = capability.requiredFields.find(
      (field) => !config[field]?.trim(),
    );
    if (missingField) {
      throw new Error(`ICEBERG_REQUIRED_FIELD: ${missingField}`);
    }
    if (config.catalogType === 'nessie') {
      IcebergDatalakeService.buildNessieRestUri(config);
    }
    if (config.catalogType === 'hive') {
      IcebergDatalakeService.buildHiveMetastoreUri(config);
      if (config.hiveUgi && !/^[^:]+:[^:]+$/.test(config.hiveUgi.trim())) {
        throw new Error('ICEBERG_HIVE_UGI_INVALID');
      }
    }
    if (
      validateWarehouseFields &&
      config.storageType === 'local' &&
      !config.localPath?.trim()
    ) {
      throw new Error('ICEBERG_REQUIRED_FIELD: localPath');
    }
    if (
      validateWarehouseFields &&
      config.storageType === 'cloud' &&
      (!config.storageConnectionId?.trim() || !config.storageBucket?.trim())
    ) {
      throw new Error(
        'ICEBERG_REQUIRED_FIELD: storageConnectionId/storageBucket',
      );
    }
  }

  private static validateCatalogAuthentication(config: {
    catalogType: IcebergInstanceConfig['catalogType'];
    catalogAuthMode?: IcebergInstanceConfig['catalogAuthMode'];
    accessToken?: string;
    catalogAccessTokenKey?: string;
    oauthClientId?: string;
    oauthClientSecret?: string;
    oauthClientSecretKey?: string;
    oauthServerUri?: string;
  }): void {
    const mode = config.catalogAuthMode ?? 'none';
    if (
      mode !== 'none' &&
      config.catalogType !== 'rest' &&
      config.catalogType !== 'polaris' &&
      config.catalogType !== 'lakekeeper' &&
      config.catalogType !== 'nessie'
    ) {
      throw new Error(
        `ICEBERG_AUTH_MODE_NOT_ALLOWED: ${config.catalogType}/${mode}`,
      );
    }
    if (
      mode === 'token' &&
      !config.accessToken &&
      !config.catalogAccessTokenKey
    ) {
      throw new Error('ICEBERG_ACCESS_TOKEN_REQUIRED');
    }
    if (mode === 'oauth-client-credentials') {
      if (!config.oauthClientId?.trim() || config.oauthClientId.includes(':')) {
        throw new Error('ICEBERG_OAUTH_CLIENT_ID_INVALID');
      }
      if (!config.oauthClientSecret && !config.oauthClientSecretKey) {
        throw new Error('ICEBERG_OAUTH_CLIENT_SECRET_REQUIRED');
      }
      if (!config.oauthServerUri?.trim()) {
        throw new Error('ICEBERG_OAUTH_SERVER_URI_REQUIRED');
      }
    }
  }

  private static async validateSqlStorageBinding(
    config: Pick<
      IcebergInstanceConfig,
      | 'catalogType'
      | 'nessieWarehouse'
      | 'sqlEnabled'
      | 'sqlStorageConnectionId'
      | 'sqlStorageProvider'
      | 'sqlStorageBucket'
      | 'sqlWarehouseMatchAcknowledged'
    >,
  ): Promise<void> {
    if (!config.sqlEnabled) return;
    if (
      config.catalogType !== 'rest' &&
      config.catalogType !== 'polaris' &&
      config.catalogType !== 'lakekeeper' &&
      config.catalogType !== 'nessie'
    ) {
      throw new Error('ICEBERG_SQL_REST_CATALOG_REQUIRED');
    }
    if (config.catalogType === 'nessie' && !config.nessieWarehouse?.trim()) {
      throw new Error('ICEBERG_SQL_NESSIE_WAREHOUSE_REQUIRED');
    }
    if (
      !config.sqlStorageConnectionId?.trim() ||
      !config.sqlStorageProvider ||
      !config.sqlStorageBucket?.trim()
    ) {
      throw new Error(
        'ICEBERG_REQUIRED_FIELD: sqlStorageConnectionId/sqlStorageProvider/sqlStorageBucket',
      );
    }
    if (!config.sqlWarehouseMatchAcknowledged) {
      throw new Error('ICEBERG_SQL_WAREHOUSE_MATCH_REQUIRED');
    }

    const { connection } =
      await IcebergDatalakeService.resolveCloudStorageConnection(
        config.sqlStorageConnectionId,
      );
    if (
      !IcebergDatalakeService.duckdbIcebergStorageProviders.includes(
        connection.provider as (typeof IcebergDatalakeService.duckdbIcebergStorageProviders)[number],
      )
    ) {
      throw new Error('ICEBERG_SQL_STORAGE_PROVIDER_NOT_SUPPORTED');
    }
    if (config.sqlStorageProvider !== connection.provider) {
      throw new Error('ICEBERG_SQL_STORAGE_PROVIDER_MISMATCH');
    }
  }

  private static quoteSqlLiteral(value: string): string {
    return `'${value.replace(/'/g, "''")}'`;
  }

  private static quoteSqlIdentifier(value: string): string {
    return `"${value.replace(/"/g, '""')}"`;
  }

  private static getSqlRuntimeFingerprint(): string {
    try {
      // eslint-disable-next-line global-require, @typescript-eslint/no-var-requires
      const pkg = require('@duckdb/node-api/package.json');
      return `duckdb-node-api:${String(pkg.version)}`;
    } catch {
      return 'duckdb-node-api:unknown';
    }
  }

  private static async buildDuckDbIcebergSql(
    instance: IcebergInstanceConfig,
    names: { catalogSecret: string; storageSecret: string; alias: string },
  ): Promise<{
    catalogSecretSql: string;
    storageSecretSql: string;
    attachSql: string;
  }> {
    await IcebergDatalakeService.validateSqlStorageBinding(instance);
    const connectionId = instance.sqlStorageConnectionId!;
    const { connection, config } =
      await IcebergDatalakeService.resolveCloudStorageConnection(connectionId);
    const cfg = config as Record<string, unknown>;
    const keyId = String(cfg.accessKeyId ?? cfg.applicationKeyId ?? '').trim();
    const secret = String(
      cfg.secretAccessKey ?? cfg.applicationKey ?? '',
    ).trim();
    if (!keyId || !secret) {
      throw new Error('ICEBERG_SQL_STORAGE_CREDENTIALS_MISSING');
    }

    const storageOptions = [
      'TYPE S3',
      `KEY_ID ${IcebergDatalakeService.quoteSqlLiteral(keyId)}`,
      `SECRET ${IcebergDatalakeService.quoteSqlLiteral(secret)}`,
      `REGION ${IcebergDatalakeService.quoteSqlLiteral(String(cfg.region ?? 'us-east-1'))}`,
      `SCOPE ${IcebergDatalakeService.quoteSqlLiteral(
        `s3://${instance.sqlStorageBucket}/${instance.sqlStoragePrefix?.replace(/^\/+|\/+$/g, '') ?? ''}`,
      )}`,
    ];
    if (cfg.sessionToken) {
      storageOptions.push(
        `SESSION_TOKEN ${IcebergDatalakeService.quoteSqlLiteral(String(cfg.sessionToken))}`,
      );
    }
    if (cfg.endpoint) {
      const endpoint = String(cfg.endpoint);
      const parsed = new URL(
        endpoint.includes('://') ? endpoint : `https://${endpoint}`,
      );
      storageOptions.push(
        `ENDPOINT ${IcebergDatalakeService.quoteSqlLiteral(parsed.host)}`,
        `USE_SSL ${parsed.protocol === 'https:' ? 'true' : 'false'}`,
      );
    }
    if (connection.provider !== 'aws') {
      storageOptions.push(
        `URL_STYLE ${IcebergDatalakeService.quoteSqlLiteral(String(cfg.urlStyle ?? 'path'))}`,
      );
    }

    const catalogOptions = ['TYPE ICEBERG'];
    if (instance.catalogAuthMode === 'token') {
      const token = instance.catalogAccessTokenKey
        ? await secureStorage.getCredential(instance.catalogAccessTokenKey)
        : undefined;
      if (!token) throw new Error('ICEBERG_ACCESS_TOKEN_REQUIRED');
      catalogOptions.push(
        `TOKEN ${IcebergDatalakeService.quoteSqlLiteral(token)}`,
      );
    } else if (instance.catalogAuthMode === 'oauth-client-credentials') {
      const clientSecret = instance.oauthClientSecretKey
        ? await secureStorage.getCredential(instance.oauthClientSecretKey)
        : undefined;
      if (
        !instance.oauthClientId ||
        !clientSecret ||
        !instance.oauthServerUri
      ) {
        throw new Error('ICEBERG_OAUTH_CLIENT_CREDENTIALS_REQUIRED');
      }
      catalogOptions.push(
        `CLIENT_ID ${IcebergDatalakeService.quoteSqlLiteral(instance.oauthClientId)}`,
        `CLIENT_SECRET ${IcebergDatalakeService.quoteSqlLiteral(clientSecret)}`,
        `OAUTH2_SERVER_URI ${IcebergDatalakeService.quoteSqlLiteral(instance.oauthServerUri)}`,
      );
      if (instance.oauthScope) {
        catalogOptions.push(
          `OAUTH2_SCOPE ${IcebergDatalakeService.quoteSqlLiteral(instance.oauthScope)}`,
        );
      } else if (
        instance.catalogType === 'nessie' ||
        instance.catalogType === 'lakekeeper'
      ) {
        // DuckDB otherwise defaults to PRINCIPAL_ROLE:ALL, which standard
        // Nessie and Lakekeeper OIDC clients commonly reject. Request the
        // catalog scope assigned to their service clients.
        catalogOptions.push(
          `OAUTH2_SCOPE ${IcebergDatalakeService.quoteSqlLiteral('catalog')}`,
        );
      }
    }

    const configuredEndpoint = instance.endpoint?.trim();
    if (!configuredEndpoint)
      throw new Error('ICEBERG_REQUIRED_FIELD: endpoint');
    const endpoint = configuredEndpoint.replace(/\/+$/, '');
    const warehouse =
      instance.catalogType === 'nessie'
        ? instance.nessieWarehouse?.trim()
        : instance.catalogName;
    if (!warehouse) throw new Error('ICEBERG_REQUIRED_FIELD: catalogName');

    return {
      storageSecretSql: `CREATE TEMPORARY SECRET ${IcebergDatalakeService.quoteSqlIdentifier(
        names.storageSecret,
      )} (${storageOptions.join(', ')})`,
      catalogSecretSql: `CREATE TEMPORARY SECRET ${IcebergDatalakeService.quoteSqlIdentifier(
        names.catalogSecret,
      )} (${catalogOptions.join(', ')})`,
      attachSql: `ATTACH ${IcebergDatalakeService.quoteSqlLiteral(
        warehouse,
      )} AS ${IcebergDatalakeService.quoteSqlIdentifier(names.alias)} (TYPE ICEBERG, SECRET ${IcebergDatalakeService.quoteSqlIdentifier(
        names.catalogSecret,
      )}, ENDPOINT ${IcebergDatalakeService.quoteSqlLiteral(
        endpoint,
      )}, ACCESS_DELEGATION_MODE ${IcebergDatalakeService.quoteSqlLiteral('none')}${
        (instance.catalogAuthMode ?? 'none') === 'none'
          ? `, AUTHORIZATION_TYPE ${IcebergDatalakeService.quoteSqlLiteral('none')}`
          : ''
      })`,
    };
  }

  static getCapabilities(): IcebergCapabilities {
    return {
      catalogs: IcebergDatalakeService.catalogCapabilities.map((item) => ({
        ...item,
        authModes: [...item.authModes],
        requiredFields: [...item.requiredFields],
        allowedStorageTypes: [...item.allowedStorageTypes],
      })),
      cloudProviders: [...IcebergDatalakeService.cloudProviders],
    };
  }

  // ─────────────────────────────────────────────
  //  Public: CRUD
  // ─────────────────────────────────────────────

  static async listInstances(): Promise<IcebergInstanceListItem[]> {
    try {
      const instances = await IcebergDatalakeService.readInstances();
      const runtimeFingerprint =
        IcebergDatalakeService.getSqlRuntimeFingerprint();
      return instances.map(
        ({
          id,
          name,
          description,
          catalogType,
          storageType,
          catalogPath,
          localPath,
          storageBucket,
          sqlEnabled,
          sqlAccessVerifiedAt,
          sqlRuntimeFingerprint,
          createdAt,
          updatedAt,
        }) => {
          let sqlUnavailableReason: string | undefined;
          if (!sqlEnabled) {
            sqlUnavailableReason = 'ICEBERG_SQL_DISABLED';
          } else if (
            !sqlAccessVerifiedAt ||
            sqlRuntimeFingerprint !== runtimeFingerprint
          ) {
            sqlUnavailableReason = 'ICEBERG_SQL_UNVERIFIED';
          }
          return {
            id,
            name,
            description,
            catalogType,
            storageType,
            catalogPath,
            localPath,
            storageBucket,
            sqlAvailable:
              !!sqlEnabled &&
              !!sqlAccessVerifiedAt &&
              sqlRuntimeFingerprint === runtimeFingerprint,
            sqlUnavailableReason,
            createdAt,
            updatedAt,
          };
        },
      );
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('[IcebergDatalakeService] listInstances error:', error);
      throw error;
    }
  }

  static async getInstance(id: string): Promise<IcebergInstanceConfig> {
    try {
      const instances = await IcebergDatalakeService.readInstances();
      const instance = instances.find((i) => i.id === id);
      if (!instance) throw new Error(`Iceberg instance not found: ${id}`);
      return instance;
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('[IcebergDatalakeService] getInstance error:', error);
      throw error;
    }
  }

  static async createInstance(
    data: CreateIcebergInstanceDTO,
  ): Promise<IcebergInstanceConfig> {
    try {
      IcebergDatalakeService.validateCatalogWarehousePair(data);
      IcebergDatalakeService.validateCatalogAuthentication(data);
      await IcebergDatalakeService.validateSqlStorageBinding(data);
      const id = uuidv4();
      const now = new Date().toISOString();

      let catalogAccessTokenKey: `iceberg-catalog-token-${string}` | undefined;
      if (data.accessToken) {
        catalogAccessTokenKey = `iceberg-catalog-token-${id}`;
        await secureStorage.setCredential(
          catalogAccessTokenKey,
          data.accessToken,
        );
      }

      let oauthClientSecretKey: `iceberg-oauth-secret-${string}` | undefined;
      if (data.oauthClientSecret) {
        oauthClientSecretKey = `iceberg-oauth-secret-${id}`;
        await secureStorage.setCredential(
          oauthClientSecretKey,
          data.oauthClientSecret,
        );
      }

      // Strip raw secrets before persisting
      /* eslint-disable @typescript-eslint/no-unused-vars */
      const {
        accessToken: _accessTokenCreate,
        oauthClientSecret: _oauthClientSecretCreate,
        ...rest
      } = data;
      /* eslint-enable @typescript-eslint/no-unused-vars */

      const newInstance: IcebergInstanceConfig = {
        ...rest,
        id,
        catalogAccessTokenKey:
          catalogAccessTokenKey ?? data.catalogAccessTokenKey,
        oauthClientSecretKey: oauthClientSecretKey ?? data.oauthClientSecretKey,
        createdAt: now,
        updatedAt: now,
      };

      const instances = await IcebergDatalakeService.readInstances();
      instances.push(newInstance);
      await IcebergDatalakeService.writeInstances(instances);

      return newInstance;
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('[IcebergDatalakeService] createInstance error:', error);
      throw error;
    }
  }

  static async updateInstance(
    id: string,
    data: UpdateIcebergInstanceDTO,
  ): Promise<IcebergInstanceConfig> {
    try {
      const instances = await IcebergDatalakeService.readInstances();
      const idx = instances.findIndex((i) => i.id === id);
      if (idx < 0) throw new Error(`Iceberg instance not found: ${id}`);

      const updatedConfig = {
        ...instances[idx],
        ...data,
      };
      const sqlAttachmentChanged =
        [
          'catalogType',
          'endpoint',
          'catalogName',
          'catalogAuthMode',
          'oauthClientId',
          'oauthServerUri',
          'oauthScope',
          'nessieReference',
          'nessieWarehouse',
          'sqlEnabled',
          'sqlStorageConnectionId',
          'sqlStorageProvider',
          'sqlStorageBucket',
          'sqlStoragePrefix',
          'sqlWarehouseMatchAcknowledged',
        ].some(
          (field) =>
            data[field as keyof UpdateIcebergInstanceDTO] !== undefined &&
            data[field as keyof UpdateIcebergInstanceDTO] !==
              instances[idx][field as keyof IcebergInstanceConfig],
        ) ||
        !!data.accessToken ||
        !!data.oauthClientSecret;
      IcebergDatalakeService.validateCatalogWarehousePair(updatedConfig);
      IcebergDatalakeService.validateCatalogAuthentication(updatedConfig);
      await IcebergDatalakeService.validateSqlStorageBinding(updatedConfig);

      // Handle access token update
      if (data.accessToken) {
        const key =
          instances[idx].catalogAccessTokenKey ?? `iceberg-catalog-token-${id}`;
        await secureStorage.setCredential(key, data.accessToken);
        instances[idx].catalogAccessTokenKey = key;
      }

      if (data.oauthClientSecret) {
        const key =
          instances[idx].oauthClientSecretKey ?? `iceberg-oauth-secret-${id}`;
        await secureStorage.setCredential(key, data.oauthClientSecret);
        instances[idx].oauthClientSecretKey = key;
      }

      // Strip raw secrets before persisting
      /* eslint-disable @typescript-eslint/no-unused-vars */
      const {
        accessToken: _accessTokenUpdate,
        oauthClientSecret: _oauthClientSecretUpdate,
        ...rest
      } = data;
      /* eslint-enable @typescript-eslint/no-unused-vars */

      instances[idx] = {
        ...instances[idx],
        ...rest,
        id,
        ...(sqlAttachmentChanged
          ? {
              sqlAccessVerifiedAt: undefined,
              sqlRuntimeFingerprint: undefined,
            }
          : {}),
        updatedAt: new Date().toISOString(),
      };

      await IcebergDatalakeService.writeInstances(instances);
      return instances[idx];
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('[IcebergDatalakeService] updateInstance error:', error);
      throw error;
    }
  }

  static async deleteInstance(id: string): Promise<void> {
    try {
      const instances = await IcebergDatalakeService.readInstances();
      const instance = instances.find((i) => i.id === id);
      if (!instance) throw new Error(`Iceberg instance not found: ${id}`);

      if (instance.catalogAccessTokenKey) {
        try {
          await secureStorage.deleteCredential(instance.catalogAccessTokenKey);
        } catch (keyError) {
          // eslint-disable-next-line no-console
          console.error(
            '[IcebergDatalakeService] keytar delete error:',
            keyError,
          );
        }
      }
      if (instance.oauthClientSecretKey) {
        try {
          await secureStorage.deleteCredential(instance.oauthClientSecretKey);
        } catch (keyError) {
          // eslint-disable-next-line no-console
          console.error(
            '[IcebergDatalakeService] OAuth secret delete error:',
            keyError,
          );
        }
      }

      const updated = instances.filter((i) => i.id !== id);
      await IcebergDatalakeService.writeInstances(updated);
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('[IcebergDatalakeService] deleteInstance error:', error);
      throw error;
    }
  }

  // ─────────────────────────────────────────────
  //  Public: connection testing
  // ─────────────────────────────────────────────

  static async testCatalogConnection(
    params: IcebergTestCatalogParams,
  ): Promise<IcebergTestResult> {
    try {
      const props: Record<string, string> = {};
      const env: Record<string, string> = {};
      let { oauthClientSecret } = params;
      if (
        params.authMode === 'oauth-client-credentials' &&
        !oauthClientSecret &&
        params.instanceId
      ) {
        const existingInstance = await IcebergDatalakeService.getInstance(
          params.instanceId,
        );
        const matchesSavedAuthentication =
          existingInstance.catalogType === params.catalogType &&
          existingInstance.endpoint === params.endpoint &&
          existingInstance.oauthClientId === params.oauthClientId &&
          existingInstance.oauthServerUri === params.oauthServerUri;
        if (!matchesSavedAuthentication) {
          throw new Error('ICEBERG_OAUTH_CLIENT_SECRET_REQUIRED');
        }
        if (existingInstance.oauthClientSecretKey) {
          oauthClientSecret =
            (await secureStorage.getCredential(
              existingInstance.oauthClientSecretKey,
            )) ?? undefined;
        }
      }

      const storageType =
        params.storageType ??
        (params.catalogType === 'sqlite' ? 'local' : 'server-managed');
      IcebergDatalakeService.validateCatalogWarehousePair(
        {
          ...params,
          storageType,
        },
        false,
      );
      IcebergDatalakeService.validateCatalogAuthentication({
        catalogType: params.catalogType,
        catalogAuthMode: params.authMode,
        accessToken: params.accessToken,
        oauthClientId: params.oauthClientId,
        oauthClientSecret,
        oauthServerUri: params.oauthServerUri,
      });

      switch (params.catalogType) {
        case 'sqlite':
          props.type = 'sql';
          if (params.catalogPath) {
            props.uri = `sqlite:///${params.catalogPath}`;
            props.warehouse = pathToFileURL(
              path.join(path.dirname(params.catalogPath), 'warehouse'),
            ).href;
          }
          break;
        case 'sql':
          props.type = 'sql';
          props.uri = '__ENV:ICEBERG_SQL_CATALOG_URI';
          env.ICEBERG_SQL_CATALOG_URI =
            await IcebergDatalakeService.buildPostgresCatalogUri(params);
          props.warehouse = pathToFileURL(
            path.join(app.getPath('temp'), 'dbt-studio-iceberg-test'),
          ).href;
          break;
        case 'rest':
        case 'polaris':
        case 'lakekeeper':
        case 'nessie':
          props.type = 'rest';
          if (params.catalogType === 'nessie') {
            props.uri = IcebergDatalakeService.buildNessieRestUri(params);
            props['header.X-Iceberg-Access-Delegation'] = 'remote-signing';
          } else {
            if (params.endpoint) props.uri = params.endpoint;
            if (params.catalogName) props.warehouse = params.catalogName;
            if (params.catalogType === 'lakekeeper') {
              props['header.X-Iceberg-Access-Delegation'] = 'remote-signing';
            }
          }
          if (params.accessToken) {
            props.token = '__ENV:ICEBERG_ACCESS_TOKEN';
            // eslint-disable-next-line dot-notation
            env['ICEBERG_ACCESS_TOKEN'] = params.accessToken;
          }
          if (params.authMode === 'oauth-client-credentials') {
            if (!params.oauthClientId || !oauthClientSecret) {
              throw new Error('ICEBERG_OAUTH_CLIENT_CREDENTIALS_REQUIRED');
            }
            props.credential = '__ENV:ICEBERG_OAUTH_CREDENTIAL';
            env.ICEBERG_OAUTH_CREDENTIAL = `${params.oauthClientId}:${oauthClientSecret}`;
            if (params.oauthServerUri) {
              props['oauth2-server-uri'] = params.oauthServerUri;
            }
            if (params.oauthScope) props.scope = params.oauthScope;
            delete props.token;
            delete env.ICEBERG_ACCESS_TOKEN;
          }
          break;
        case 'hive':
          props.type = 'hive';
          props.uri = IcebergDatalakeService.buildHiveMetastoreUri(params);
          if (params.hiveUgi?.trim()) props.ugi = params.hiveUgi.trim();
          break;
        default:
          throw new Error(`ICEBERG_CATALOG_NOT_ENABLED: ${params.catalogType}`);
      }

      const result = (await IcebergDatalakeService.runBridge(
        {
          command: 'test_connection',
          catalog_name:
            params.catalogType === 'sqlite'
              ? 'local'
              : (params.catalogName ?? 'test'),
          catalog_properties: props,
        },
        env,
      )) as Record<string, unknown>;
      return {
        success: true,
        catalogConnected: true,
        warehouseConnected:
          typeof result.warehouse_connected === 'boolean'
            ? result.warehouse_connected
            : undefined,
        namespaceCount: Number(result.namespace_count ?? 0),
        tableCount: Number(result.table_count ?? 0),
        checkedAt: new Date().toISOString(),
      };
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error(
        '[IcebergDatalakeService] testCatalogConnection error:',
        error,
      );
      return {
        success: false,
        catalogConnected: false,
        warehouseConnected: false,
        checkedAt: new Date().toISOString(),
        error: String(error),
      };
    }
  }

  static async testStorageConnection(
    params: IcebergTestStorageParams,
  ): Promise<IcebergTestResult> {
    try {
      const connectionId = params.connectionId?.trim();
      const bucket = params.bucket?.trim();
      if (!connectionId || !bucket) {
        throw new Error('ICEBERG_REQUIRED_FIELD: connectionId/bucket');
      }

      const { connection, config } =
        await IcebergDatalakeService.resolveCloudStorageConnection(
          connectionId,
        );

      const CloudExplorerService = (await import('./cloudExplorer.service'))
        .default;
      await CloudExplorerService.listObjects(
        connection.provider,
        config as unknown as CloudStorageConfig,
        bucket,
        undefined,
        params.prefix?.trim() ?? '',
      );
      return {
        success: true,
        warehouseConnected: true,
        checkedAt: new Date().toISOString(),
      };
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error(
        '[IcebergDatalakeService] testStorageConnection error:',
        error,
      );
      return {
        success: false,
        warehouseConnected: false,
        checkedAt: new Date().toISOString(),
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  static async listStorageBuckets(
    params: IcebergListStorageBucketsParams,
  ): Promise<string[]> {
    const connectionId = params.connectionId?.trim();
    if (!connectionId) {
      throw new Error('ICEBERG_REQUIRED_FIELD: connectionId');
    }
    const { connection, config } =
      await IcebergDatalakeService.resolveCloudStorageConnection(connectionId);
    const CloudExplorerService = (await import('./cloudExplorer.service'))
      .default;
    const buckets = await CloudExplorerService.listBuckets(
      connection.provider,
      config as unknown as CloudStorageConfig,
    );
    return buckets.map((bucket) => bucket.name);
  }

  private static async resolveCloudStorageConnection(connectionId: string) {
    const db = await loadDatabaseFile();
    const connection = (db.sources ?? []).find(
      (source) => source.id === connectionId,
    );
    if (!connection) throw new Error('ICEBERG_CLOUD_CONNECTION_NOT_FOUND');
    if (
      !IcebergDatalakeService.cloudProviders.includes(
        connection.provider as (typeof IcebergDatalakeService.cloudProviders)[number],
      )
    ) {
      throw new Error('ICEBERG_CLOUD_PROVIDER_NOT_SUPPORTED');
    }

    const config = { ...connection.config } as Record<string, unknown>;
    const secret = await secureStorage.getCredential(
      `cloud-${connection.provider}-${connection.id}`,
    );
    if (connection.provider === 'azure') config.accountKey = secret;
    else if (connection.provider === 'gcs') config.credentials = secret;
    else if (connection.provider === 'backblaze-b2') {
      config.applicationKey = secret;
    } else config.secretAccessKey = secret;

    if (connection.provider === 'aws') {
      const sessionToken = await secureStorage.getCredential(
        `cloud-aws-session-${connection.id}`,
      );
      if (sessionToken) config.sessionToken = sessionToken;
    }
    return { connection, config };
  }

  static async testInstanceConnection(id: string): Promise<IcebergTestResult> {
    try {
      const instance = await IcebergDatalakeService.getInstance(id);
      const { props, env } =
        await IcebergDatalakeService.buildCatalogProperties(instance);
      const result = (await IcebergDatalakeService.runBridge(
        {
          command: 'test_connection',
          catalog_name:
            instance.catalogType === 'sqlite'
              ? 'local'
              : (instance.catalogName ?? id),
          catalog_properties: props,
        },
        env,
      )) as Record<string, unknown>;
      return {
        success: true,
        catalogConnected: true,
        warehouseConnected:
          typeof result.warehouse_connected === 'boolean'
            ? result.warehouse_connected
            : undefined,
        namespaceCount: Number(result.namespace_count ?? 0),
        tableCount: Number(result.table_count ?? 0),
        checkedAt: new Date().toISOString(),
      };
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error(
        '[IcebergDatalakeService] testInstanceConnection error:',
        error,
      );
      return {
        success: false,
        catalogConnected: false,
        warehouseConnected: false,
        checkedAt: new Date().toISOString(),
        error: String(error),
      };
    }
  }

  static async getSqlCapability(id: string): Promise<IcebergSqlCapability> {
    const instance = await IcebergDatalakeService.getInstance(id);
    const runtimeFingerprint =
      IcebergDatalakeService.getSqlRuntimeFingerprint();
    if (!instance.sqlEnabled) {
      return {
        available: false,
        reason: 'ICEBERG_SQL_DISABLED',
        canRead: false,
        canWrite: false,
        supportedStatements: [],
      };
    }
    if (
      !instance.sqlAccessVerifiedAt ||
      instance.sqlRuntimeFingerprint !== runtimeFingerprint
    ) {
      return {
        available: false,
        reason: 'ICEBERG_SQL_UNVERIFIED',
        runtimeFingerprint,
        canRead: false,
        canWrite: false,
        supportedStatements: [],
      };
    }
    return {
      available: true,
      runtimeFingerprint,
      canRead: true,
      canWrite: true,
      supportedStatements: [
        'select',
        'create',
        'drop',
        'insert',
        'update',
        'delete',
      ],
    };
  }

  static async verifySqlAccess(id: string): Promise<IcebergTestResult> {
    try {
      const executionId = `verify-${uuidv4()}`;
      await IcebergDatalakeService.withAttachedSqlCatalog(
        id,
        executionId,
        async (connection, alias) => {
          await connection.runAndReadUntil(
            'SELECT table_schema, table_name FROM information_schema.tables WHERE table_catalog = ? LIMIT 1',
            1,
            [alias],
          );
        },
      );
      const runtimeFingerprint =
        IcebergDatalakeService.getSqlRuntimeFingerprint();
      const instances = await IcebergDatalakeService.readInstances();
      const index = instances.findIndex((instance) => instance.id === id);
      if (index < 0) throw new Error(`Iceberg instance not found: ${id}`);
      const checkedAt = new Date().toISOString();
      instances[index] = {
        ...instances[index],
        sqlAccessVerifiedAt: checkedAt,
        sqlRuntimeFingerprint: runtimeFingerprint,
        updatedAt: checkedAt,
      };
      await IcebergDatalakeService.writeInstances(instances);
      return {
        success: true,
        catalogConnected: true,
        warehouseConnected: true,
        checkedAt,
      };
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('[IcebergDatalakeService] verifySqlAccess error');
      return {
        success: false,
        catalogConnected: false,
        warehouseConnected: false,
        checkedAt: new Date().toISOString(),
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  private static async withAttachedSqlCatalog<T>(
    instanceId: string,
    executionId: string,
    callback: (connection: any, alias: string) => Promise<T>,
  ): Promise<T> {
    if (!executionId.trim() || executionId.length > 120) {
      throw new Error('ICEBERG_SQL_EXECUTION_ID_INVALID');
    }
    if (IcebergDatalakeService.activeSqlExecutions.has(executionId)) {
      throw new Error('ICEBERG_SQL_EXECUTION_ID_DUPLICATE');
    }
    const instance = await IcebergDatalakeService.getInstance(instanceId);
    const suffix = uuidv4().replace(/-/g, '');
    const names = {
      alias: 'iceberg',
      catalogSecret: `iceberg_catalog_${suffix}`,
      storageSecret: `iceberg_storage_${suffix}`,
    };
    const sql = await IcebergDatalakeService.buildDuckDbIcebergSql(
      instance,
      names,
    );
    let duckdbInstance: any;
    let connection: any;
    let attached = false;
    let stage = 'initialize';
    try {
      duckdbInstance = await DuckDBInstance.create(':memory:');
      connection = await duckdbInstance.connect();
      IcebergDatalakeService.activeSqlExecutions.set(executionId, connection);
      stage = 'install-extensions';
      await connection.run('INSTALL httpfs');
      await connection.run('INSTALL iceberg');
      stage = 'load-extensions';
      await connection.run('LOAD httpfs');
      await connection.run('LOAD iceberg');
      stage = 'create-storage-secret';
      await connection.run(sql.storageSecretSql);
      stage = 'create-catalog-secret';
      await connection.run(sql.catalogSecretSql);
      stage = 'attach';
      await connection.run(sql.attachSql);
      attached = true;
      stage = 'execute';
      return await callback(connection, names.alias);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (message.startsWith('ICEBERG_')) throw error;
      if (stage === 'execute') {
        const safeReason = message
          .split('\n')
          .map((line) => line.trim())
          .filter(
            (line) => line && !/^LINE \d+:/i.test(line) && !/^\^+$/.test(line),
          )
          .slice(0, 4)
          .join(' ')
          .slice(0, 500);
        throw new Error(`ICEBERG_SQL_EXECUTION_FAILED: ${safeReason}`);
      }
      throw new Error(`ICEBERG_SQL_RUNTIME_FAILED: ${stage}`);
    } finally {
      IcebergDatalakeService.activeSqlExecutions.delete(executionId);
      if (connection) {
        if (attached) {
          try {
            await connection.run(
              `DETACH ${IcebergDatalakeService.quoteSqlIdentifier(names.alias)}`,
            );
          } catch {
            // Continue best-effort cleanup.
          }
        }
        await [names.catalogSecret, names.storageSecret].reduce(
          async (previous, secret) => {
            await previous;
            try {
              await connection.run(
                `DROP SECRET IF EXISTS ${IcebergDatalakeService.quoteSqlIdentifier(secret)}`,
              );
            } catch {
              // Continue best-effort cleanup.
            }
          },
          Promise.resolve(),
        );
        connection.closeSync?.();
      }
      duckdbInstance?.closeSync?.();
    }
  }

  private static async classifySqlStatement(
    connection: any,
    sql: string,
  ): Promise<IcebergSqlStatementClass> {
    if (!sql.trim() || sql.length > 1_000_000) {
      throw new Error('ICEBERG_SQL_INVALID');
    }
    const extracted = await connection.extractStatements(sql);
    if (extracted.count !== 1) {
      throw new Error('ICEBERG_SQL_SINGLE_STATEMENT_REQUIRED');
    }
    const prepared = await extracted.prepare(0);
    try {
      const statementClass =
        IcebergDatalakeService.sqlStatementClasses[
          prepared.statementType as StatementType
        ];
      if (!statementClass) throw new Error('ICEBERG_SQL_STATEMENT_REJECTED');
      const rejectedSurface =
        /\b(attach|detach|install|load|pragma|copy|merge|alter|create\s+(?:or\s+replace\s+)?(?:temporary\s+|temp\s+)?secret|drop\s+secret|read_(?:csv|json|parquet)|iceberg_scan|httpfs)\b/i;
      if (rejectedSurface.test(sql)) {
        throw new Error('ICEBERG_SQL_STATEMENT_REJECTED');
      }
      return statementClass;
    } finally {
      prepared.destroySync();
    }
  }

  static async executeSql(
    params: IcebergSqlExecutionParams,
  ): Promise<IcebergSqlExecutionResult> {
    const capability = await IcebergDatalakeService.getSqlCapability(
      params.instanceId,
    );
    if (!capability.available) {
      throw new Error(capability.reason ?? 'ICEBERG_SQL_UNAVAILABLE');
    }
    const maxRows = Math.max(1, Math.min(params.maxRows ?? 1000, 5000));
    return IcebergDatalakeService.withAttachedSqlCatalog(
      params.instanceId,
      params.executionId,
      async (connection) => {
        const statementClass =
          await IcebergDatalakeService.classifySqlStatement(
            connection,
            params.sql,
          );
        const reader = await connection.runAndReadUntil(
          params.sql,
          maxRows + 1,
        );
        const rows = reader.getRowObjectsJson() as Array<
          Record<string, unknown>
        >;
        return {
          executionId: params.executionId,
          statementClass,
          columns: reader.columnNames(),
          rows: rows.slice(0, maxRows),
          rowsChanged: Number(reader.rowsChanged ?? 0),
          truncated: rows.length > maxRows || !reader.done,
        };
      },
    );
  }

  static async getSqlSchema(id: string): Promise<IcebergSqlSchemaInfo> {
    const capability = await IcebergDatalakeService.getSqlCapability(id);
    if (!capability.available) {
      throw new Error(capability.reason ?? 'ICEBERG_SQL_UNAVAILABLE');
    }

    const namespaceQueue = await IcebergDatalakeService.listNamespaces(id);
    const namespaces: IcebergSqlSchemaInfo['namespaces'] = [];

    for (let index = 0; index < namespaceQueue.length; index += 1) {
      const namespace = namespaceQueue[index];
      if (namespaceQueue.length > 1_000) {
        throw new Error('ICEBERG_SQL_SCHEMA_LIMIT_EXCEEDED');
      }
      // Catalog traversal is intentionally sequential to keep bridge work bounded.
      // eslint-disable-next-line no-await-in-loop
      const children = await IcebergDatalakeService.listNamespaces(
        id,
        namespace,
      );
      children.forEach((child) => {
        if (
          !namespaceQueue.some((item) => item.join('.') === child.join('.'))
        ) {
          namespaceQueue.push(child);
        }
      });
      // eslint-disable-next-line no-await-in-loop
      const tableNames = await IcebergDatalakeService.listTables(id, namespace);
      // eslint-disable-next-line no-await-in-loop
      const tables = await Promise.all(
        tableNames.map(async (table) => {
          const schema = await IcebergDatalakeService.getTableSchema(
            id,
            namespace,
            table,
          );
          return {
            name: table,
            type: 'TABLE',
            columns: schema.fields.map((field, fieldIndex) => ({
              name: field.name,
              type: field.type,
              position: fieldIndex + 1,
            })),
          };
        }),
      );
      namespaces.push({ name: namespace.join('.'), tables });
    }

    return { catalogName: 'iceberg', namespaces };
  }

  static cancelSql(executionId: string): boolean {
    const connection =
      IcebergDatalakeService.activeSqlExecutions.get(executionId);
    if (!connection) return false;
    connection.interrupt();
    return true;
  }

  // ─────────────────────────────────────────────
  //  Public: pyiceberg installation
  // ─────────────────────────────────────────────

  static async ensurePyicebergInstalled(): Promise<{
    installed: boolean;
    version?: string;
  }> {
    // Fast path 1: in-process session cache
    if (IcebergDatalakeService.installedCache?.installed) {
      return IcebergDatalakeService.installedCache;
    }

    try {
      // Settings record the last successful installation for diagnostics, but
      // do not prove the currently selected Python still has every required
      // extra. Verify once per app session before trusting it.
      const settings = await SettingsService.loadSettings();

      // Check via Python bridge (runs pip only if the runtime profile is incomplete)
      const checkResult = (await IcebergDatalakeService.runBridge({
        command: 'install_check',
      })) as Record<string, unknown>;

      if (checkResult.installed) {
        const version = checkResult.version as string | undefined;
        await SettingsService.saveSettings({
          ...settings,
          icebergInstalled: true,
          icebergVersion: version,
        });
        IcebergDatalakeService.installedCache = { installed: true, version };
        return IcebergDatalakeService.installedCache;
      }

      // Install pyiceberg with common extras
      const pythonPath = await IcebergDatalakeService.getPythonPath();
      await new Promise<void>((resolve, reject) => {
        const child = spawn(pythonPath, [
          '-m',
          'pip',
          'install',
          // Enabled SQL/Hive catalogs plus the current FileIO profile.
          // --prefer-binary avoids slow source compilation where wheels exist.
          'pyiceberg[s3fs,sql-sqlite,sql-postgres,pyarrow,hive]>=0.10.0',
          '--prefer-binary',
          '--quiet',
        ]);
        child.on('close', (code: number) => {
          if (code === 0) resolve();
          else reject(new Error(`pip install failed with exit code ${code}`));
        });
        child.on('error', (err: Error) => reject(err));
      });

      // Verify installation
      const verifyResult = (await IcebergDatalakeService.runBridge({
        command: 'install_check',
      })) as Record<string, unknown>;

      if (verifyResult.installed) {
        const version = verifyResult.version as string | undefined;
        const currentSettings = await SettingsService.loadSettings();
        await SettingsService.saveSettings({
          ...currentSettings,
          icebergInstalled: true,
          icebergVersion: version,
        });
        IcebergDatalakeService.installedCache = { installed: true, version };
        return IcebergDatalakeService.installedCache;
      }

      return { installed: false };
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error(
        '[IcebergDatalakeService] ensurePyicebergInstalled error:',
        error,
      );
      throw error;
    }
  }

  // ─────────────────────────────────────────────
  //  Public: table operations
  // ─────────────────────────────────────────────

  static async listNamespaces(
    id: string,
    parent?: string[],
  ): Promise<string[][]> {
    try {
      const instance = await IcebergDatalakeService.getInstance(id);
      const { props, env } =
        await IcebergDatalakeService.buildCatalogProperties(instance);
      const result = (await IcebergDatalakeService.runBridge(
        {
          command: 'list_namespaces',
          catalog_name:
            instance.catalogType === 'sqlite'
              ? 'local'
              : (instance.catalogName ?? id),
          catalog_properties: props,
          parent: parent ?? [],
        },
        env,
      )) as Record<string, unknown>;
      return (result.namespaces as string[][]) ?? [];
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('[IcebergDatalakeService] listNamespaces error:', error);
      throw error;
    }
  }

  static async listTables(id: string, namespace: string[]): Promise<string[]> {
    try {
      const instance = await IcebergDatalakeService.getInstance(id);
      const { props, env } =
        await IcebergDatalakeService.buildCatalogProperties(instance);
      const result = (await IcebergDatalakeService.runBridge(
        {
          command: 'list_tables',
          catalog_name:
            instance.catalogType === 'sqlite'
              ? 'local'
              : (instance.catalogName ?? id),
          catalog_properties: props,
          namespace,
        },
        env,
      )) as Record<string, unknown>;
      return (result.tables as string[]) ?? [];
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('[IcebergDatalakeService] listTables error:', error);
      throw error;
    }
  }

  static async getTableSchema(
    id: string,
    namespace: string[],
    table: string,
  ): Promise<IcebergSchemaResult> {
    try {
      const instance = await IcebergDatalakeService.getInstance(id);
      const { props, env } =
        await IcebergDatalakeService.buildCatalogProperties(instance);
      const result = (await IcebergDatalakeService.runBridge(
        {
          command: 'get_schema',
          catalog_name:
            instance.catalogType === 'sqlite'
              ? 'local'
              : (instance.catalogName ?? id),
          catalog_properties: props,
          namespace,
          table,
        },
        env,
      )) as Record<string, unknown>;
      return {
        fields: (result.fields as IcebergFieldSpec[]) ?? [],
        properties:
          (result.properties as Record<string, string> | undefined) ?? {},
      };
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('[IcebergDatalakeService] getTableSchema error:', error);
      throw error;
    }
  }

  static async getTableSnapshots(
    id: string,
    namespace: string[],
    table: string,
  ): Promise<IcebergSnapshotInfo[]> {
    try {
      const instance = await IcebergDatalakeService.getInstance(id);
      const { props, env } =
        await IcebergDatalakeService.buildCatalogProperties(instance);
      const result = (await IcebergDatalakeService.runBridge(
        {
          command: 'get_snapshots',
          catalog_name:
            instance.catalogType === 'sqlite'
              ? 'local'
              : (instance.catalogName ?? id),
          catalog_properties: props,
          namespace,
          table,
        },
        env,
      )) as Record<string, unknown>;
      return (result.snapshots as IcebergSnapshotInfo[]) ?? [];
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('[IcebergDatalakeService] getTableSnapshots error:', error);
      throw error;
    }
  }

  static async previewTable(
    id: string,
    namespace: string[],
    table: string,
    limit: number,
    rowFilter?: string,
  ): Promise<IcebergPreviewResult> {
    try {
      const safeLimit = Math.min(
        Math.max(1, Math.floor(Number.isFinite(limit) ? limit : 100)),
        1000,
      );
      const safeRowFilter = rowFilter?.trim();
      if (safeRowFilter && !/^[A-Za-z0-9_\s.'"<>=!()-]+$/.test(safeRowFilter)) {
        throw new Error(
          'Invalid row filter. Use column names, literals, comparison operators, AND/OR, and parentheses only.',
        );
      }
      const instance = await IcebergDatalakeService.getInstance(id);
      const { props, env } =
        await IcebergDatalakeService.buildCatalogProperties(instance);
      const result = (await IcebergDatalakeService.runBridge(
        {
          command: 'preview_table',
          catalog_name:
            instance.catalogType === 'sqlite'
              ? 'local'
              : (instance.catalogName ?? id),
          catalog_properties: props,
          namespace,
          table,
          limit: safeLimit,
          row_filter: safeRowFilter || undefined,
        },
        env,
      )) as Record<string, unknown>;
      return {
        columns: (result.columns as string[]) ?? [],
        rows: (result.rows as unknown[][]) ?? [],
        total: result.total as number | undefined,
      };
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('[IcebergDatalakeService] previewTable error:', error);
      throw error;
    }
  }

  // ─────────────────────────────────────────────
  //  Public: file helpers
  // ─────────────────────────────────────────────

  // ─────────────────────────────────────────────
  //  Public: local file import
  // ─────────────────────────────────────────────

  static async importTable(
    id: string,
    namespace: string[],
    table: string,
    filePath: string,
    fileFormat: string,
  ): Promise<IcebergImportTableResult> {
    try {
      const safeFormat = fileFormat?.toLowerCase() as
        | IcebergImportFileFormat
        | undefined;
      if (!safeFormat || !['csv', 'parquet', 'json'].includes(safeFormat)) {
        throw new Error('ICEBERG_IMPORT_FORMAT_UNSUPPORTED');
      }
      const safeTable = table?.trim();
      if (!safeTable || !/^[A-Za-z_][A-Za-z0-9_]*$/.test(safeTable)) {
        throw new Error('ICEBERG_IMPORT_TABLE_NAME_INVALID');
      }
      const safeNamespace = IcebergDatalakeService.validateNamespace(namespace);
      if (!filePath?.trim()) {
        throw new Error('ICEBERG_IMPORT_FILE_REQUIRED');
      }
      if (
        !fs.existsSync(filePath.trim()) ||
        !fs.statSync(filePath.trim()).isFile()
      ) {
        throw new Error('ICEBERG_IMPORT_FILE_NOT_FOUND');
      }

      const instance = await IcebergDatalakeService.getInstance(id);
      const { props, env } =
        await IcebergDatalakeService.buildCatalogProperties(instance);
      const result = (await IcebergDatalakeService.runBridge(
        {
          command: 'import_table',
          catalog_name:
            instance.catalogType === 'sqlite'
              ? 'local'
              : (instance.catalogName ?? id),
          catalog_properties: props,
          namespace: safeNamespace,
          table: safeTable,
          file_path: filePath.trim(),
          file_format: safeFormat,
        },
        env,
      )) as Record<string, unknown>;
      return {
        namespace: (result.namespace as string[]) ?? safeNamespace,
        table: (result.table as string) ?? safeTable,
        rowCount: Number(result.row_count ?? 0),
        columns: (result.columns as string[]) ?? [],
      };
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('[IcebergDatalakeService] importTable error:', error);
      throw error;
    }
  }

  // ─────────────────────────────────────────────
  //  Public: table maintenance
  // ─────────────────────────────────────────────

  static async dropTable(
    id: string,
    namespace: string[],
    table: string,
  ): Promise<IcebergTableOperationResult> {
    try {
      const safeTable = table?.trim();
      if (!safeTable || !/^[A-Za-z_][A-Za-z0-9_]*$/.test(safeTable)) {
        throw new Error('ICEBERG_TABLE_NAME_INVALID');
      }
      const safeNamespace = IcebergDatalakeService.validateNamespace(namespace);
      const instance = await IcebergDatalakeService.getInstance(id);
      const { props, env } =
        await IcebergDatalakeService.buildCatalogProperties(instance);
      const result = (await IcebergDatalakeService.runBridge(
        {
          command: 'drop_table',
          catalog_name:
            instance.catalogType === 'sqlite'
              ? 'local'
              : (instance.catalogName ?? id),
          catalog_properties: props,
          namespace: safeNamespace,
          table: safeTable,
        },
        env,
      )) as Record<string, unknown>;
      return {
        namespace: (result.namespace as string[]) ?? safeNamespace,
        table: (result.table as string) ?? safeTable,
      };
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('[IcebergDatalakeService] dropTable error:', error);
      throw error;
    }
  }

  static async renameTable(
    id: string,
    namespace: string[],
    table: string,
    newTable: string,
  ): Promise<IcebergTableOperationResult> {
    try {
      const safeTable = table?.trim();
      if (!safeTable || !/^[A-Za-z_][A-Za-z0-9_]*$/.test(safeTable)) {
        throw new Error('ICEBERG_TABLE_NAME_INVALID');
      }
      const safeNewTable = newTable?.trim();
      if (!safeNewTable || !/^[A-Za-z_][A-Za-z0-9_]*$/.test(safeNewTable)) {
        throw new Error('ICEBERG_TABLE_NAME_INVALID');
      }
      if (safeNewTable === safeTable) {
        throw new Error('ICEBERG_RENAME_SAME_NAME');
      }
      const safeNamespace = IcebergDatalakeService.validateNamespace(namespace);
      const instance = await IcebergDatalakeService.getInstance(id);
      const { props, env } =
        await IcebergDatalakeService.buildCatalogProperties(instance);
      const result = (await IcebergDatalakeService.runBridge(
        {
          command: 'rename_table',
          catalog_name:
            instance.catalogType === 'sqlite'
              ? 'local'
              : (instance.catalogName ?? id),
          catalog_properties: props,
          namespace: safeNamespace,
          table: safeTable,
          new_table: safeNewTable,
        },
        env,
      )) as Record<string, unknown>;
      return {
        namespace: (result.namespace as string[]) ?? safeNamespace,
        table: (result.table as string) ?? safeNewTable,
      };
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('[IcebergDatalakeService] renameTable error:', error);
      throw error;
    }
  }

  static async createNamespace(
    id: string,
    namespace: string[],
  ): Promise<IcebergNamespaceOperationResult> {
    try {
      const safeNamespace = IcebergDatalakeService.validateNamespace(namespace);
      const instance = await IcebergDatalakeService.getInstance(id);
      const { props, env } =
        await IcebergDatalakeService.buildCatalogProperties(instance);
      const result = (await IcebergDatalakeService.runBridge(
        {
          command: 'create_namespace',
          catalog_name:
            instance.catalogType === 'sqlite'
              ? 'local'
              : (instance.catalogName ?? id),
          catalog_properties: props,
          namespace: safeNamespace,
        },
        env,
      )) as Record<string, unknown>;
      return {
        namespace: (result.namespace as string[]) ?? safeNamespace,
      };
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('[IcebergDatalakeService] createNamespace error:', error);
      throw error;
    }
  }

  static async dropNamespace(
    id: string,
    namespace: string[],
  ): Promise<IcebergNamespaceOperationResult> {
    try {
      const safeNamespace = IcebergDatalakeService.validateNamespace(namespace);
      const instance = await IcebergDatalakeService.getInstance(id);
      const { props, env } =
        await IcebergDatalakeService.buildCatalogProperties(instance);
      const result = (await IcebergDatalakeService.runBridge(
        {
          command: 'drop_namespace',
          catalog_name:
            instance.catalogType === 'sqlite'
              ? 'local'
              : (instance.catalogName ?? id),
          catalog_properties: props,
          namespace: safeNamespace,
        },
        env,
      )) as Record<string, unknown>;
      return {
        namespace: (result.namespace as string[]) ?? safeNamespace,
      };
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('[IcebergDatalakeService] dropNamespace error:', error);
      throw error;
    }
  }

  private static validateNamespace(namespace: string[]): string[] {
    const safeNamespace = (namespace ?? []).map((part) => part.trim());
    if (
      safeNamespace.length === 0 ||
      safeNamespace.some((part) => !/^[A-Za-z_][A-Za-z0-9_]*$/.test(part))
    ) {
      throw new Error('ICEBERG_NAMESPACE_INVALID');
    }
    return safeNamespace;
  }

  static async createMetadataFile(
    warehousePath: string,
  ): Promise<IcebergLocalCatalogResult> {
    try {
      const result = (await IcebergDatalakeService.runBridge({
        command: 'create_metadata_file',
        warehouse_path: warehousePath,
      })) as Record<string, unknown>;
      return {
        catalogPath: (result.metadata_path as string) ?? '',
        warehousePath: (result.warehouse_path as string) ?? '',
        namespaces: (result.namespaces as string[][]) ?? [],
        tables: (result.tables as string[][]) ?? [],
      };
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error(
        '[IcebergDatalakeService] createMetadataFile error:',
        error,
      );
      throw error;
    }
  }
}
