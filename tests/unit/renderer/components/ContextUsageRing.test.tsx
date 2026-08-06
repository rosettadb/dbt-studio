import { formatContextPercentage } from '../../../../src/renderer/components/chat/ContextUsageRing';

describe('ContextUsageRing percentage formatting', () => {
  it('keeps meaningful precision below one percent', () => {
    expect(formatContextPercentage(0)).toBe('0%');
    expect(formatContextPercentage(0.0595)).toBe('<0.1%');
    expect(formatContextPercentage(0.1009)).toBe('0.1%');
    expect(formatContextPercentage(1.26)).toBe('1.3%');
  });

  it('uses whole percentages for larger values', () => {
    expect(formatContextPercentage(69.6)).toBe('70%');
    expect(formatContextPercentage(100)).toBe('100%');
  });
});
