import React from 'react';
import { DbtRunHistoryPanel } from '../../dbtRunHistory';
import { useAppContext } from '../../../hooks';
import type { TerminalPanelContext, TerminalPanelDefinition } from './types';
import { projectTypeOf } from '../../../../projectTypes/registry.shared';

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
  // dbt run history; projects without dbt have none
  useState: ({ project }) => ({
    visible: projectTypeOf(project).capabilities.runHistory,
  }),
  Component: RunHistoryPanel,
};
