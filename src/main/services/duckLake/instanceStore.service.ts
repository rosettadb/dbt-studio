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

interface DuckLakeInstanceMetadata {
  id: string;
  name: string;
  description?: string;
  dataPath: string;
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

export class DuckLakeInstanceStore {
  private static readonly STORE_VERSION = '1.0.0';

  private static readonly DUCKLAKE_DIR = path.join(
    app.getPath('userData'),
    'ducklake',
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
      await this.cleanupInstanceCredentials(instanceId, instance.catalog);

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
   * Store catalog credentials securely
   */
  static async storeCatalogCredentials(
    instanceId: string,
    catalog: DuckLakeCatalogConfig,
  ): Promise<void> {
    try {
      if (catalog.type === 'postgresql' && catalog.postgresql?.password) {
        const credentialKey = `ducklake-${instanceId}-postgresql-password`;
        await SecureStorageService.setCredential(
          credentialKey,
          catalog.postgresql.password,
        );
      }
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('Failed to store catalog credentials:', error);
      throw error;
    }
  }

  /**
   * Retrieve catalog credentials securely
   */
  static async retrieveCatalogCredentials(
    instanceId: string,
    catalog: DuckLakeCatalogConfigPersisted,
  ): Promise<DuckLakeCatalogConfig> {
    try {
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

      return fullCatalog;
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('Failed to retrieve catalog credentials:', error);
      return catalog;
    }
  }

  /**
   * Clean up credentials for an instance
   */
  private static async cleanupInstanceCredentials(
    instanceId: string,
    catalog: DuckLakeCatalogConfigPersisted,
  ): Promise<void> {
    try {
      const credentialKeys: string[] = [];

      // Only clean up credentials for the specific catalog type
      if (catalog.type === 'postgresql') {
        credentialKeys.push(`ducklake-${instanceId}-postgresql-password`);
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
    await this.storeCatalogCredentials(instance.id, instance.catalog);

    // Create metadata without passwords
    const catalogPersisted: DuckLakeCatalogConfigPersisted = {
      ...instance.catalog,
    };
    if (catalogPersisted.postgresql) {
      delete (catalogPersisted.postgresql as any).password;
    }

    return {
      id: instance.id,
      name: instance.name,
      description: instance.description,
      dataPath: instance.dataPath,
      catalog: catalogPersisted,
      createdAt: instance.createdAt.toISOString(),
      updatedAt: instance.updatedAt.toISOString(),
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
    return {
      id: metadata.id,
      name: metadata.name,
      description: metadata.description,
      dataPath: metadata.dataPath,
      catalog: metadata.catalog, // Credentials will be loaded on-demand
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
