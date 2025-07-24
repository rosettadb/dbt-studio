import { secureStorageService } from '../services/secureStorage.service';

const useSecureStorage = () => {
  const setOpenAIKey = async (apiKey: string): Promise<void> => {
    await secureStorageService.set('openai-api-key', apiKey);
  };

  const getOpenAIKey = async (): Promise<string | null> => {
    const data = await secureStorageService.get('openai-api-key');
    return data;
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
    const data = await secureStorageService.get(`db-user-${projectName}`);
    return data;
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
    setCloudAzureKey,
    getCloudAzureKey,
    deleteCloudAzureKey,
  };
};

export default useSecureStorage;
