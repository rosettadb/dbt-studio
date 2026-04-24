import { aiProvidersService } from '../../../../src/renderer/services/aiProviders.service';
import { client as rawClient } from '../../../../src/renderer/config/client';

jest.mock('../../../../src/renderer/config/client', () => ({
  client: {
    get: jest.fn(),
    post: jest.fn(),
  },
}));

const client = rawClient as jest.Mocked<typeof rawClient>;

describe('renderer/services/aiProviders.service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('listProviders should call client.get with ai:provider:list and return data', async () => {
    client.get.mockResolvedValue({ data: [{ id: 1, name: 'P' }] });

    const result = await aiProvidersService.listProviders();

    expect(client.get).toHaveBeenCalledWith('ai:provider:list');
    expect(result).toEqual([{ id: 1, name: 'P' }]);
  });

  it('getProviderById should call client.post with ai:provider:get and id', async () => {
    client.post.mockResolvedValue({ data: { id: 1, name: 'P' } });

    const result = await aiProvidersService.getProviderById(1);

    expect(client.post).toHaveBeenCalledWith('ai:provider:get', 1);
    expect(result).toEqual({ id: 1, name: 'P' });
  });

  it('getActiveProvider should call client.get with ai:provider:get-active', async () => {
    client.get.mockResolvedValue({ data: null });

    const result = await aiProvidersService.getActiveProvider();

    expect(client.get).toHaveBeenCalledWith('ai:provider:get-active');
    expect(result).toBeNull();
  });

  it('createProvider should call client.post with ai:provider:save and provider payload', async () => {
    const provider = { name: 'X', type: 'openai' } as any;
    client.post.mockResolvedValue({ data: { id: 1, ...provider } });

    const result = await aiProvidersService.createProvider(provider);

    expect(client.post).toHaveBeenCalledWith('ai:provider:save', provider);
    expect(result).toEqual({ id: 1, ...provider });
  });

  it('updateProvider should call client.post with ai:provider:update and id/updates', async () => {
    client.post.mockResolvedValue({ data: undefined });

    await aiProvidersService.updateProvider(1, { name: 'Y' } as any);

    expect(client.post).toHaveBeenCalledWith('ai:provider:update', {
      id: 1,
      updates: { name: 'Y' },
    });
  });

  it('deleteProvider should call client.post with ai:provider:delete and id', async () => {
    client.post.mockResolvedValue({ data: undefined });

    await aiProvidersService.deleteProvider(1);

    expect(client.post).toHaveBeenCalledWith('ai:provider:delete', 1);
  });

  it('setActiveProvider should call client.post with ai:provider:set-active and providerId', async () => {
    client.post.mockResolvedValue({ data: undefined });

    await aiProvidersService.setActiveProvider('provider-1');

    expect(client.post).toHaveBeenCalledWith(
      'ai:provider:set-active',
      'provider-1',
    );
  });

  it('deactivateAllProviders should call client.get with ai:provider:deactivate-all', async () => {
    client.get.mockResolvedValue({ data: undefined });

    await aiProvidersService.deactivateAllProviders();

    expect(client.get).toHaveBeenCalledWith('ai:provider:deactivate-all');
  });

  it('testProviderConnection should call client.post with ai:provider:test-connection and providerId', async () => {
    client.post.mockResolvedValue({ data: { ok: true } });

    const result =
      await aiProvidersService.testProviderConnection('provider-1');

    expect(client.post).toHaveBeenCalledWith(
      'ai:provider:test-connection',
      'provider-1',
    );
    expect(result).toEqual({ ok: true });
  });

  it('testTemporaryProvider should call client.post with ai:provider:test-temp-connection and config/credentials', async () => {
    client.post.mockResolvedValue({ data: { ok: true } });

    const config = { name: 'X', type: 'openai' } as any;
    const credentials = { apiKey: 'k' } as any;
    const result = await aiProvidersService.testTemporaryProvider(
      config,
      credentials,
    );

    expect(client.post).toHaveBeenCalledWith(
      'ai:provider:test-temp-connection',
      {
        config,
        credentials,
      },
    );
    expect(result).toEqual({ ok: true });
  });

  it('getProviderModels should call client.post with ai:provider:get-models and providerId', async () => {
    client.post.mockResolvedValue({ data: [{ id: 'm1' }] });

    const result = await aiProvidersService.getProviderModels('provider-1');

    expect(client.post).toHaveBeenCalledWith(
      'ai:provider:get-models',
      'provider-1',
    );
    expect(result).toEqual([{ id: 'm1' }]);
  });

  it('getAllProviderModels should call client.get with ai:provider:get-all-models', async () => {
    const modelsMap = new Map<string, any[]>([['provider-1', [{ id: 'm1' }]]]);
    client.get.mockResolvedValue({ data: modelsMap });

    const result = await aiProvidersService.getAllProviderModels();

    expect(client.get).toHaveBeenCalledWith('ai:provider:get-all-models');
    expect(result).toEqual(modelsMap);
  });

  it('getProviderCredential should call client.post with ai:provider:get-credential and providerId/providerType', async () => {
    client.post.mockResolvedValue({ data: 'secret' });

    const result = await aiProvidersService.getProviderCredential(1, 'openai');

    expect(client.post).toHaveBeenCalledWith('ai:provider:get-credential', {
      providerId: 1,
      providerType: 'openai',
    });
    expect(result).toBe('secret');
  });

  it('generateCompletion should call client.post with ai:completion:generate and set schemaConfig.description', async () => {
    client.post.mockResolvedValue({ data: { ok: true } });

    const schemaConfig = { schema: {} } as any;
    const result = await aiProvidersService.generateCompletion(
      'hello',
      schemaConfig,
    );

    expect(schemaConfig.description).toBe('hello');
    expect(client.post).toHaveBeenCalledWith('ai:completion:generate', {
      prompt: 'hello',
      schemaConfig,
    });
    expect(result).toEqual({ ok: true });
  });
});
