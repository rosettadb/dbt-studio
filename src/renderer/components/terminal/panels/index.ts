import { registerTerminalPanel } from './registry';
import { terminalPanel } from './TerminalPanel';
import { shellPanel } from './ShellPanel';
import { lineagePanel } from './LineagePanel';
import { processPanel } from './ProcessPanel';
import { queryResultsPanel } from './QueryResultsPanel';
import { runHistoryPanel } from './RunHistoryPanel';
import { cloudLogsPanel } from './CloudLogsPanel';
import { chartsServerPanel } from '../../dbtCharts/ChartsServerPanel';

// `order` is tab order. Adding a bottom panel = one module exporting a
// TerminalPanelDefinition + one line here. 800 is left for the runner logs
// panel, which the pipeline tool registers itself.
registerTerminalPanel({ ...terminalPanel, order: 100 });
registerTerminalPanel({ ...shellPanel, order: 200 });
registerTerminalPanel({ ...lineagePanel, order: 300 });
registerTerminalPanel({ ...processPanel, order: 400 });
registerTerminalPanel({ ...queryResultsPanel, order: 500 });
registerTerminalPanel({ ...runHistoryPanel, order: 600 });
registerTerminalPanel({ ...cloudLogsPanel, order: 700 });
registerTerminalPanel({ ...chartsServerPanel, order: 900 });

export {
  terminalPanelRegistry,
  registerTerminalPanel,
  listTerminalPanels,
  DEFAULT_TERMINAL_PANEL_ID,
} from './registry';
export type {
  TerminalPanelDefinition,
  TerminalPanelContext,
  TerminalPanelState,
} from './types';
