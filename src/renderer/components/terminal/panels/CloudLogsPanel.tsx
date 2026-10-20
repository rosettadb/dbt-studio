import React from 'react';
import { CloudLogViewer } from '../../pipelineView/CloudLogViewer';
import { useActiveCloudRun } from '../../../context/CloudRunProvider';
import type { TerminalPanelDefinition } from './types';

// Follows the workspace's active cloud run: the one just started from any
// Run button, or the one belonging to the pipeline currently on screen.
const CloudLogsPanel: React.FC = () => {
  const { run } = useActiveCloudRun();
  return <CloudLogViewer actionId={run?.actionId ?? null} />;
};

export const cloudLogsPanel: TerminalPanelDefinition = {
  id: 'cloudLogs',
  label: 'CLOUD LOGS',
  useState: () => {
    const { run, startedSeq } = useActiveCloudRun();
    return { visible: !!run, activity: startedSeq };
  },
  Component: CloudLogsPanel,
};
