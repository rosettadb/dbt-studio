import React from 'react';
import { DbtRunHistoryPanel } from '../../dbtRunHistory';
import { useAppContext } from '../../../hooks';
import type { TerminalPanelContext, TerminalPanelDefinition } from './types';

const RunHistoryPanel: React.FC<TerminalPanelContext> = ({ project }) => {
  const { openChatWithMessage } = useAppContext();
  return (
    <DbtRunHistoryPanel
      projectId={project.id}
      onFixWithAI={openChatWithMessage}
    />
  );
};

export const runHistoryPanel: TerminalPanelDefinition = {
  id: 'runHistory',
  label: 'RUN HISTORY',
  useState: () => ({ visible: true }),
  Component: RunHistoryPanel,
};
