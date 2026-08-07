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
  IcebergSnapshotInfo,
  IcebergPreviewResult,
} from '../../types/iceberg';
import type { CloudConnection } from '../../types/frontend';

export class IcebergDatalakeService {
  // ─────────────────────────────────────────────
  //  Private: persistence helpers
  // ─────────────────────────────────────────────

  private static async readInstances(): Promise<IcebergInstanceConfig[]> {
    try {
      const db = await loadDatabaseFile();
      return db.icebergInstances ?? [];
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
      case 'file':
        props.type = 'rest';
        if (instance.catalogPath) props.uri = instance.catalogPath;
        break;

      case 'polaris':
      case 'hive':
      case 'sql':
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
              props.token = '__ENV:ICEBERG_ACCESS_TOKEN__';
              // eslint-disable-next-line dot-notation
              env['ICEBERG_ACCESS_TOKEN__'] = token;
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

      case 'glue':
        props.type = 'glue';
        if (instance.catalogName) props['glue.database'] = instance.catalogName;
        break;

      case 'dynamodb':
        props.type = 'dynamodb';
        if (instance.catalogName)
          props['dynamodb.table-name'] = instance.catalogName;
        break;

      case 'bigquery':
        props.type = 'bigquery';
        if (instance.catalogName) props.gcp_project = instance.catalogName;
        break;

      case 'in-memory':
        props.type = 'in-memory';
        break;

      default:
        break;
    }

    // Storage credentials via Cloud Explorer connection
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
        }
      } catch (connError) {
        // eslint-disable-next-line no-console
        console.error(
          '[IcebergDatalakeService] cloud connection lookup error:',
          connError,
        );
      }
    }

    if (instance.storageBucket) props['s3.bucket'] = instance.storageBucket;
    if (instance.storagePrefix) props['s3.prefix'] = instance.storagePrefix;

    return { props, env };
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
          createdAt,
          updatedAt,
        }) => ({
          id,
          name,
          description,
          catalogType,
          storageType,
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

      if (params.endpoint) props.uri = params.endpoint;
      if (params.catalogName) props.warehouse = params.catalogName;
      if (params.catalogPath) props.uri = params.catalogPath;

      switch (params.catalogType) {
        case 'file':
          props.type = 'rest';
          break;
        case 'polaris':
        case 'hive':
        case 'sql':
          props.type = 'rest';
          if (params.accessToken) {
            props.token = '__ENV:ICEBERG_ACCESS_TOKEN__';
            // eslint-disable-next-line dot-notation
            env['ICEBERG_ACCESS_TOKEN__'] = params.accessToken;
          }
          break;
        case 'glue':
          props.type = 'glue';
          break;
        case 'dynamodb':
          props.type = 'dynamodb';
          break;
        case 'bigquery':
          props.type = 'bigquery';
          break;
        case 'in-memory':
          props.type = 'in-memory';
          break;
        default:
          props.type = 'rest';
      }

      await IcebergDatalakeService.runBridge(
        {
          command: 'test_connection',
          catalog_name: params.catalogName ?? 'test',
          catalog_properties: props,
        },
        env,
      );
      return { success: true };
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error(
        '[IcebergDatalakeService] testCatalogConnection error:',
        error,
      );
      return { success: false, error: String(error) };
    }
  }

  // ─────────────────────────────────────────────
  //  Public: pyiceberg installation
  // ─────────────────────────────────────────────

  static async ensurePyicebergInstalled(): Promise<{
    installed: boolean;
    version?: string;
  }> {
    try {
      const settings = await SettingsService.loadSettings();
      if (settings.icebergInstalled) {
        return { installed: true, version: settings.icebergVersion };
      }

      // Check if already installed
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
        return { installed: true, version };
      }

      // Install pyiceberg with common extras
      const pythonPath = await IcebergDatalakeService.getPythonPath();
      await new Promise<void>((resolve, reject) => {
        const child = spawn(pythonPath, [
          '-m',
          'pip',
          'install',
          'pyiceberg[s3fs,glue,hive,sql-sqlite,sql-postgres,pyarrow]',
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
        return { installed: true, version };
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
          catalog_name: instance.catalogName ?? id,
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
          catalog_name: instance.catalogName ?? id,
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
  ): Promise<IcebergFieldSpec[]> {
    try {
      const instance = await IcebergDatalakeService.getInstance(id);
      const { props, env } =
        await IcebergDatalakeService.buildCatalogProperties(instance);
      const result = (await IcebergDatalakeService.runBridge(
        {
          command: 'get_schema',
          catalog_name: instance.catalogName ?? id,
          catalog_properties: props,
          namespace,
          table,
        },
        env,
      )) as Record<string, unknown>;
      return (result.fields as IcebergFieldSpec[]) ?? [];
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
          catalog_name: instance.catalogName ?? id,
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
      const instance = await IcebergDatalakeService.getInstance(id);
      const { props, env } =
        await IcebergDatalakeService.buildCatalogProperties(instance);
      const result = (await IcebergDatalakeService.runBridge(
        {
          command: 'preview_table',
          catalog_name: instance.catalogName ?? id,
          catalog_properties: props,
          namespace,
          table,
          limit: Math.min(Math.max(1, limit), 10000), // clamp per BE-02
          row_filter: rowFilter,
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

  static async createMetadataFile(warehousePath: string): Promise<string> {
    try {
      const result = (await IcebergDatalakeService.runBridge({
        command: 'create_metadata_file',
        warehouse_path: warehousePath,
      })) as Record<string, unknown>;
      return (result.metadata_path as string) ?? '';
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
