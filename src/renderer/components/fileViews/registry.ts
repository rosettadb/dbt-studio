import type { EditorTabState } from '../../../types/editor';
import { createRegistry } from '../../../extensionHost/renderer/registry.renderer';
import type { Disposable } from '../../../extensionHost/shared/protocol.shared';
import type { FileViewDefinition } from './types';

// Highest priority first; equal priorities keep registration order.
export const fileViewRegistry = createRegistry<FileViewDefinition<any>>({
  compare: (a, b) => (b.priority ?? 0) - (a.priority ?? 0),
});

let fallback: FileViewDefinition<any> | null = null;

// The disposer takes the view out again (used when an extension is disabled).
export const registerFileView = (view: FileViewDefinition<any>): Disposable =>
  fileViewRegistry.add(view);

// The view used when nothing else matches (the plain code editor).
export const registerFallbackFileView = (
  view: FileViewDefinition<any>,
): void => {
  fallback = view;
};

export const resolveFileView = (
  tab: EditorTabState,
): FileViewDefinition<any> => {
  const match = fileViewRegistry.list().find((view) => view.matches(tab));
  if (match) return match;
  if (!fallback) {
    throw new Error('No fallback file view registered');
  }
  return fallback;
};

export const listFileViews = (): ReadonlyArray<FileViewDefinition<any>> =>
  fileViewRegistry.list();
