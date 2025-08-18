import { client } from '../config/client';
import type {
  AIProvider,
  NewAIProvider,
  ProviderTestResult,
  AIModel,
} from '../controllers/aiProviders.controller';

class AIProvidersService {
  // Get all AI providers
  static async listProviders(): Promise<AIProvider[]> {
    const { data } = await client.get<AIProvider[]>('ai:provider:list');
    return data;
  }

  // Get specific AI provider
  static async getProviderById(id: number): Promise<AIProvider | null> {
    const { data } = await client.post<number, AIProvider | null>(
      'ai:provider:get',
      id,
    );
    return data;
  }

  // Get active AI provider
  static async getActiveProvider(): Promise<AIProvider | null> {
    const { data } = await client.get<AIProvider | null>(
      'ai:provider:get-active',
    );
    return data;
  }

  // Create AI provider
  static async createProvider(provider: NewAIProvider): Promise<AIProvider> {
    const { data } = await client.post<NewAIProvider, AIProvider>(
      'ai:provider:save',
      provider,
    );
    return data;
  }

  // Update AI provider
  static async updateProvider(
    id: number,
    updates: Partial<NewAIProvider>,
  ): Promise<void> {
    await client.post<{ id: number; updates: Partial<NewAIProvider> }>(
      'ai:provider:update',
      { id, updates },
    );
  }

  // Get provider credential
  static async getProviderCredential(
    providerId: number,
    providerType: string,
  ): Promise<string | null> {
    const { data } = await client.post<
      { providerId: number; providerType: string },
      string | null
    >('ai:provider:get-credential', { providerId, providerType });
    return data;
  }

  // Delete AI provider
  static async deleteProvider(id: number): Promise<void> {
    await client.post<number>('ai:provider:delete', id);
  }

  // Set active AI provider
  static async setActiveProvider(providerId: string): Promise<void> {
    await client.post<string>('ai:provider:set-active', providerId);
  }

  // Test AI provider connection
  static async testProviderConnection(
    providerId: string,
  ): Promise<ProviderTestResult> {
    try {
      const { data } = await client.post<string, ProviderTestResult>(
        'ai:provider:test-connection',
        providerId,
      );
      return data;
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error(
        '[RENDERER SERVICE] testProviderConnection - Error occurred:',
        error,
      );
      throw error;
    }
  }

  // Test temporary provider configuration (before saving)
  static async testTemporaryProvider(
    config: NewAIProvider,
    credentials: Record<string, any>,
  ): Promise<ProviderTestResult> {
    const { data } = await client.post<
      { config: NewAIProvider; credentials: Record<string, any> },
      ProviderTestResult
    >('ai:provider:test-temp-connection', { config, credentials });
    return data;
  }

  // Get provider models
  static async getProviderModels(providerId: string): Promise<AIModel[]> {
    const { data } = await client.post<string, AIModel[]>(
      'ai:provider:get-models',
      providerId,
    );
    return data;
  }

  // Get all models from all providers
  static async getAllProviderModels(): Promise<Map<string, AIModel[]>> {
    const { data } = await client.get<Map<string, AIModel[]>>(
      'ai:provider:get-all-models',
    );
    return data;
  }

  // Health check for all providers
  static async checkProviderHealth(): Promise<Map<string, ProviderTestResult>> {
    const { data } = await client.get<Map<string, ProviderTestResult>>(
      'ai:provider:health-check',
    );
    return data;
  }

  // Initialize provider manager
  static async initializeProviderManager(): Promise<void> {
    await client.get('ai:provider-manager:initialize');
  }
}

export const aiProvidersService = {
  listProviders: AIProvidersService.listProviders,
  getProviderById: AIProvidersService.getProviderById,
  getActiveProvider: AIProvidersService.getActiveProvider,
  createProvider: AIProvidersService.createProvider,
  updateProvider: AIProvidersService.updateProvider,
  deleteProvider: AIProvidersService.deleteProvider,
  setActiveProvider: AIProvidersService.setActiveProvider,
  testProviderConnection: AIProvidersService.testProviderConnection,
  testTemporaryProvider: AIProvidersService.testTemporaryProvider,
  getProviderModels: AIProvidersService.getProviderModels,
  getAllProviderModels: AIProvidersService.getAllProviderModels,
  checkProviderHealth: AIProvidersService.checkProviderHealth,
  getProviderCredential: AIProvidersService.getProviderCredential,
  initializeProviderManager: AIProvidersService.initializeProviderManager,
};
