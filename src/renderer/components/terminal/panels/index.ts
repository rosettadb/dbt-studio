import { registerTerminalPanel } from './registry';
import { terminalPanel } from './TerminalPanel';
import { lineagePanel } from './LineagePanel';
import { processPanel } from './ProcessPanel';
import { queryResultsPanel } from './QueryResultsPanel';
import { runHistoryPanel } from './RunHistoryPanel';
import { cloudLogsPanel } from './CloudLogsPanel';
import { runnerLogsPanel } from './RunnerLogsPanel';

// Registration order is tab order. Adding a bottom panel = one module
// exporting a TerminalPanelDefinition + one line here.
registerTerminalPanel(terminalPanel);
registerTerminalPanel(lineagePanel);
registerTerminalPanel(processPanel);
registerTerminalPanel(queryResultsPanel);
registerTerminalPanel(runHistoryPanel);
registerTerminalPanel(cloudLogsPanel);
registerTerminalPanel(runnerLogsPanel);

export {
  registerTerminalPanel,
  listTerminalPanels,
  DEFAULT_TERMINAL_PANEL_ID,
} from './registry';
export type {
  TerminalPanelDefinition,
  TerminalPanelContext,
  TerminalPanelState,
} from './types';
