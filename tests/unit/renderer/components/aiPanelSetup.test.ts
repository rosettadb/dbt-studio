import {
  getAIProviderSetupState,
  shouldShowMemoryConsent,
} from '../../../../src/renderer/components/chat/aiPanelSetup';

describe('getAIProviderSetupState', () => {
  it('reports loading until both provider lookups have finished', () => {
    expect(
      getAIProviderSetupState({
        isLoading: true,
        providerCount: 2,
        hasActiveProvider: true,
      }),
    ).toBe('loading');
  });

  it('reports no-providers when none are configured', () => {
    expect(
      getAIProviderSetupState({
        isLoading: false,
        providerCount: 0,
        hasActiveProvider: false,
      }),
    ).toBe('no-providers');
  });

  it('reports no-active-provider when providers exist but none is active', () => {
    expect(
      getAIProviderSetupState({
        isLoading: false,
        providerCount: 2,
        hasActiveProvider: false,
      }),
    ).toBe('no-active-provider');
  });

  it('reports ready when a provider is active', () => {
    expect(
      getAIProviderSetupState({
        isLoading: false,
        providerCount: 1,
        hasActiveProvider: true,
      }),
    ).toBe('ready');
  });
});

describe('shouldShowMemoryConsent', () => {
  it('asks once a provider is active and no choice is saved', () => {
    expect(
      shouldShowMemoryConsent({
        providerSetupState: 'ready',
        storedDecision: null,
      }),
    ).toBe(true);
  });

  it.each(['loading', 'no-providers', 'no-active-provider'] as const)(
    'does not ask while the provider state is %s',
    (providerSetupState) => {
      expect(
        shouldShowMemoryConsent({ providerSetupState, storedDecision: null }),
      ).toBe(false);
    },
  );

  it.each([true, false])(
    'does not ask again after the user chose %s',
    (storedDecision) => {
      expect(
        shouldShowMemoryConsent({
          providerSetupState: 'ready',
          storedDecision,
        }),
      ).toBe(false);
    },
  );
});
