import keytar from 'keytar';
import MainDatabaseService from './mainDatabase.service';

// AI Provider types for secure storage
export type AIProviderType = 'openai' | 'ollama' | 'gemini' | 'anthropic';

class SecureStorageService {
  private serviceName: string;

  constructor(serviceName: string) {
    this.serviceName = serviceName;
  }

  async setCredential(account: string, password: string): Promise<void> {
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
    return credentials.map((cred) => cred.account);
  }

  /**
   * Clean up all credentials associated with a specific connection
   */
  async cleanupConnectionCredentials(connectionName: string): Promise<void> {
    const credentialTypes = [
      `cloud-gcs-${connectionName}`,
      `cloud-aws-${connectionName}`,
      `cloud-azure-${connectionName}`,
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
