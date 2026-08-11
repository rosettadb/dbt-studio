interface UserContextItem {
  type: string;
  metadata?: Record<string, unknown> | null;
}

export const isVisibleUserContextItem = (item: UserContextItem): boolean =>
  !(
    item.type === 'file' &&
    item.metadata?.isSelected === true &&
    item.metadata?.isAdditional !== true
  );
