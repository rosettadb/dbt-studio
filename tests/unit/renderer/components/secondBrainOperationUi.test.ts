import type { SecondBrainProgressEvent } from '../../../../src/types/secondBrain';
import {
  getRunningSecondBrainOperation,
  getSecondBrainOperationTitle,
  getSecondBrainProgressMessage,
  getSecondBrainProviderTooltip,
  getSecondBrainTerminalPhase,
  isCurrentSecondBrainProgress,
  isSecondBrainTerminalStage,
  SECOND_BRAIN_GENERATION_HELPERS,
} from '../../../../src/renderer/components/settings/secondBrainOperationUi';

const progress = (
  stage: SecondBrainProgressEvent['stage'],
  overrides: Partial<SecondBrainProgressEvent> = {},
): SecondBrainProgressEvent => ({
  operationId: 'operation-1',
  stage,
  completed: 0,
  message: 'Backend detail.',
  timestamp: '2026-07-28T03:00:01.000Z',
  cancellable: !['completed', 'cancelled', 'failed'].includes(stage),
  ...overrides,
});

describe('secondBrainOperationUi', () => {
  it('maps operation kinds and provider requirements to user-facing copy', () => {
    expect(getSecondBrainOperationTitle('init')).toBe(
      'Initializing Agent Memory',
    );
    expect(getSecondBrainOperationTitle('preview')).toBe(
      'Previewing Agent Memory refresh',
    );
    expect(getSecondBrainOperationTitle('apply')).toBe(
      'Refreshing Agent Memory',
    );
    expect(getSecondBrainProviderTooltip('init')).toContain('initialize');
    expect(getSecondBrainProviderTooltip('preview')).toContain('preview');
    expect(getSecondBrainProviderTooltip('apply')).toContain('refresh');
  });

  it.each([
    ['preparing', 'Checking the AI provider'],
    ['collecting', 'Collecting approved'],
    ['redacting', 'Removing sensitive'],
    ['comparing', 'Comparing collected'],
    ['generating', 'Generating structured'],
    ['validating', 'Validating generated'],
    ['applying', 'Applying safe updates'],
    ['completed', 'Agent Memory is ready'],
    ['cancelled', 'operation stopped'],
    ['failed', 'could not be updated'],
  ] as const)('maps %s to its authoritative loading message', (stage, text) => {
    expect(getSecondBrainProgressMessage(progress(stage))).toContain(text);
  });

  it('uses preparing and stopping messages without inventing provider progress', () => {
    expect(getSecondBrainProgressMessage()).toBe('Preparing Agent Memory…');
    expect(getSecondBrainProgressMessage(progress('generating'), true)).toBe(
      'Stopping Agent Memory operation…',
    );
    expect(SECOND_BRAIN_GENERATION_HELPERS).toHaveLength(4);
  });

  it('accepts only current, non-stale operation progress', () => {
    const startedAt = Date.parse('2026-07-28T03:00:00.000Z');

    expect(
      isCurrentSecondBrainProgress(
        progress('collecting'),
        undefined,
        startedAt,
      ),
    ).toBe(true);
    expect(
      isCurrentSecondBrainProgress(
        progress('collecting'),
        'operation-1',
        startedAt,
      ),
    ).toBe(true);
    expect(
      isCurrentSecondBrainProgress(
        progress('collecting'),
        'operation-2',
        startedAt,
      ),
    ).toBe(false);
    expect(
      isCurrentSecondBrainProgress(
        progress('collecting', {
          timestamp: '2026-07-28T02:59:59.000Z',
        }),
        undefined,
        startedAt,
      ),
    ).toBe(false);
  });

  it('recognizes all terminal stages', () => {
    expect(isSecondBrainTerminalStage('completed')).toBe(true);
    expect(isSecondBrainTerminalStage('cancelled')).toBe(true);
    expect(isSecondBrainTerminalStage('failed')).toBe(true);
    expect(isSecondBrainTerminalStage('generating')).toBe(false);
  });

  describe('getRunningSecondBrainOperation', () => {
    const idleStatus = {
      enabled: true,
      initialized: false,
      pageCount: 0,
      totalBytes: 0,
      busy: false,
      layoutVersion: 'empty' as const,
    };

    it('returns null when no build is running', () => {
      expect(getRunningSecondBrainOperation(undefined)).toBeNull();
      expect(getRunningSecondBrainOperation(idleStatus)).toBeNull();
    });

    it('describes a build started elsewhere so the tab can follow it', () => {
      const latest = progress('generating', { cancellable: true });
      expect(
        getRunningSecondBrainOperation({
          ...idleStatus,
          busy: true,
          activeOperationId: 'operation-1',
          activeOperationKind: 'init',
          activeOperationStartedAt: '2026-07-28T03:00:00.000Z',
          activeProgress: latest,
        }),
      ).toEqual({
        kind: 'init',
        operationId: 'operation-1',
        startedAt: Date.parse('2026-07-28T03:00:00.000Z'),
        progress: latest,
      });
    });

    it('falls back to now when the start time is missing', () => {
      expect(
        getRunningSecondBrainOperation(
          { ...idleStatus, busy: true, activeOperationId: 'operation-1' },
          1234,
        ),
      ).toEqual({
        kind: 'init',
        operationId: 'operation-1',
        startedAt: 1234,
        progress: undefined,
      });
    });
  });

  it('maps final progress stages to dialog phases', () => {
    expect(getSecondBrainTerminalPhase('completed')).toBe('succeeded');
    expect(getSecondBrainTerminalPhase('cancelled')).toBe('cancelled');
    expect(getSecondBrainTerminalPhase('failed')).toBe('failed');
    expect(getSecondBrainTerminalPhase('generating')).toBeNull();
  });
});
