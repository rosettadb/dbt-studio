import React from 'react';
import { Box } from '@mui/material';
import { UnsavedChangesDialog } from '../editor/unsavedChangesDialog';
import { useTabs } from '../../context/TabsProvider';
import { resolveFileView } from './registry';
import { EditorTabs } from './CodeFileView';
import type { Project } from '../../../types/backend';

type Props = {
  project: Project;
  // Rendered over the editor area when nothing is open.
  emptyState?: React.ReactNode;
};

// Renders whatever view the registry resolves for the active tab. This is the
// only thing a screen needs to mount to get an editor area; it knows nothing
// about which file kinds exist.
export const ActiveFileView: React.FC<Props> = ({ project, emptyState }) => {
  const {
    activeTab,
    pendingClose,
    onSaveAndClose,
    onDiscardAndClose,
    onCancelClose,
  } = useTabs();

  const View = activeTab ? resolveFileView(activeTab).Component : null;

  return (
    <Box sx={{ flex: 1, minHeight: 0, position: 'relative' }}>
      {activeTab && View ? (
        <View tab={activeTab} project={project} />
      ) : (
        // Keep the (empty) editor mounted so its OS drag-and-drop target
        // stays live; the message is a non-interactive overlay above it.
        <>
          {emptyState}
          <EditorTabs project={project} />
        </>
      )}
      {pendingClose && (
        <UnsavedChangesDialog
          open={Boolean(pendingClose)}
          fileName={pendingClose.tab.title}
          onSave={() => onSaveAndClose(pendingClose.tabId)}
          onDiscard={() => onDiscardAndClose(pendingClose.tabId)}
          onCancel={onCancelClose}
        />
      )}
    </Box>
  );
};
