import { secureStorageService } from '../services/secureStorage.service';
import { CLOUD_DASHBOARD_API_KEY } from '../../main/utils/constants';

const useSecureStorage = () => {
  const setOpenAIKey = async (apiKey: string): Promise<void> => {
    await secureStorageService.set('openai-api-key', apiKey);
  };

  const getOpenAIKey = async (): Promise<string | null> => {
    return secureStorageService.get('openai-api-key');
  };

  const deleteOpenAIKey = async (): Promise<void> => {
    await secureStorageService.delete('openai-api-key');
  };

  const setDatabaseUsername = async (
    userName: string,
    projectName: string,
  ): Promise<void> => {
    await secureStorageService.set(`db-user-${projectName}`, userName);
  };

  const getDatabaseUsername = async (
    projectName: string,
  ): Promise<string | null> => {
    return secureStorageService.get(`db-user-${projectName}`);
  };

  const deleteDatabaseUsername = async (projectName: string): Promise<void> => {
    await secureStorageService.delete(`db-user-${projectName}`);
  };

  const setDatabasePassword = async (
    databasePassword: string,
    projectName: string,
  ): Promise<void> => {
    await secureStorageService.set(
      `db-password-${projectName}`,
      databasePassword,
    );
  };

  const getDatabasePassword = async (
    projectName: string,
  ): Promise<string | null> => {
    const data = await secureStorageService.get(`db-password-${projectName}`);
    return data;
  };

  const deleteDatabasePassword = async (projectName: string): Promise<void> => {
    await secureStorageService.delete(`db-password-${projectName}`);
  };

  const setDatabaseToken = async (
    databaseToken: string,
    projectName: string,
  ): Promise<void> => {
    await secureStorageService.set(`db-token-${projectName}`, databaseToken);
  };

  const getDatabaseToken = async (
    projectName: string,
  ): Promise<string | null> => {
    const data = await secureStorageService.get(`db-token-${projectName}`);
    return data;
  };

  const deleteDatabaseToken = async (projectName: string): Promise<void> => {
    await secureStorageService.delete(`db-token-${projectName}`);
  };

  // Cloud credential storage
  const setCloudGcsCredential = async (
    credential: string,
    connectionName: string,
  ): Promise<void> => {
    await secureStorageService.set(`cloud-gcs-${connectionName}`, credential);
  };

  const getCloudGcsCredential = async (
    connectionName: string,
  ): Promise<string | null> => {
    return secureStorageService.get(`cloud-gcs-${connectionName}`);
  };

  const deleteCloudGcsCredential = async (
    connectionName: string,
  ): Promise<void> => {
    await secureStorageService.delete(`cloud-gcs-${connectionName}`);
  };

  const setCloudAwsSecret = async (
    secret: string,
    connectionName: string,
  ): Promise<void> => {
    await secureStorageService.set(`cloud-aws-${connectionName}`, secret);
  };

  const getCloudAwsSecret = async (
    connectionName: string,
  ): Promise<string | null> => {
    return secureStorageService.get(`cloud-aws-${connectionName}`);
  };

  const deleteCloudAwsSecret = async (
    connectionName: string,
  ): Promise<void> => {
    await secureStorageService.delete(`cloud-aws-${connectionName}`);
  };

  const setCloudAwsSessionToken = async (
    sessionToken: string,
    connectionName: string,
  ): Promise<void> => {
    await secureStorageService.set(
      `cloud-aws-session-${connectionName}`,
      sessionToken,
    );
  };

  const getCloudAwsSessionToken = async (
    connectionName: string,
  ): Promise<string | null> => {
    return secureStorageService.get(`cloud-aws-session-${connectionName}`);
  };

  const deleteCloudAwsSessionToken = async (
    connectionName: string,
  ): Promise<void> => {
    await secureStorageService.delete(`cloud-aws-session-${connectionName}`);
  };

  const setCloudAzureKey = async (
    key: string,
    connectionName: string,
  ): Promise<void> => {
    await secureStorageService.set(`cloud-azure-${connectionName}`, key);
  };

  const getCloudAzureKey = async (
    connectionName: string,
  ): Promise<string | null> => {
    return secureStorageService.get(`cloud-azure-${connectionName}`);
  };

  const deleteCloudAzureKey = async (connectionName: string): Promise<void> => {
    await secureStorageService.delete(`cloud-azure-${connectionName}`);
  };

  // MinIO credential storage
  const setCloudMinioSecret = async (
    secret: string,
    connectionName: string,
  ): Promise<void> => {
    await secureStorageService.set(`cloud-minio-${connectionName}`, secret);
  };

  const getCloudMinioSecret = async (
    connectionName: string,
  ): Promise<string | null> => {
    return secureStorageService.get(`cloud-minio-${connectionName}`);
  };

  const deleteCloudMinioSecret = async (
    connectionName: string,
  ): Promise<void> => {
    await secureStorageService.delete(`cloud-minio-${connectionName}`);
  };

  // Cloudflare R2 credential storage
  const setCloudR2Secret = async (
    secret: string,
    connectionName: string,
  ): Promise<void> => {
    await secureStorageService.set(
      `cloud-cloudflare-r2-${connectionName}`,
      secret,
    );
  };

  const getCloudR2Secret = async (
    connectionName: string,
  ): Promise<string | null> => {
    return secureStorageService.get(`cloud-cloudflare-r2-${connectionName}`);
  };

  const deleteCloudR2Secret = async (connectionName: string): Promise<void> => {
    await secureStorageService.delete(`cloud-cloudflare-r2-${connectionName}`);
  };

  // Backblaze B2 credential storage
  const setCloudB2Secret = async (
    secret: string,
    connectionName: string,
  ): Promise<void> => {
    await secureStorageService.set(
      `cloud-backblaze-b2-${connectionName}`,
      secret,
    );
  };

  const getCloudB2Secret = async (
    connectionName: string,
  ): Promise<string | null> => {
    return secureStorageService.get(`cloud-backblaze-b2-${connectionName}`);
  };

  const deleteCloudB2Secret = async (connectionName: string): Promise<void> => {
    await secureStorageService.delete(`cloud-backblaze-b2-${connectionName}`);
  };

  // rustfs credential storage
  const setCloudRustfsSecret = async (
    secret: string,
    connectionName: string,
  ): Promise<void> => {
    await secureStorageService.set(`cloud-rustfs-${connectionName}`, secret);
  };

  const getCloudRustfsSecret = async (
    connectionName: string,
  ): Promise<string | null> => {
    return secureStorageService.get(`cloud-rustfs-${connectionName}`);
  };

  const deleteCloudRustfsSecret = async (
    connectionName: string,
  ): Promise<void> => {
    await secureStorageService.delete(`cloud-rustfs-${connectionName}`);
  };

  // BigQuery service account key storage
  const setBigQueryServiceAccountKey = async (
    key: string,
    connectionName: string,
  ): Promise<void> => {
    await secureStorageService.set(`db-bigquery-${connectionName}`, key);
  };

  const getBigQueryServiceAccountKey = async (
    connectionName: string,
  ): Promise<string | null> => {
    return secureStorageService.get(`db-bigquery-${connectionName}`);
  };

  const deleteBigQueryServiceAccountKey = async (
    connectionName: string,
  ): Promise<void> => {
    await secureStorageService.delete(`db-bigquery-${connectionName}`);
  };

  const setCloudApiKey = async (apiKey: string): Promise<void> => {
    await secureStorageService.set(CLOUD_DASHBOARD_API_KEY, apiKey);
  };

  const getCloudApiKey = async (): Promise<string | null> => {
    return secureStorageService.get(CLOUD_DASHBOARD_API_KEY);
  };

  const deleteCloudApiKey = async (): Promise<void> => {
    await secureStorageService.delete(CLOUD_DASHBOARD_API_KEY);
  };

  return {
    setOpenAIKey,
    getOpenAIKey,
    deleteOpenAIKey,
    setDatabaseUsername,
    getDatabaseUsername,
    deleteDatabaseUsername,
    setDatabasePassword,
    getDatabasePassword,
    deleteDatabasePassword,
    setDatabaseToken,
    getDatabaseToken,
    deleteDatabaseToken,
    setCloudGcsCredential,
    getCloudGcsCredential,
    deleteCloudGcsCredential,
    setCloudAwsSecret,
    getCloudAwsSecret,
    deleteCloudAwsSecret,
    setCloudAwsSessionToken,
    getCloudAwsSessionToken,
    deleteCloudAwsSessionToken,
    setCloudAzureKey,
    getCloudAzureKey,
    deleteCloudAzureKey,
    setCloudMinioSecret,
    getCloudMinioSecret,
    deleteCloudMinioSecret,
    setCloudR2Secret,
    getCloudR2Secret,
    deleteCloudR2Secret,
    setCloudB2Secret,
    getCloudB2Secret,
    deleteCloudB2Secret,
    setCloudRustfsSecret,
    getCloudRustfsSecret,
    deleteCloudRustfsSecret,
    setBigQueryServiceAccountKey,
    getBigQueryServiceAccountKey,
    deleteBigQueryServiceAccountKey,
    setCloudApiKey,
    getCloudApiKey,
    deleteCloudApiKey,
  };
};

export default useSecureStorage;
