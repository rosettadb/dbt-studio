import type React from 'react';
import type { Project } from '../../../types/backend';
import type { EditorTabState } from '../../../types/editor';

export interface FileViewProps {
  tab: EditorTabState;
  project: Project;
}

/**
 * One way of rendering an open tab. Views are matched against the tab in
 * registration order; the first match wins, and the code editor is the
 * fallback. A view owns everything about its kind of file — its state, its
 * hooks, its modals, what it publishes to the bottom panels — the screen
 * that mounts it knows nothing beyond `resolveFileView(tab)`.
 */
export interface FileViewDefinition {
  id: string;
  matches: (tab: EditorTabState) => boolean;
  Component: React.ComponentType<FileViewProps>;
}
