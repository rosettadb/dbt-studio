import React from 'react';
import type { ChartsServerStatus } from '../../../shared/dbtCharts';
import {
  clearChartsServerLog,
  getChartsServerLog,
  getChartsServerStatus,
  subscribeToChartsServerLog,
  subscribeToChartsServerStatus,
} from '../../services/dbtCharts.service';

// The dbt Charts server as the CHARTS SERVER terminal tab sees it: status,
// session log and focus requests from the board pane. One store for the
// whole renderer, fed by main's dbt-charts:serverStatus / serverLog events.

export interface ChartsServerPanelState {
  projectPath: string | null;
  status: ChartsServerStatus | null;
  lines: string[];
  // Bumped by the board's "Server log" button; the terminal focuses the tab
  // whenever it grows.
  focusRequest: number;
  // "Server log" asked for the tab: show it even with an empty log.
  // Cleared by closing the tab.
  revealed: boolean;
  // The tab was closed with × (only offered while no server runs). The log
  // is kept; the next start or "Server log" shows the tab again.
  closed: boolean;
}

const MAX_LINES = 1_000;

let state: ChartsServerPanelState = {
  projectPath: null,
  status: null,
  lines: [],
  focusRequest: 0,
  revealed: false,
  closed: false,
};
const listeners = new Set<() => void>();

const setState = (patch: Partial<ChartsServerPanelState>) => {
  state = { ...state, ...patch };
  listeners.forEach((listener) => listener());
};

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

// Counts the status events of the loaded project, so a status snapshot
// that was requested before the newest event doesn't replace it.
let statusEvents = 0;

let listening = false;
const listen = () => {
  if (listening) return;
  listening = true;
  subscribeToChartsServerStatus((status) => {
    if (status.projectPath && status.projectPath === state.projectPath) {
      statusEvents += 1;
      if (status.state === 'starting' || status.state === 'parsing') {
        // A (re)start shows a closed tab again.
        setState({ status, closed: false });
      } else {
        setState({ status });
      }
    }
  });
  subscribeToChartsServerLog((event) => {
    if (event.projectPath !== state.projectPath) return;
    const base = event.reset ? [] : state.lines;
    setState({ lines: [...base, ...event.lines].slice(-MAX_LINES) });
  });
};

// The snapshot reads for the loaded project. Each one is applied on its
// own; one that failed is tried again on the next mount.
type SnapshotRead = 'idle' | 'loading' | 'done';
let loaded: {
  projectPath: string | null;
  status: SnapshotRead;
  log: SnapshotRead;
} = { projectPath: null, status: 'idle', log: 'idle' };

const loadStatus = (projectPath: string) => {
  loaded.status = 'loading';
  const eventsBefore = statusEvents;
  getChartsServerStatus(projectPath)
    .then((status) => {
      if (loaded.projectPath !== projectPath) return undefined;
      loaded.status = 'done';
      // The reply and the status events don't arrive in a fixed order: a
      // newer event wins over this snapshot.
      if (statusEvents === eventsBefore) setState({ status });
      return undefined;
    })
    .catch(() => {
      if (loaded.projectPath === projectPath) loaded.status = 'idle';
    });
};

const loadLog = (projectPath: string) => {
  loaded.log = 'loading';
  getChartsServerLog(projectPath)
    .then((lines) => {
      if (loaded.projectPath !== projectPath) return undefined;
      loaded.log = 'done';
      setState({ lines: lines.slice(-MAX_LINES) });
      return undefined;
    })
    .catch(() => {
      if (loaded.projectPath === projectPath) loaded.log = 'idle';
    });
};

const load = (projectPath: string) => {
  if (loaded.projectPath !== projectPath) {
    loaded = { projectPath, status: 'idle', log: 'idle' };
    setState({
      projectPath,
      status: null,
      lines: [],
      revealed: false,
      closed: false,
    });
  }
  if (loaded.status === 'idle') loadStatus(projectPath);
  if (loaded.log === 'idle') loadLog(projectPath);
};

const EMPTY: Omit<ChartsServerPanelState, 'focusRequest'> = {
  projectPath: null,
  status: null,
  lines: [],
  revealed: false,
  closed: false,
};

/** The server status and log for one project (empty for other projects). */
export const useChartsServerPanel = (
  projectPath: string,
): ChartsServerPanelState => {
  React.useEffect(() => {
    listen();
    load(projectPath);
  }, [projectPath]);
  const snapshot = React.useSyncExternalStore(subscribe, () => state);
  return snapshot.projectPath === projectPath
    ? snapshot
    : { ...EMPTY, focusRequest: snapshot.focusRequest };
};

/** Shows the CHARTS SERVER terminal tab and brings it to the front. */
export const requestChartsServerPanelFocus = () => {
  setState({
    focusRequest: state.focusRequest + 1,
    revealed: true,
    closed: false,
  });
};

/** × on the tab (no server running): hides it and keeps the log. */
export const closeChartsServerPanel = () => {
  setState({ closed: true, revealed: false });
};

/** Clears the log here and in main (the output's Clear menu item). */
export const clearChartsServerPanelLog = () => {
  setState({ lines: [] });
  clearChartsServerLog().catch(() => undefined);
};
