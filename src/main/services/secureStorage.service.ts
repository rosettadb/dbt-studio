import keytar from 'keytar';

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
    providerType: AIProviderType,
    apiKey: string,
  ): Promise<void> {
    const credentialKey = `${providerType}-api-key`;
    await this.setCredential(credentialKey, apiKey);
  }

  async getAIProviderCredential(
    providerType: AIProviderType,
  ): Promise<string | null> {
    const credentialKey = `${providerType}-api-key`;
    return this.getCredential(credentialKey);
  }

  async deleteAIProviderCredential(
    providerType: AIProviderType,
  ): Promise<void> {
    const credentialKey = `${providerType}-api-key`;
    await this.deleteCredential(credentialKey);
  }

  async listAIProviderCredentials(): Promise<string[]> {
    const allCredentials = await this.findCredentials();
    return allCredentials
      .filter((account) => account.endsWith('-api-key'))
      .map((account) => account.replace('-api-key', ''));
  }

  /**
   * Clean up all AI provider credentials
   */
  async cleanupAIProviderCredentials(): Promise<void> {
    const aiProviderTypes: AIProviderType[] = [
      'openai',
      'ollama',
      'gemini',
      'anthropic',
    ];

    await Promise.all(
      aiProviderTypes.map(async (providerType) => {
        try {
          await this.deleteAIProviderCredential(providerType);
        } catch (error) {
          // eslint-disable-next-line no-console
          console.error(
            `Failed to delete AI credential ${providerType}:`,
            error,
          );
        }
      }),
    );
  }
}

export default new SecureStorageService('dbt-studio');
