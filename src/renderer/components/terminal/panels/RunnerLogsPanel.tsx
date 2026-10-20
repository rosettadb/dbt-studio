import React from 'react';
import { RunnerLogViewer } from '../../pipelineView/RunnerLogViewer';
import { useRunner } from '../../../hooks';
import type { TerminalPanelDefinition } from './types';

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
