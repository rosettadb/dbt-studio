import type { EditorTabState } from '../../../types/editor';
import type { FileViewDefinition } from './types';

const views: FileViewDefinition[] = [];
let fallback: FileViewDefinition | null = null;

export const registerFileView = (view: FileViewDefinition): void => {
  const existing = views.findIndex((v) => v.id === view.id);
  if (existing >= 0) {
    views[existing] = view;
    return;
  }
  views.push(view);
};

// The view used when nothing else matches (the plain code editor).
export const registerFallbackFileView = (view: FileViewDefinition): void => {
  fallback = view;
};

export const resolveFileView = (tab: EditorTabState): FileViewDefinition => {
  const match = views.find((view) => view.matches(tab));
  if (match) return match;
  if (!fallback) {
    throw new Error('No fallback file view registered');
  }
  return fallback;
};

export const listFileViews = (): ReadonlyArray<FileViewDefinition> => views;
