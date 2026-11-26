import React from 'react';
import { InsertChart } from '@mui/icons-material';
import type {
  WorkspaceTab,
  WorkspaceTabProps,
} from '../../../extensionApi/renderer';
import { AnalyticsPagesTreeView } from './AnalyticsPagesTreeView';
import { AnalyticsEditor } from './AnalyticsEditor';
import { AnalyticsPagesGallery } from './bi/gallery/AnalyticsPagesGallery';

// The tab's state is the id of the open Analytics page (null: the gallery).
type OpenPageId = string;

const AnalyticsSidebar: React.FC<WorkspaceTabProps<OpenPageId>> = ({
  connectionId,
  connectionName,
  state: activePageId,
  setState: setActivePageId,
}) => (
  <AnalyticsPagesTreeView
    connectionId={connectionId || ''}
    connectionName={connectionName}
    activePageId={activePageId}
    onOpenPage={setActivePageId}
    onDeletePage={(id) => {
      if (id === activePageId) setActivePageId(null);
    }}
  />
);

const AnalyticsMain: React.FC<WorkspaceTabProps<OpenPageId>> = ({
  connectionId,
  state: activePageId,
  setState: setActivePageId,
  onSchemaChange,
}) =>
  activePageId ? (
    <AnalyticsEditor
      connectionId={connectionId ?? ''}
      pageId={activePageId}
      onSchemaChange={onSchemaChange}
    />
  ) : (
    <AnalyticsPagesGallery
      connectionId={connectionId ?? ''}
      onOpenPage={setActivePageId}
    />
  );

/**
 * Analytics as a tab of a connection screen: the pages of the connection in
 * the side panel, the open page (or the gallery) in the main area.
 */
export const analyticsWorkspaceTab: WorkspaceTab<OpenPageId> = {
  id: 'analytics',
  order: 100,
  label: 'Analytics',
  icon: InsertChart,
  Sidebar: AnalyticsSidebar,
  Main: AnalyticsMain,
  assistant: (activePageId) => ({
    screenKey: 'analytics',
    pageId: activePageId ?? undefined,
  }),
};
