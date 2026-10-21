import React from 'react';
import { Terminal } from '../terminal';
import useCli from '../../../hooks/useCli';
import type { TerminalPanelContext, TerminalPanelDefinition } from './types';

const TerminalPanelBody: React.FC<TerminalPanelContext> = ({ project }) => (
  <Terminal project={project} />
);

export const terminalPanel: TerminalPanelDefinition = {
  id: 'terminal',
  label: 'TERMINAL',
  keepMounted: true,
  useState: () => {
    // Any CLI command (dbt, rosetta, python run…) surfaces the terminal.
    const { currentCommand } = useCli();
    return { visible: true, activity: currentCommand?.startTime ?? 0 };
  },
  Component: TerminalPanelBody,
};
