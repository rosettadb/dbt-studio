import {
  byOrder,
  createRegistry,
} from '../../../../extensionHost/renderer/registry.renderer';
import type { Disposable } from '../../../../extensionHost/shared/protocol.shared';
import type { TerminalPanelDefinition } from './types';

// Tab order: by `order`, then registration order.
export const terminalPanelRegistry = createRegistry<TerminalPanelDefinition>({
  compare: byOrder,
});

// The disposer takes the panel out again (used when an extension is disabled).
export const registerTerminalPanel = (
  panel: TerminalPanelDefinition,
): Disposable => terminalPanelRegistry.add(panel);

export const listTerminalPanels = (): ReadonlyArray<TerminalPanelDefinition> =>
  terminalPanelRegistry.list();

export const DEFAULT_TERMINAL_PANEL_ID = 'terminal';
