import type React from 'react';
import type { Project } from '../../../../types/backend';

export interface TerminalPanelContext {
  project: Project;
}

export interface TerminalPanelState {
  // Whether the tab button is shown at all.
  visible: boolean;
  // A monotonically increasing number that changes when something happened
  // in this panel worth surfacing (a run started, a query executed). The
  // terminal focuses the panel whenever it increases. Omit (undefined) for
  // panels that never request focus.
  activity?: number;
}

/**
 * One bottom-panel tab. A panel owns its own data: `useState` subscribes to
 * whatever store feeds it (runner, process, cloud runs, query results…) and
 * reports visibility + activity; `Component` renders the body; `Label`
 * optionally replaces the plain text tab button. Nothing is passed in from
 * the screen — the only input is the project.
 */
export interface TerminalPanelDefinition {
  id: string;
  label: string;
  useState: (ctx: TerminalPanelContext) => TerminalPanelState;
  Component: React.ComponentType<TerminalPanelContext>;
  Label?: React.ComponentType<
    TerminalPanelContext & { selected: boolean; onSelect: () => void }
  >;
  // Keep the body mounted while hidden (xterm-like panels lose scrollback
  // and input state otherwise). Default: unmount when not selected.
  keepMounted?: boolean;
}
