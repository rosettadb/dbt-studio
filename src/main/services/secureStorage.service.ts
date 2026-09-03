import keytar from 'keytar';
import { execFile } from 'child_process';
import { promisify } from 'util';
import MainDatabaseService from './mainDatabase.service';

const execFileAsync = promisify(execFile);
const MAC_KEYCHAIN_DELETE_LIMIT = 10_000;

const isMacKeychainItemNotFound = (error: unknown): boolean => {
  if (!(error instanceof Error)) return false;
  const commandError = error as Error & {
    code?: number | string;
    stderr?: string;
  };
  return (
    commandError.code === 44 ||
    commandError.code === '44' ||
    commandError.stderr?.includes(
      'The specified item could not be found in the keychain',
    ) === true
  );
};

// AI Provider types for secure storage
export type AIProviderType =
  | 'openai'
  | 'ollama'
  | 'gemini'
  | 'anthropic'
  | 'openai-compatible'
  | 'lmstudio';

class SecureStorageService {
  private serviceName: string;

  private readonly ENVIRONMENTS_KEY = '__keystore_environments__';

  // Per-key operation queue so check-then-write sequences (e.g.
  // createCredentialIfAbsent, the environments read-modify-write) can't
  // interleave with a concurrent call for the same key within this process.
  private locks = new Map<string, Promise<unknown>>();

  constructor(serviceName: string) {
    this.serviceName = serviceName;
  }

  private withLock<T>(key: string, fn: () => Promise<T>): Promise<T> {
    const previous = this.locks.get(key) ?? Promise.resolve();
    const result = previous.then(fn, fn);
    this.locks.set(
      key,
      result.then(
        () => undefined,
        () => undefined,
      ),
    );
    return result;
  }

  async setCredential(account: string, password: string): Promise<void> {
    if (!password) {
      await this.deleteCredential(account);
      return;
    }
    await keytar.setPassword(this.serviceName, account, password);
  }

  async getCredential(account: string): Promise<string | null> {
    return keytar.getPassword(this.serviceName, account);
  }

  async deleteCredential(account: string): Promise<void> {
    await keytar.deletePassword(this.serviceName, account);
  }

  async findCredentials(): Promise<string[]> {
    const credentials = await keytar.findCredentials(this.serviceName);
    return credentials
      .map((cred) => cred.account)
      .filter((account) => account !== this.ENVIRONMENTS_KEY);
  }

  async clearAllCredentials(): Promise<void> {
    if (process.platform === 'darwin') {
      await this.clearMacKeychainCredentials();
      return;
    }

    const credentials = await keytar.findCredentials(this.serviceName);
    let failureCount = 0;

    // Native credential-manager operations must be serialized. Starting many
    // OS-level deletions at once can queue overlapping authorization requests.
    for (let index = 0; index < credentials.length; index += 1) {
      try {
        // eslint-disable-next-line no-await-in-loop
        const deleted = await keytar.deletePassword(
          this.serviceName,
          credentials[index].account,
        );
        if (!deleted) failureCount += 1;
      } catch {
        failureCount += 1;
      }
    }

    if (failureCount > 0) {
      throw new Error(
        `Failed to delete ${failureCount} secure credential account(s)`,
      );
    }

    const remaining = await keytar.findCredentials(this.serviceName);
    if (remaining.length > 0) {
      throw new Error(
        `Failed to verify removal of ${remaining.length} secure credential account(s)`,
      );
    }
  }

  private async clearMacKeychainCredentials(): Promise<void> {
    for (let index = 0; index < MAC_KEYCHAIN_DELETE_LIMIT; index += 1) {
      try {
        // Do not use findCredentials() on macOS: it requests every secret value
        // and can trigger one authorization dialog per Keychain item. The
        // service-only query deletes matching generic-password items without
        // reading their contents.
        // eslint-disable-next-line no-await-in-loop
        await execFileAsync('/usr/bin/security', [
          'delete-generic-password',
          '-s',
          this.serviceName,
        ]);
      } catch (error) {
        if (isMacKeychainItemNotFound(error)) return;
        throw new Error('Failed to delete secure credential accounts');
      }
    }

    throw new Error('Failed to verify secure credential account removal');
  }

  async getEnvironments(): Promise<string[]> {
    const stored = await this.getCredential(this.ENVIRONMENTS_KEY);
    if (!stored) return [];
    try {
      const parsed: unknown = JSON.parse(stored);
      return Array.isArray(parsed) &&
        parsed.every((value) => typeof value === 'string')
        ? parsed
        : [];
    } catch {
      return [];
    }
  }

  async setEnvironments(environments: string[]): Promise<void> {
    await this.setCredential(
      this.ENVIRONMENTS_KEY,
      JSON.stringify(environments),
    );
  }

  /**
   * Atomically creates a credential only if no value is currently stored for
   * `account` (check-then-write serialized per key, so a concurrent or
   * retried call can't clobber a real value written in between).
   */
  async createCredentialIfAbsent(
    account: string,
    password: string,
  ): Promise<{ created: boolean }> {
    return this.withLock(account, async () => {
      const existing = await this.getCredential(account);
      if (existing !== null) return { created: false };
      await this.setCredential(account, password);
      return { created: true };
    });
  }

  /**
   * Atomically adds `environment` to the stored environment list if it's not
   * already present (read-modify-write serialized per key, so concurrent
   * calls can't lose an entry).
   */
  async addEnvironment(environment: string): Promise<void> {
    await this.withLock(this.ENVIRONMENTS_KEY, async () => {
      const environments = await this.getEnvironments();
      if (!environments.includes(environment)) {
        await this.setEnvironments([...environments, environment]);
      }
    });
  }

  /**
   * Clean up all credentials associated with a specific connection
   */
  async cleanupConnectionCredentials(connectionId: string): Promise<void> {
    const credentialTypes = [
      `cloud-gcs-${connectionId}`,
      `cloud-aws-${connectionId}`,
      `cloud-azure-${connectionId}`,
      // Database connection fields
      `db-user-${connectionId}`,
      `db-password-${connectionId}`,
      `db-token-${connectionId}`,
      `db-bigquery-${connectionId}`,
      `db-host-${connectionId}`,
      `db-port-${connectionId}`,
      `db-dbname-${connectionId}`,
      `db-schema-${connectionId}`,
      `db-account-${connectionId}`,
      `db-warehouse-${connectionId}`,
      `db-role-${connectionId}`,
      `db-project-${connectionId}`,
      `db-dataset-${connectionId}`,
      `db-httppath-${connectionId}`,
      `db-catalog-${connectionId}`,
    ];

    await Promise.all(
      credentialTypes.map(async (credentialType) => {
        try {
          await this.deleteCredential(credentialType);
        } catch (error) {
          // eslint-disable-next-line no-console
          console.error(
            `Failed to delete credential ${credentialType}:`,
            error,
          );
        }
      }),
    );
  }

  /**
   * AI Provider credential management methods
   */
  async setAIProviderCredential(
    providerId: number,
    providerType: AIProviderType,
    apiKey: string,
  ): Promise<void> {
    const credentialKey = `${providerType}-${providerId}-api-key`;
    await this.setCredential(credentialKey, apiKey);
  }

  async getAIProviderCredential(
    providerId: number,
    providerType: AIProviderType,
  ): Promise<string | null> {
    try {
      const credentialKey = `${providerType}-${providerId}-api-key`;

      let credential = await this.getCredential(credentialKey);

      // Fallback: try old key format for backward compatibility
      if (!credential) {
        const oldCredentialKey = `${providerType}-api-key`;
        credential = await this.getCredential(oldCredentialKey);

        // If found with old key, migrate to new key format
        if (credential) {
          try {
            await this.setAIProviderCredential(
              providerId,
              providerType,
              credential,
            );
            // Optionally delete old key (commented out to avoid breaking other providers)
            // await this.deleteCredential(oldCredentialKey);
          } catch (migrationError) {
            // eslint-disable-next-line no-console
            console.error(
              '[SECURE STORAGE] Failed to migrate credential, but returning found credential:',
              migrationError,
            );
            // Continue with found credential even if migration fails
          }
        }
      }

      return credential;
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('[SECURE STORAGE] Failed to get AI provider credential:', {
        providerId,
        providerType,
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
  }

  async deleteAIProviderCredential(
    providerId: number,
    providerType: AIProviderType,
  ): Promise<void> {
    const credentialKey = `${providerType}-${providerId}-api-key`;
    await this.deleteCredential(credentialKey);
  }

  async listAIProviderCredentials(): Promise<string[]> {
    const allCredentials = await this.findCredentials();
    return allCredentials
      .filter((account) => account.endsWith('-api-key'))
      .map((account) => account.replace('-api-key', ''));
  }

  /**
   * Clean up all AI provider credentials using provider data from database
   */
  async cleanupAIProviderCredentials(): Promise<void> {
    try {
      // Get all providers from the database
      const providers = await MainDatabaseService.getProviders();

      // Clean up credentials for each provider
      await Promise.all(
        providers.map(async (provider) => {
          try {
            await this.deleteAIProviderCredential(
              provider.id,
              provider.type as AIProviderType,
            );
          } catch (error) {
            // eslint-disable-next-line no-console
            console.error(
              `[SECURE STORAGE] Failed to delete credential for provider ${provider.name} (${provider.type}):`,
              error,
            );
          }
        }),
      );

      // Also clean up any legacy credentials with old key format
      const aiProviderTypes: AIProviderType[] = [
        'openai',
        'ollama',
        'gemini',
        'anthropic',
        'openai-compatible',
        'lmstudio',
      ];

      await Promise.all(
        aiProviderTypes.map(async (providerType) => {
          try {
            const legacyKey = `${providerType}-api-key`;
            await this.deleteCredential(legacyKey);
          } catch (error) {
            // This is expected for non-existent credentials - no need to log
          }
        }),
      );
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error(
        '[SECURE STORAGE] Error during AI provider credentials cleanup:',
        error,
      );
      throw error;
    }
  }
}

export default new SecureStorageService('dbt-studio');
