/**
 * DuckLake Extension Manager
 * Handles DuckLake extension discovery, loading, and verification
 */

import * as fs from 'fs';
import * as path from 'path';
import { app } from 'electron';
import { DuckDBInstance } from '@duckdb/node-api';

export interface ExtensionInfo {
  path: string;
  version?: string;
  source: 'bundled' | 'system' | 'user';
  verified: boolean;
}

export class DuckLakeExtensionManager {
  private static extensionInfo: ExtensionInfo | null = null;

  private static initialized = false;

  /**
   * Initialize the extension manager and discover available extensions
   */
  static async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }

    try {
      await this.discoverExtension();
      this.initialized = true;
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('Failed to initialize DuckLake extension manager:', error);
      throw error;
    }
  }

  /**
   * Get information about the available DuckLake extension
   */
  static getExtensionInfo(): ExtensionInfo | null {
    return this.extensionInfo;
  }

  /**
   * Check if DuckLake extension is available
   */
  static isExtensionAvailable(): boolean {
    return this.extensionInfo !== null && this.extensionInfo.verified;
  }

  /**
   * Verify that the DuckLake extension can be loaded
   */
  static async verifyExtension(): Promise<boolean> {
    if (!this.extensionInfo) {
      return false;
    }

    try {
      // Create a temporary DuckDB instance to test extension loading
      const testInstance = await DuckDBInstance.create(':memory:');
      const testConnection = await testInstance.connect();

      try {
        // Try to install and load the DuckLake extension
        await testConnection.run('INSTALL ducklake');
        await testConnection.run('LOAD ducklake');

        // Test basic DuckLake functionality
        await testConnection.run('SELECT ducklake_version()');

        this.extensionInfo.verified = true;
        return true;
      } finally {
        // DuckDB Node.js API handles cleanup automatically
        // No explicit cleanup needed
      }
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('DuckLake extension verification failed:', error);
      if (this.extensionInfo) {
        this.extensionInfo.verified = false;
      }
      return false;
    }
  }

  /**
   * Get the recommended extension installation command
   */
  static getInstallationInstructions(): string[] {
    const instructions = [
      'To install the DuckLake extension, run the following in DuckDB:',
      '',
      'INSTALL ducklake;',
      'LOAD ducklake;',
      '',
      'Or install via command line:',
      'duckdb -c "INSTALL ducklake;"',
    ];

    return instructions;
  }

  /**
   * Get extension version if available
   */
  static async getExtensionVersion(): Promise<string | null> {
    if (!this.isExtensionAvailable()) {
      return null;
    }

    try {
      const testInstance = await DuckDBInstance.create(':memory:');
      const testConnection = await testInstance.connect();

      try {
        await testConnection.run('INSTALL ducklake');
        await testConnection.run('LOAD ducklake');

        const result = await testConnection.run(
          'SELECT ducklake_version() as version',
        );
        const rows = await result.getRows();

        if (rows.length > 0) {
          // rows[0] is an array, get the first column value
          return (rows[0] as any)[0] || null;
        }

        return null;
      } finally {
        // DuckDB Node.js API handles cleanup automatically
        // No explicit cleanup needed
      }
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('Failed to get DuckLake extension version:', error);
      return null;
    }
  }

  /**
   * Check if required extensions are available for a catalog type
   */
  static async checkCatalogExtensions(catalogType: string): Promise<{
    available: boolean;
    missing: string[];
    errors: string[];
  }> {
    const requiredExtensions = this.getRequiredExtensions(catalogType);
    const missing: string[] = [];
    const errors: string[] = [];

    try {
      const testInstance = await DuckDBInstance.create(':memory:');
      const testConnection = await testInstance.connect();

      try {
        const results = await Promise.allSettled(
          requiredExtensions.map(async (extension) => {
            await testConnection.run(`INSTALL ${extension}`);
            await testConnection.run(`LOAD ${extension}`);
            return extension;
          }),
        );

        results.forEach((result, index) => {
          if (result.status === 'rejected') {
            const extension = requiredExtensions[index];
            missing.push(extension);
            errors.push(
              `Failed to load ${extension}: ${result.reason?.message || 'Unknown error'}`,
            );
          }
        });
      } finally {
        // DuckDB Node.js API handles cleanup automatically
        // No explicit cleanup needed
      }
    } catch (error) {
      errors.push(`Failed to test extensions: ${(error as Error).message}`);
    }

    return {
      available: missing.length === 0,
      missing,
      errors,
    };
  }

  /**
   * Get required extensions for a catalog type
   */
  private static getRequiredExtensions(catalogType: string): string[] {
    switch (catalogType) {
      case 'duckdb':
        return ['ducklake'];
      case 'sqlite':
        return ['ducklake', 'sqlite'];
      case 'postgresql':
        return ['ducklake', 'postgres'];
      default:
        return ['ducklake'];
    }
  }

  /**
   * Discover available DuckLake extension
   */
  private static async discoverExtension(): Promise<void> {
    // Try different sources in order of preference
    const sources: Array<{
      source: ExtensionInfo['source'];
      path: string | null;
    }> = [
      { source: 'bundled', path: this.getBundledExtensionPath() },
      { source: 'system', path: this.getSystemExtensionPath() },
      { source: 'user', path: this.getUserExtensionPath() },
    ];

    // Try each source sequentially using reduce
    const found = await sources.reduce(
      async (previousPromise, { source, path: extensionPath }) => {
        const alreadyFound = await previousPromise;
        if (alreadyFound) {
          return true;
        }

        if (extensionPath && fs.existsSync(extensionPath)) {
          this.extensionInfo = {
            path: extensionPath,
            source,
            verified: false,
          };

          // Try to verify this extension
          const verified = await this.verifyExtension();
          if (verified) {
            // eslint-disable-next-line no-console
            console.log(
              `Found and verified DuckLake extension from ${source}: ${extensionPath}`,
            );
            return true;
          }
        }

        return false;
      },
      Promise.resolve(false),
    );

    if (found) {
      return;
    }

    // If no extension found, try to use DuckDB's built-in extension system
    try {
      const testInstance = await DuckDBInstance.create(':memory:');
      const testConnection = await testInstance.connect();

      try {
        await testConnection.run('INSTALL ducklake');
        await testConnection.run('LOAD ducklake');

        this.extensionInfo = {
          path: 'built-in',
          source: 'system',
          verified: true,
        };

        // eslint-disable-next-line no-console
        console.log('Using DuckDB built-in extension system for DuckLake');
        return;
      } finally {
        // DuckDB Node.js API handles cleanup automatically
        // No explicit cleanup needed
      }
    } catch (error) {
      // eslint-disable-next-line no-console
      console.warn(
        'DuckLake extension not available via built-in system:',
        error,
      );
    }

    throw new Error('DuckLake extension not found in any location');
  }

  /**
   * Get bundled extension path (shipped with application)
   */
  private static getBundledExtensionPath(): string | null {
    try {
      const appPath = app.getAppPath();
      const extensionPath = path.join(
        appPath,
        'resources',
        'extensions',
        'ducklake.duckdb_extension',
      );
      return extensionPath;
    } catch (error) {
      return null;
    }
  }

  /**
   * Get system extension path (installed system-wide)
   */
  private static getSystemExtensionPath(): string | null {
    // Common system paths for DuckDB extensions
    const systemPaths = [
      '/usr/local/lib/duckdb/extensions',
      '/usr/lib/duckdb/extensions',
      '/opt/duckdb/extensions',
    ];

    const foundPath = systemPaths
      .map((systemPath) => path.join(systemPath, 'ducklake.duckdb_extension'))
      .find((extensionPath) => fs.existsSync(extensionPath));

    return foundPath || null;
  }

  /**
   * Get user extension path (installed in user directory)
   */
  private static getUserExtensionPath(): string | null {
    try {
      const userDataPath = app.getPath('userData');
      const extensionPath = path.join(
        userDataPath,
        'duckdb',
        'extensions',
        'ducklake.duckdb_extension',
      );
      return extensionPath;
    } catch (error) {
      return null;
    }
  }

  /**
   * Get diagnostic information about extension availability
   */
  static getDiagnostics(): {
    initialized: boolean;
    extensionAvailable: boolean;
    extensionInfo: ExtensionInfo | null;
    searchPaths: string[];
    recommendations: string[];
  } {
    const searchPaths = [
      this.getBundledExtensionPath(),
      this.getSystemExtensionPath(),
      this.getUserExtensionPath(),
    ].filter(Boolean) as string[];

    const recommendations: string[] = [];

    if (!this.isExtensionAvailable()) {
      recommendations.push(
        'Install DuckLake extension using: INSTALL ducklake; in DuckDB',
        'Ensure DuckDB version 0.9.0 or later is installed',
        'Check that internet connection is available for extension download',
      );
    }

    return {
      initialized: this.initialized,
      extensionAvailable: this.isExtensionAvailable(),
      extensionInfo: this.extensionInfo,
      searchPaths,
      recommendations,
    };
  }
}
