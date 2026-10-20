import React from 'react';
import { LineageModal, LineageView } from '../../lineage';
import { useCurrentModelId } from '../../../controllers';
import { useTabs } from '../../../context/TabsProvider';
import type { TerminalPanelContext, TerminalPanelDefinition } from './types';

const isSqlModel = (filePath?: string) =>
  !!filePath && filePath.toLowerCase().split('.').pop() === 'sql';

const LineagePanel: React.FC<TerminalPanelContext> = ({ project }) => {
  const { activeFilePath } = useTabs();
  const [expanded, setExpanded] = React.useState(false);
  return (
    <>
      <LineageView
        projectId={project.id}
        filePath={activeFilePath}
        onExpandClick={() => setExpanded(true)}
      />
      <LineageModal
        isOpen={expanded}
        onClose={() => setExpanded(false)}
        projectId={project.id}
        filePath={activeFilePath}
      />
    </>
  );
};

export const lineagePanel: TerminalPanelDefinition = {
  id: 'lineage',
  label: 'LINEAGE',
  useState: ({ project }) => {
    const { activeFilePath } = useTabs();
    const executable = isSqlModel(activeFilePath);
    const { data, isLoading, isError } = useCurrentModelId(
      { projectId: project.id, filePath: activeFilePath },
      { enabled: !!project.id && !!activeFilePath && executable },
    );
    // Stay visible while the model lookup is in flight so the tab doesn't
    // flicker away and back on every file switch.
    return {
      visible: executable && (Boolean(data?.modelId) || isLoading || isError),
    };
  },
  Component: LineagePanel,
};
