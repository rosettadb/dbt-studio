import type { SecondBrainProgressEvent } from '../../../../src/types/secondBrain';
import {
  getSecondBrainOperationTitle,
  getSecondBrainProgressMessage,
  getSecondBrainProviderTooltip,
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
});
