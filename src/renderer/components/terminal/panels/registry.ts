import type { TerminalPanelDefinition } from './types';

const panels: TerminalPanelDefinition[] = [];

export const registerTerminalPanel = (panel: TerminalPanelDefinition): void => {
  const existing = panels.findIndex((p) => p.id === panel.id);
  if (existing >= 0) {
    panels[existing] = panel;
    return;
  }
  panels.push(panel);
};

// Registration order is tab order.
export const listTerminalPanels = (): ReadonlyArray<TerminalPanelDefinition> =>
  panels;

export const DEFAULT_TERMINAL_PANEL_ID = 'terminal';
