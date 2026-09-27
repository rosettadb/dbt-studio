import SecureStorageService from '../../../../src/main/services/secureStorage.service';

// Plan 71, C2: ChatGPT OAuth tokens live under a separate `-oauth` key, so
// `getAIProviderCredential` (reachable from the renderer through
// `ai:provider:get-credential`) can never return them.
const keychain = new Map<string, string>();

jest.mock('keytar', () => ({
  __esModule: true,
  default: {
    setPassword: jest.fn(async (_s: string, account: string, value: string) => {
      keychain.set(account, value);
    }),
    getPassword: jest.fn(async (_s: string, account: string) =>
      keychain.has(account) ? keychain.get(account) : null,
    ),
    deletePassword: jest.fn(async (_s: string, account: string) =>
      keychain.delete(account),
    ),
    findCredentials: jest.fn(async () =>
      [...keychain.entries()].map(([account, password]) => ({
        account,
        password,
      })),
    ),
  },
}));

jest.mock('../../../../src/main/services/mainDatabase.service', () => ({
  __esModule: true,
  default: {},
}));

describe('SecureStorageService OAuth credentials (Plan 71)', () => {
  beforeEach(() => keychain.clear());

  it('never returns OAuth tokens through getAIProviderCredential', async () => {
    await SecureStorageService.setAIProviderOAuthCredential(
      3,
      'openai-codex',
      '{"refreshToken":"secret"}',
    );

    await expect(
      SecureStorageService.getAIProviderCredential(3, 'openai-codex'),
    ).resolves.toBeNull();
    await expect(
      SecureStorageService.getAIProviderOAuthCredential(3, 'openai-codex'),
    ).resolves.toBe('{"refreshToken":"secret"}');
  });

  it('deletes the OAuth key together with the API key (provider delete, factory reset)', async () => {
    await SecureStorageService.setAIProviderOAuthCredential(
      3,
      'openai-codex',
      '{}',
    );
    await SecureStorageService.setAIProviderCredential(4, 'openai', 'sk-1');

    await SecureStorageService.deleteAIProviderCredential(3, 'openai-codex');

    expect([...keychain.keys()]).toEqual(['openai-4-api-key']);
  });
});
