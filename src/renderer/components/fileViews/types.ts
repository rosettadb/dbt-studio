import type React from 'react';
import type { Project } from '../../../types/backend';
import type { EditorTabState } from '../../../types/editor';

export interface FileViewProps {
  tab: EditorTabState;
  project: Project;
}

/**
 * One way of rendering an open tab. The view with the highest `priority`
 * whose `matches` accepts the tab wins; views with the same priority are
 * tried in the order they were registered, and the code editor is the
 * fallback. A view owns everything about its kind of file — its state, its
 * hooks, its modals, what it publishes to the bottom panels — the screen
 * that mounts it knows nothing beyond `resolveFileView(tab)`.
 *
 * `props` are passed to `Component` on top of `tab` and `project`, so one
 * component can be registered with different settings (for example a
 * compact variant).
 */
export interface FileViewDefinition<P extends object = {}> {
  id: string;
  /** Higher wins. Defaults to 0. */
  priority?: number;
  matches: (tab: EditorTabState) => boolean;
  Component: React.ComponentType<FileViewProps & P>;
  props?: P;
}
