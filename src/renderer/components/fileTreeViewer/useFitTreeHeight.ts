import React, { useCallback, useLayoutEffect, useState } from 'react';
import type { TreeApi } from 'react-arborist';

/**
 * Height for a react-arborist tree that shows every visible row instead of
 * scrolling inside a fixed box, so several trees can stack in one scroll
 * area. Pass `onToggle` to the tree; the height also follows `data`.
 */
export const useFitTreeHeight = <T>(
  treeRef: React.RefObject<TreeApi<T> | null | undefined>,
  rowHeight: number,
  data: unknown,
  enabled = true,
) => {
  const [rows, setRows] = useState(1);

  const readRows = useCallback(() => {
    const count = treeRef.current?.visibleNodes.length;
    if (count !== undefined) setRows(count);
  }, [treeRef]);

  // New data: the tree has already rendered it when this runs
  useLayoutEffect(() => {
    if (enabled) readRows();
  }, [enabled, data, readRows]);

  // A folder opened or closed: the tree re-renders on its own, so read the
  // rows after that render
  const onToggle = useCallback(() => {
    if (enabled) requestAnimationFrame(readRows);
  }, [enabled, readRows]);

  return { height: Math.max(rows, 1) * rowHeight, onToggle };
};
