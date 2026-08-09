/**
 * IcebergDatalakeService
 * Main backend service for Iceberg Data Lake instance management.
 * Handles CRUD, secure credential storage, Python bridge invocation,
 * and pyiceberg installation.
 *
 * Follows BE-03 (one cohesive service), BE-04 (no await inside Promise constructor).
 */

import { v4 as uuidv4 } from 'uuid';
import * as path from 'path';
import { pathToFileURL } from 'url';
import { spawn } from 'child_process';
import { app } from 'electron';

import { loadDatabaseFile, updateDatabase } from '../utils/fileHelper';
import secureStorage from './secureStorage.service';
import SettingsService from './settings.service';

import type {
  IcebergInstanceConfig,
  IcebergInstanceListItem,
  CreateIcebergInstanceDTO,
  UpdateIcebergInstanceDTO,
  IcebergTestCatalogParams,
  IcebergTestResult,
  IcebergFieldSpec,
  IcebergSchemaResult,
  IcebergSnapshotInfo,
  IcebergPreviewResult,
  IcebergLocalCatalogResult,
  IcebergCapabilities,
  IcebergCatalogCapability,
} from '../../types/iceberg';
import type { CloudConnection } from '../../types/frontend';
import type { PostgresConnection } from '../../types/backend';

export class IcebergDatalakeService {
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
      authModes: ['none', 'token'],
      allowedStorageTypes: ['server-managed'],
    },
    {
      type: 'polaris',
      label: 'Apache Polaris',
      pyicebergType: 'rest',
      enabled: true,
      requiredFields: ['endpoint', 'catalogName'],
      authModes: ['none', 'token'],
      allowedStorageTypes: ['server-managed'],
    },
    ...(
      [
        ['hive', 'Hive Metastore', 'hive'],
        ['hadoop', 'Hadoop Catalog', 'custom'],
        ['glue', 'AWS Glue', 'glue'],
        ['nessie', 'Project Nessie', 'rest'],
      ] as const
    ).map(([type, label, pyicebergType]) => ({
      type,
      label,
      pyicebergType,
      enabled: false,
      disabledReason: 'Planned for the next catalog adapter slice.',
      requiredFields: [],
      authModes: ['none'] as IcebergCatalogCapability['authModes'],
      allowedStorageTypes: [],
    })),
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

  /**
   * Spawns the Python bridge, writes command JSON to stdin, reads result from stdout.
   * BE-04: all async values resolved BEFORE entering new Promise constructor.
   */
  private static async runBridge(
    command: object,
    env: Record<string, string> = {},
  ): Promise<unknown> {
    const pythonPath = await IcebergDatalakeService.getPythonPath();
    const bridgePath = IcebergDatalakeService.getBridgePath();

    return new Promise((resolve, reject) => {
      const child = spawn(pythonPath, [bridgePath], {
        env: { ...process.env, ...env },
      });
      let stdout = '';
      let stderr = '';
      child.stdout.on('data', (d: Buffer) => {
        stdout += d.toString();
      });
      child.stderr.on('data', (d: Buffer) => {
        stderr += d.toString();
      });
      child.stdin.write(JSON.stringify(command));
      child.stdin.end();
      child.on('close', (code: number) => {
        try {
          const result = JSON.parse(stdout) as Record<string, unknown>;
          if (!result.ok) {
            reject(new Error((result.error as string) ?? 'Bridge error'));
          } else {
            resolve(result);
          }
        } catch {
          reject(new Error(`Bridge parse error (exit ${code}): ${stderr}`));
        }
      });
      child.on('error', (err: Error) => reject(err));
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
          props.warehouse = `file://${instance.localPath}`;
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
        props.type = 'rest';
        if (instance.endpoint) props.uri = instance.endpoint;
        if (instance.catalogName) props.warehouse = instance.catalogName;
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

  private static async buildWarehouseProperties(
    instance: IcebergInstanceConfig,
  ): Promise<{ props: Record<string, string>; env: Record<string, string> }> {
    const props: Record<string, string> = {};
    const env: Record<string, string> = {};

    if (instance.storageType === 'server-managed') return { props, env };
    if (instance.storageType === 'local' && instance.localPath) {
      props.warehouse = `file://${instance.localPath}`;
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
          createdAt,
          updatedAt,
        }) => ({
          id,
          name,
          description,
          catalogType,
          storageType,
          catalogPath,
          localPath,
          storageBucket,
          createdAt,
          updatedAt,
        }),
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
      const id = uuidv4();
      const now = new Date().toISOString();

      let catalogAccessTokenKey: string | undefined;
      if (data.accessToken) {
        catalogAccessTokenKey = `iceberg-catalog-token-${id}`;
        await secureStorage.setCredential(
          catalogAccessTokenKey,
          data.accessToken,
        );
      }

      // Strip the raw accessToken before persisting
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { accessToken: _accessTokenCreate, ...rest } = data;

      const newInstance: IcebergInstanceConfig = {
        ...rest,
        id,
        catalogAccessTokenKey:
          catalogAccessTokenKey ?? data.catalogAccessTokenKey,
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

      IcebergDatalakeService.validateCatalogWarehousePair({
        ...instances[idx],
        ...data,
      });

      // Handle access token update
      if (data.accessToken) {
        const key =
          instances[idx].catalogAccessTokenKey ?? `iceberg-catalog-token-${id}`;
        await secureStorage.setCredential(key, data.accessToken);
        instances[idx].catalogAccessTokenKey = key;
      }

      // Strip the raw accessToken before persisting
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { accessToken: _accessTokenUpdate, ...rest } = data;

      instances[idx] = {
        ...instances[idx],
        ...rest,
        id,
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

      if (params.endpoint) props.uri = params.endpoint;
      if (params.catalogName) props.warehouse = params.catalogName;
      if (params.catalogPath) props.uri = params.catalogPath;

      switch (params.catalogType) {
        case 'sqlite':
          props.type = 'sql';
          if (params.catalogPath) {
            props.uri = `sqlite:///${params.catalogPath}`;
            props.warehouse = `file://${path.join(
              path.dirname(params.catalogPath),
              'warehouse',
            )}`;
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
          props.type = 'rest';
          if (params.accessToken) {
            props.token = '__ENV:ICEBERG_ACCESS_TOKEN';
            // eslint-disable-next-line dot-notation
            env['ICEBERG_ACCESS_TOKEN'] = params.accessToken;
          }
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
          // SQLite and PostgreSQL SQL catalogs plus the current FileIO profile.
          // --prefer-binary avoids slow source compilation where wheels exist.
          'pyiceberg[s3fs,sql-sqlite,sql-postgres,pyarrow]',
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
