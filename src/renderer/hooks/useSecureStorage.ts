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

  const setDatabasToken = async (
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
    setDatabasToken,
    getDatabaseToken,
    deleteDatabaseToken,
  };
};

export default useSecureStorage;
