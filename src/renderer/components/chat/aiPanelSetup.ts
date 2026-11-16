/**
 * First-time setup rules for the AI panel.
 *
 * Initializing Agent Memory calls the active model, so the memory consent
 * dialog is only offered once an AI provider is active. Until then the panel
 * points the user to AI Provider Settings instead.
 */

export type AIProviderSetupState =
  | 'loading'
  | 'no-providers'
  | 'no-active-provider'
  | 'ready';

export const getAIProviderSetupState = ({
  isLoading,
  providerCount,
  hasActiveProvider,
}: {
  /** True until both the provider list and the active provider have loaded. */
  isLoading: boolean;
  providerCount: number;
  hasActiveProvider: boolean;
}): AIProviderSetupState => {
  if (isLoading) return 'loading';
  if (providerCount === 0) return 'no-providers';
  if (!hasActiveProvider) return 'no-active-provider';
  return 'ready';
};

export const shouldShowMemoryConsent = ({
  providerSetupState,
  storedDecision,
}: {
  providerSetupState: AIProviderSetupState;
  /** Choice saved by an earlier prompt; null when the user has not chosen yet. */
  storedDecision: boolean | null;
}): boolean => providerSetupState === 'ready' && storedDecision === null;
