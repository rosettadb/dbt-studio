import React from 'react';
import { toast } from 'react-toastify';
import { Box, Tooltip, IconButton } from '@mui/material';
import { Save as SaveIcon } from '@mui/icons-material';
import { QueryHistoryType } from '../../../types/frontend';
import { QueryHistory } from './queryHistory';
import { SaveQueryDialog } from './SaveQueryDialog';
import { useCreateSavedQuery } from '../../controllers/savedQueries.controller';

type Props = {
  connectionId?: string;
  query: string;
  queryHistory: QueryHistoryType[];
  onQuerySelect: (query: string) => void;
};

export const SqlEditorActions: React.FC<Props> = ({
  connectionId,
  query,
  queryHistory,
  onQuerySelect,
}) => {
  const [saveDialogOpen, setSaveDialogOpen] = React.useState(false);
  const createQueryMutation = useCreateSavedQuery();

  const handleSaveQuery = async (name: string) => {
    if (!connectionId || !query.trim()) {
      toast.error('No connection or query content');
      return;
    }
    try {
      await createQueryMutation.mutateAsync({
        connectionId,
        name,
        query,
      });
      toast.success('Query saved successfully');
    } catch (e) {
      toast.error('Failed to save query');
    }
  };

  if (!connectionId) {
    return null;
  }

  return (
    <Box sx={{ display: 'flex', alignItems: 'center', flex: '0 0 auto' }}>
      <Tooltip title="Save Query">
        <span>
          <IconButton
            size="small"
            onClick={() => setSaveDialogOpen(true)}
            disabled={!query.trim()}
          >
            <SaveIcon fontSize="small" />
          </IconButton>
        </span>
      </Tooltip>
      {queryHistory.length > 0 && (
        <QueryHistory
          size="small"
          onQuerySelect={(qh) => onQuerySelect(qh.query)}
          queryHistory={queryHistory}
          connectionId={connectionId}
        />
      )}
      <SaveQueryDialog
        open={saveDialogOpen}
        onClose={() => setSaveDialogOpen(false)}
        onSave={handleSaveQuery}
      />
    </Box>
  );
};
