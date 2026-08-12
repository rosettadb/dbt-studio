import { isVisibleUserContextItem } from '../../../../src/renderer/components/chat/userContextVisibility';

const contextItem = (metadata: Record<string, unknown>) => ({
  id: 1,
  name: 'model.sql',
  type: 'file',
  content: 'select 1',
  metadata,
});

describe('MessageRenderer user context visibility', () => {
  it('hides an automatically included selected file', () => {
    expect(isVisibleUserContextItem(contextItem({ isSelected: true }))).toBe(
      false,
    );
  });

  it('keeps an explicitly attached selected file visible', () => {
    expect(
      isVisibleUserContextItem(
        contextItem({ isSelected: true, isAdditional: true }),
      ),
    ).toBe(true);
  });

  it('keeps other context items visible', () => {
    expect(
      isVisibleUserContextItem({
        ...contextItem({}),
        type: 'schema',
      }),
    ).toBe(true);
  });
});
