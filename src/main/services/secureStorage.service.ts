import keytar from 'keytar';

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
          console.error(
            `Failed to delete credential ${credentialType}:`,
            error,
          );
        }
      }),
    );
  }
}

export default new SecureStorageService('dbt-studio');
