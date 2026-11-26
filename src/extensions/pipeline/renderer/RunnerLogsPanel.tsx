import React from 'react';
import { RunnerLogViewer } from './RunnerLogViewer';
import useRunner from './useRunnerContext';
import type { TerminalPanelDefinition } from '../../../extensionApi/renderer';

export const runnerLogsPanel: TerminalPanelDefinition = {
  id: 'runnerLogs',
  label: 'RUNNER LOGS',
  useState: () => {
    const { isRunning, logs, startTime } = useRunner();
    return {
      visible: isRunning || logs.length > 0,
      activity: startTime ?? 0,
    };
  },
  Component: () => <RunnerLogViewer />,
};
