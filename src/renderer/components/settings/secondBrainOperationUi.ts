import type {
  SecondBrainManagerStatus,
  SecondBrainOperationKind,
  SecondBrainProgressEvent,
  SecondBrainRefreshStage,
} from '../../../types/secondBrain';

export type { SecondBrainOperationKind } from '../../../types/secondBrain';

export const SECOND_BRAIN_GENERATION_HELPERS = [
  'Reviewing durable project knowledge…',
  'Organizing candidate memory updates…',
  'Preparing structured Agent Memory changes…',
  'Checking updates against existing memory…',
] as const;

const stageMessages: Record<SecondBrainRefreshStage, string> = {
  preparing: 'Checking the AI provider and preparing Agent Memory…',
  collecting: 'Collecting approved project and application context…',
  redacting: 'Removing sensitive information from collected context…',
  comparing: 'Comparing collected context with existing memory…',
  generating: 'Generating structured memory updates… This may take a moment.',
  validating: 'Validating generated memory updates…',
  applying: 'Applying safe updates and rebuilding memory navigation…',
  completed: 'Agent Memory is ready.',
  cancelled: 'Agent Memory operation stopped.',
  failed: 'Agent Memory could not be updated.',
};

export const getSecondBrainOperationTitle = (
  kind: SecondBrainOperationKind,
): string => {
  if (kind === 'init') return 'Initializing Agent Memory';
  if (kind === 'preview') return 'Previewing Agent Memory refresh';
  return 'Refreshing Agent Memory';
};

export const getSecondBrainProgressMessage = (
  progress?: SecondBrainProgressEvent | null,
  stopping = false,
): string => {
  if (stopping) return 'Stopping Agent Memory operation…';
  if (!progress) return 'Preparing Agent Memory…';
  return stageMessages[progress.stage];
};

export const getSecondBrainProviderTooltip = (
  kind: SecondBrainOperationKind,
): string => {
  if (kind === 'init') {
    return 'Select an AI provider to initialize Agent Memory.';
  }
  if (kind === 'preview') {
    return 'Select an AI provider to preview a refresh.';
  }
  return 'Select an AI provider to refresh Agent Memory.';
};

export const isSecondBrainTerminalStage = (
  stage?: SecondBrainRefreshStage,
): boolean =>
  stage === 'completed' || stage === 'cancelled' || stage === 'failed';

export const isCurrentSecondBrainProgress = (
  progress: SecondBrainProgressEvent,
  operationId: string | undefined,
  startedAt: number,
): boolean => {
  if (operationId && progress.operationId !== operationId) return false;
  const timestamp = Date.parse(progress.timestamp);
  return Number.isFinite(timestamp) && timestamp >= startedAt;
};

/**
 * A build started outside the Agent Memory tab (the AI panel's memory prompt)
 * keeps running in the main process. Returns what the tab needs to follow it,
 * or null when nothing is running.
 */
export const getRunningSecondBrainOperation = (
  status: SecondBrainManagerStatus | undefined,
  now = Date.now(),
): {
  kind: SecondBrainOperationKind;
  operationId: string;
  startedAt: number;
  progress?: SecondBrainProgressEvent;
} | null => {
  if (!status?.busy || !status.activeOperationId) return null;
  const startedAt = Date.parse(status.activeOperationStartedAt ?? '');
  return {
    kind: status.activeOperationKind ?? 'init',
    operationId: status.activeOperationId,
    startedAt: Number.isFinite(startedAt) ? startedAt : now,
    progress: status.activeProgress,
  };
};

export const getSecondBrainTerminalPhase = (
  stage: SecondBrainRefreshStage,
): 'succeeded' | 'cancelled' | 'failed' | null => {
  if (stage === 'completed') return 'succeeded';
  if (stage === 'cancelled') return 'cancelled';
  if (stage === 'failed') return 'failed';
  return null;
};
