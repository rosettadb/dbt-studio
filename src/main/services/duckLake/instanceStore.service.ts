/**
 * DuckLake Instance Store Service
 * Handles persistence of DuckLake instance metadata with secure credential storage
 */

import * as fs from 'fs';
import * as path from 'path';
import { app } from 'electron';
import SecureStorageService from '../secureStorage.service';
import {
  DuckLakeInstance,
  DuckLakeCatalogConfig,
  DuckLakeStorageConfig,
} from '../../../types/duckLake';
import { DuckLakeError } from '../../../types/duckLakeErrors';

interface DuckLakeCatalogConfigPersisted {
  type: 'duckdb' | 'sqlite' | 'postgresql';
  duckdb?: {
    metadataPath: string;
  };
  sqlite?: {
    metadataPath: string;
  };
  postgresql?: {
    host: string;
    port: number;
    database: string;
    username: string;
    ssl: boolean;
    // password stored separately in keytar
  };
}

interface DuckLakeStorageConfigPersisted {
  type: 'local' | 's3' | 'azure' | 'gcs';
  local?: {
    path: string;
  };
  s3?: {
    bucket: string;
    region: string;
    accessKeyId: string;
    endpoint?: string;
    prefix?: string;
    // secretAccessKey stored separately
  };
  azure?: {
    container: string;
    accountName: string;
    // accountKey/connectionString stored separately
    prefix?: string;
  };
  gcs?: {
    bucket: string;
    projectId: string;
    prefix?: string;
    // credentials stored separately
  };
}

interface DuckLakeInstanceMetadata {
  id: string;
  name: string;
  description?: string;
  dataPath: string;
  storage?: DuckLakeStorageConfigPersisted;
  catalog: DuckLakeCatalogConfigPersisted;
  createdAt: string; // ISO string for JSON serialization
  updatedAt: string;
  status: 'active' | 'inactive' | 'error' | 'connecting';
  tags?: string[];
  runtimeOptions?: {
    maxMemory?: string;
    threads?: number;
    enableOptimizer?: boolean;
    tempDirectory?: string;
  };
}

interface DuckLakeInstancesFile {
  version: string;
  instances: DuckLakeInstanceMetadata[];
  lastModified: string;
}

export default class DuckLakeInstanceStore {
  private static readonly STORE_VERSION = '1.0.0';

  private static readonly DUCKLAKE_DIR = path.join(
    app.getPath('userData'),
    'datalake',
  );

  private static readonly INSTANCES_FILE = path.join(
    DuckLakeInstanceStore.DUCKLAKE_DIR,
    'instances.json',
  );

  /**
   * Initialize the DuckLake storage directory and file
   */
  static async initialize(): Promise<void> {
    try {
      // Ensure ducklake directory exists
      if (!fs.existsSync(this.DUCKLAKE_DIR)) {
        fs.mkdirSync(this.DUCKLAKE_DIR, { recursive: true });
      }

      // Initialize instances file if it doesn't exist
      if (!fs.existsSync(this.INSTANCES_FILE)) {
        const initialData: DuckLakeInstancesFile = {
          version: this.STORE_VERSION,
          instances: [],
          lastModified: new Date().toISOString(),
        };
        await this.writeInstancesFile(initialData);
      }
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('Failed to initialize DuckLake instance store:', error);
      throw error;
    }
  }

  /**
   * Load all instances from storage
   */
  static async loadInstances(): Promise<DuckLakeInstance[]> {
    try {
      await this.initialize();

      const data = await this.readInstancesFile();
      return data.instances.map(this.metadataToInstance);
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('Failed to load DuckLake instances:', error);
      return [];
    }
  }

  /**
   * Save an instance to storage
   */
  static async saveInstance(instance: DuckLakeInstance): Promise<void> {
    try {
      await this.initialize();

      const data = await this.readInstancesFile();
      const metadata = await this.instanceToMetadata(instance);

      // Find existing instance or add new one
      const existingIndex = data.instances.findIndex(
        (i) => i.id === instance.id,
      );
      if (existingIndex >= 0) {
        data.instances[existingIndex] = metadata;
      } else {
        data.instances.push(metadata);
      }

      data.lastModified = new Date().toISOString();
      await this.writeInstancesFile(data);
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('Failed to save DuckLake instance:', error);
      throw error;
    }
  }

  /**
   * Delete an instance from storage
   */
  static async deleteInstance(instanceId: string): Promise<void> {
    try {
      await this.initialize();

      const data = await this.readInstancesFile();
      const instanceIndex = data.instances.findIndex(
        (i) => i.id === instanceId,
      );

      if (instanceIndex === -1) {
        throw DuckLakeError.instanceNotFound(instanceId);
      }

      const instance = data.instances[instanceIndex];

      // Clean up credentials before removing instance
      await this.cleanupInstanceCredentials(
        instanceId,
        instance.catalog,
        instance.storage,
      );

      // Remove instance from array
      data.instances.splice(instanceIndex, 1);
      data.lastModified = new Date().toISOString();

      await this.writeInstancesFile(data);
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('Failed to delete DuckLake instance:', error);
      throw error;
    }
  }

  /**
   * Get a specific instance by ID
   */
  static async getInstance(instanceId: string): Promise<DuckLakeInstance> {
    try {
      const instances = await this.loadInstances();
      const instance = instances.find((i) => i.id === instanceId);

      if (!instance) {
        throw DuckLakeError.instanceNotFound(instanceId);
      }

      return instance;
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('Failed to get DuckLake instance:', error);
      throw error;
    }
  }

  /**
   * Store credentials securely (catalog and storage)
   */
  static async storeCredentials(
    instanceId: string,
    catalog: DuckLakeCatalogConfig,
    storage?: DuckLakeStorageConfig,
  ): Promise<void> {
    try {
      // Store Catalog Credentials
      if (catalog.type === 'postgresql' && catalog.postgresql?.password) {
        const credentialKey = `ducklake-${instanceId}-postgresql-password`;
        await SecureStorageService.setCredential(
          credentialKey,
          catalog.postgresql.password,
        );
      }

      // Store Storage Credentials
      if (storage) {
        if (storage.type === 's3' && storage.s3?.secretAccessKey) {
          const key = `ducklake-${instanceId}-s3-secret`;
          await SecureStorageService.setCredential(
            key,
            storage.s3.secretAccessKey,
          );
          if (storage.s3.sessionToken) {
            const sessionKey = `ducklake-${instanceId}-s3-session-token`;
            await SecureStorageService.setCredential(
              sessionKey,
              storage.s3.sessionToken,
            );
          }
        } else if (storage.type === 'azure') {
          if (storage.azure?.accountKey) {
            const key = `ducklake-${instanceId}-azure-key`;
            await SecureStorageService.setCredential(
              key,
              storage.azure.accountKey,
            );
          }
          if (storage.azure?.connectionString) {
            const key = `ducklake-${instanceId}-azure-conn-string`;
            await SecureStorageService.setCredential(
              key,
              storage.azure.connectionString,
            );
          }
        } else if (storage.type === 'gcs' && storage.gcs?.credentials) {
          const key = `ducklake-${instanceId}-gcs-credentials`;
          await SecureStorageService.setCredential(
            key,
            storage.gcs.credentials,
          );
        }
      }
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('Failed to store credentials:', error);
      throw error;
    }
  }

  /**
   * Retrieve credentials securely (catalog and storage)
   */
  static async retrieveCredentials(
    instanceId: string,
    catalog: DuckLakeCatalogConfigPersisted,
    storage?: DuckLakeStorageConfigPersisted,
  ): Promise<{
    catalog: DuckLakeCatalogConfig;
    storage?: DuckLakeStorageConfig;
  }> {
    try {
      // Retrieve Catalog Credentials
      const fullCatalog: DuckLakeCatalogConfig = { ...catalog };

      if (catalog.type === 'postgresql' && catalog.postgresql) {
        const credentialKey = `ducklake-${instanceId}-postgresql-password`;
        const password =
          await SecureStorageService.getCredential(credentialKey);
        fullCatalog.postgresql = {
          ...catalog.postgresql,
          password: password || undefined,
        };
      }

      // Retrieve Storage Credentials
      let fullStorage: DuckLakeStorageConfig | undefined;
      if (storage) {
        fullStorage = { ...storage } as DuckLakeStorageConfig;

        if (storage.type === 's3' && storage.s3) {
          const key = `ducklake-${instanceId}-s3-secret`;
          const sessionKey = `ducklake-${instanceId}-s3-session-token`;
          const [secret, sessionToken] = await Promise.all([
            SecureStorageService.getCredential(key),
            SecureStorageService.getCredential(sessionKey),
          ]);
          if (secret) {
            fullStorage.s3 = {
              ...storage.s3,
              secretAccessKey: secret,
              ...(sessionToken && { sessionToken }),
            };
          }
        } else if (storage.type === 'azure' && storage.azure) {
          const keyKey = `ducklake-${instanceId}-azure-key`;
          const connKey = `ducklake-${instanceId}-azure-conn-string`;
          const [accountKey, connectionString] = await Promise.all([
            SecureStorageService.getCredential(keyKey),
            SecureStorageService.getCredential(connKey),
          ]);

          fullStorage.azure = { ...storage.azure } as any;
          if (accountKey && fullStorage.azure)
            fullStorage.azure.accountKey = accountKey;
          if (connectionString && fullStorage.azure)
            fullStorage.azure.connectionString = connectionString;
        } else if (storage.type === 'gcs' && storage.gcs) {
          const key = `ducklake-${instanceId}-gcs-credentials`;
          const credentials = await SecureStorageService.getCredential(key);
          if (credentials) {
            fullStorage.gcs = { ...storage.gcs, credentials };
          }
        }
      }

      return { catalog: fullCatalog, storage: fullStorage };
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('Failed to retrieve credentials:', error);
      return {
        catalog: catalog as DuckLakeCatalogConfig,
        storage: storage as DuckLakeStorageConfig,
      };
    }
  }

  /**
   * Clean up credentials for an instance
   */
  private static async cleanupInstanceCredentials(
    instanceId: string,
    catalog: DuckLakeCatalogConfigPersisted,
    storage?: DuckLakeStorageConfigPersisted,
  ): Promise<void> {
    try {
      const credentialKeys: string[] = [];

      // Catalog Credentials
      if (catalog.type === 'postgresql') {
        credentialKeys.push(`ducklake-${instanceId}-postgresql-password`);
      }

      // Storage Credentials
      if (storage) {
        if (storage.type === 's3') {
          credentialKeys.push(`ducklake-${instanceId}-s3-secret`);
          credentialKeys.push(`ducklake-${instanceId}-s3-session-token`);
        } else if (storage.type === 'azure') {
          credentialKeys.push(`ducklake-${instanceId}-azure-key`);
          credentialKeys.push(`ducklake-${instanceId}-azure-conn-string`);
        } else if (storage.type === 'gcs') {
          credentialKeys.push(`ducklake-${instanceId}-gcs-credentials`);
        }
      }

      await Promise.all(
        credentialKeys.map(async (key) => {
          try {
            await SecureStorageService.deleteCredential(key);
          } catch (error) {
            // Ignore errors for non-existent credentials
          }
        }),
      );
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('Failed to cleanup instance credentials:', error);
    }
  }

  /**
   * Convert instance to metadata for storage (removes passwords)
   */
  private static async instanceToMetadata(
    instance: DuckLakeInstance,
  ): Promise<DuckLakeInstanceMetadata> {
    // Store credentials securely
    await this.storeCredentials(
      instance.id,
      instance.catalog,
      instance.storage,
    );

    // Create metadata without passwords
    const catalogPersisted: DuckLakeCatalogConfigPersisted = {
      ...instance.catalog,
    };
    if (catalogPersisted.postgresql) {
      delete (catalogPersisted.postgresql as any).password;
    }

    // Persist storage config without secrets
    let storagePersisted: DuckLakeStorageConfigPersisted | undefined;
    if (instance.storage) {
      storagePersisted = { ...instance.storage } as any;
      if (storagePersisted?.s3) {
        delete (storagePersisted.s3 as any).secretAccessKey;
      }
      if (storagePersisted?.azure) {
        delete (storagePersisted.azure as any).accountKey;
        delete (storagePersisted.azure as any).connectionString;
      }
      if (storagePersisted?.gcs) {
        delete (storagePersisted.gcs as any).credentials;
      }
    }

    return {
      id: instance.id,
      name: instance.name,
      description: instance.description,
      dataPath: instance.dataPath,
      storage: storagePersisted,
      catalog: catalogPersisted,
      createdAt: (instance.createdAt instanceof Date
        ? instance.createdAt
        : new Date(instance.createdAt)
      ).toISOString(),
      updatedAt: (instance.updatedAt instanceof Date
        ? instance.updatedAt
        : new Date(instance.updatedAt)
      ).toISOString(),
      status: instance.status,
      tags: instance.tags,
      runtimeOptions: instance.runtimeOptions,
    };
  }

  /**
   * Convert metadata to instance (retrieves passwords)
   */
  private static metadataToInstance(
    metadata: DuckLakeInstanceMetadata,
  ): DuckLakeInstance {
    // We return the instance without credentials initially.
    // Credentials should be retrieved on demand using retrieveCredentials
    // However, to maintain compatibility with existing code that might expect credentials
    // in the object (though it shouldn't rely on it for sensitive ops without retrieval),
    // we return the structure.
    // Actually, the previous implementation didn't retrieve credentials here either.
    // See: catalog: metadata.catalog, // Credentials will be loaded on-demand

    return {
      id: metadata.id,
      name: metadata.name,
      description: metadata.description,
      dataPath: metadata.dataPath,
      storage: metadata.storage as DuckLakeStorageConfig,
      catalog: metadata.catalog as DuckLakeCatalogConfig,
      createdAt: new Date(metadata.createdAt),
      updatedAt: new Date(metadata.updatedAt),
      status: metadata.status,
      tags: metadata.tags,
      runtimeOptions: metadata.runtimeOptions,
    };
  }

  /**
   * Read instances file from disk
   */
  private static async readInstancesFile(): Promise<DuckLakeInstancesFile> {
    try {
      const fileContent = fs.readFileSync(this.INSTANCES_FILE, 'utf-8');
      return JSON.parse(fileContent);
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('Failed to read instances file:', error);
      // Return empty structure if file is corrupted
      return {
        version: this.STORE_VERSION,
        instances: [],
        lastModified: new Date().toISOString(),
      };
    }
  }

  /**
   * Write instances file to disk
   */
  private static async writeInstancesFile(
    data: DuckLakeInstancesFile,
  ): Promise<void> {
    try {
      const fileContent = JSON.stringify(data, null, 2);
      fs.writeFileSync(this.INSTANCES_FILE, fileContent, 'utf-8');
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('Failed to write instances file:', error);
      throw error;
    }
  }

  /**
   * Get storage statistics
   */
  static async getStorageStats(): Promise<{
    instanceCount: number;
    storageSize: number;
    lastModified: Date;
  }> {
    try {
      await this.initialize();

      const data = await this.readInstancesFile();
      const stats = fs.statSync(this.INSTANCES_FILE);

      return {
        instanceCount: data.instances.length,
        storageSize: stats.size,
        lastModified: new Date(data.lastModified),
      };
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('Failed to get storage stats:', error);
      return {
        instanceCount: 0,
        storageSize: 0,
        lastModified: new Date(),
      };
    }
  }
}
