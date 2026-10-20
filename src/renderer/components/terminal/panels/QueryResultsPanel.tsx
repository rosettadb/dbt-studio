import React from 'react';
import { toast } from 'react-toastify';
import { ProjectQueryResultsPanel } from '../../projectQueryResults';
import { useQueryResults } from '../../../context/QueryResultsProvider';
import { useTabs } from '../../../context/TabsProvider';
import type { TerminalPanelContext, TerminalPanelDefinition } from './types';

const QueryResultsPanel: React.FC<TerminalPanelContext> = ({ project }) => {
  const results = useQueryResults();
  const { activeTabId, updateTabContent } = useTabs();
  const { state, execute } = results;

  return (
    <ProjectQueryResultsPanel
      state={state}
      onTabChange={results.setActiveTab}
      onLimitChange={results.setLimit}
      onClear={results.clear}
      onAddBookmark={results.addBookmark}
      onDeleteBookmark={results.deleteBookmark}
      onRunHistoryItem={async (item) => {
        await execute({
          project,
          filePath: item.filePath,
          modelName: item.modelName,
          rawSql: item.rawSql,
          querySql: item.compiledSql ?? item.rawSql,
          compileModel: false,
          limit: state.limit,
        });
      }}
      onRun={
        state.rawSql
          ? async () => {
              await execute({
                project,
                filePath: state.filePath,
                modelName: state.modelName,
                rawSql: state.rawSql!,
                querySql: state.compiledSql ?? state.rawSql!,
                compileModel: false,
                limit: state.limit,
              });
            }
          : undefined
      }
      onOpenSqlInEditor={(sql) => {
        if (!activeTabId) {
          toast.error('No active editor tab');
          return;
        }
        updateTabContent(activeTabId, sql);
      }}
    />
  );
};

export const queryResultsPanel: TerminalPanelDefinition = {
  id: 'queryResults',
  label: 'QUERY RESULTS',
  useState: () => {
    const { state, revision } = useQueryResults();
    const { activeFilePath } = useTabs();
    return {
      visible:
        !!activeFilePath?.endsWith('.sql') ||
        state.history.length > 0 ||
        Boolean(state.result) ||
        state.isRunning,
      activity: revision,
    };
  },
  Component: QueryResultsPanel,
};
