import React from 'react';
import { toast } from 'react-toastify';
import { useQueryClient } from 'react-query';
import { Box, Tooltip, IconButton } from '@mui/material';
import { Save as SaveIcon, SaveAs as SaveAsIcon } from '@mui/icons-material';
import { QueryHistoryType } from '../../../types/frontend';
import type { SqlTabSource } from '../../../types/editor';
import { QueryHistory } from './queryHistory';
import { SaveQueryDialog } from './SaveQueryDialog';
import {
  useCreateSavedQuery,
  useGetSavedQueries,
  useUpdateSavedQuery,
} from '../../controllers/savedQueries.controller';
import { useConnectionProject } from '../projectFolders/ProjectFolderTree';
import { saveQueryToProject } from './projectQueries';
import { projectsServices } from '../../services';
import { QUERY_KEYS } from '../../config/constants';
import { path as nodePath } from '../../lib/path';
import type { SaveLocation } from '../../../shared/projectFolders';

type Props = {
  connectionId?: string;
  query: string;
  queryHistory: QueryHistoryType[];
  onQuerySelect: (query: string) => void;
  /** The saved query selected in the sidebar whose text the tab shows. */
  source?: SqlTabSource;
  /** A new saved query was made from the tab: link the tab to it. */
  onSavedAs: (source: SqlTabSource) => void;
};

/**
 * Save and query history for the connection's tab (plan 95d). One tab per
 * connection:
 *
 * - Its text came from a saved query selected in the sidebar: Save (Ctrl+S)
 *   updates that query, the .sql file or the Local query. Save As
 *   (Ctrl+Shift+S) makes a new one instead.
 * - Its text is the user's own: Save asks for a name and a place (the
 *   project's queries/ folder or Local), and the tab is then linked to it.
 */
export const SqlEditorActions: React.FC<Props> = ({
  connectionId,
  query,
  queryHistory,
  onQuerySelect,
  source,
  onSavedAs,
}) => {
  const [saveAsOpen, setSaveAsOpen] = React.useState(false);
  const createQueryMutation = useCreateSavedQuery();
  const updateQueryMutation = useUpdateSavedQuery();
  const { data: localQueries = [] } = useGetSavedQueries(connectionId);
  const queryClient = useQueryClient();
  // Queries can go into the queries/ folder of the connection's project
  const project = useConnectionProject(connectionId);

  const handleSave = React.useCallback(async () => {
    if (!connectionId) return;
    if (!source) {
      setSaveAsOpen(true);
      return;
    }
    try {
      if (source.kind === 'project') {
        await projectsServices.saveFileContent({
          path: source.filePath,
          content: query,
        });
      } else {
        await updateQueryMutation.mutateAsync({
          connectionId,
          queryId: source.queryId,
          updates: { query },
        });
      }
      toast.success(`Saved ${source.name}`);
    } catch (e) {
      toast.error(
        `Failed to save ${source.name}: ${e instanceof Error ? e.message : 'unknown error'}`,
      );
    }
  }, [connectionId, source, query, updateQueryMutation]);

  // Ctrl+S saves, Ctrl+Shift+S saves as (Cmd on macOS)
  React.useEffect(() => {
    if (!connectionId) return undefined;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey) || e.key.toLowerCase() !== 's') return;
      e.preventDefault();
      if (e.shiftKey) setSaveAsOpen(true);
      else handleSave();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [connectionId, handleSave]);

  const handleSaveAs = async (name: string, location: SaveLocation) => {
    if (!connectionId || !query.trim()) {
      toast.error('No connection or query content');
      return;
    }
    if (location === 'project' && project) {
      try {
        const filePath = await saveQueryToProject(project.path, name, query);
        await queryClient.invalidateQueries([QUERY_KEYS.GET_FILE_STRUCTURE]);
        onSavedAs({
          kind: 'project',
          filePath,
          name: nodePath.basename(filePath),
        });
        toast.success(
          `Query saved to ${project.name}/${nodePath.relative(project.path, filePath)}`,
        );
      } catch (e) {
        toast.error(
          `Failed to save query: ${e instanceof Error ? e.message : 'unknown error'}`,
        );
      }
      return;
    }
    try {
      const created = await createQueryMutation.mutateAsync({
        connectionId,
        name,
        query,
      });
      onSavedAs({ kind: 'local', queryId: created.id, name: created.name });
      toast.success(`Query "${created.name}" saved`);
    } catch (e) {
      toast.error('Failed to save query');
    }
  };

  if (!connectionId) {
    return null;
  }

  const saveAsName = source
    ? `${source.name.replace(/\.sql$/i, '')} copy`
    : `Query #${localQueries.length + 1}`;

  return (
    <Box sx={{ display: 'flex', alignItems: 'center', flex: '0 0 auto' }}>
      <Tooltip
        title={
          source ? `Save to ${source.name} (Ctrl+S)` : 'Save Query (Ctrl+S)'
        }
      >
        <span>
          <IconButton
            size="small"
            onClick={handleSave}
            disabled={!query.trim()}
            data-testid="sql-save-btn"
          >
            <SaveIcon fontSize="small" />
          </IconButton>
        </span>
      </Tooltip>
      {source && (
        <Tooltip title="Save As New Query… (Ctrl+Shift+S)">
          <span>
            <IconButton
              size="small"
              onClick={() => setSaveAsOpen(true)}
              disabled={!query.trim()}
              data-testid="sql-save-as-btn"
            >
              <SaveAsIcon fontSize="small" />
            </IconButton>
          </span>
        </Tooltip>
      )}
      {queryHistory.length > 0 && (
        <QueryHistory
          size="small"
          onQuerySelect={(qh) => onQuerySelect(qh.query)}
          queryHistory={queryHistory}
          connectionId={connectionId}
        />
      )}
      <SaveQueryDialog
        open={saveAsOpen}
        title={source ? 'Save As New Query' : 'Save Query'}
        initialName={saveAsName}
        onClose={() => setSaveAsOpen(false)}
        onSave={handleSaveAs}
        projectName={project?.name}
      />
    </Box>
  );
};
