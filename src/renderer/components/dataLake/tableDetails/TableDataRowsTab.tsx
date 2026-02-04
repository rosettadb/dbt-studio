import React, { useState } from 'react';
import {
  Card,
  CardContent,
  Box,
  Typography,
  Button,
  Alert,
  Dialog,
  DialogTitle,
  DialogContent,
  TextField,
  DialogActions,
} from '@mui/material';
import {
  useDeleteDuckLakeRows,
  useUpdateDuckLakeRows,
  useUpsertDuckLakeRows,
} from '../../../controllers/duckLake.controller';

interface TableDataRowsTabProps {
  instanceId: string;
  tableName: string;
}

export const TableDataRowsTab: React.FC<TableDataRowsTabProps> = ({
  instanceId,
  tableName,
}) => {
  const [updateRowsDialogOpen, setUpdateRowsDialogOpen] = useState(false);
  const [updateRowsQuery, setUpdateRowsQuery] = useState('');

  const [deleteRowsDialogOpen, setDeleteRowsDialogOpen] = useState(false);
  const [deleteRowsQuery, setDeleteRowsQuery] = useState('');

  const [upsertRowsDialogOpen, setUpsertRowsDialogOpen] = useState(false);
  const [upsertRowsQuery, setUpsertRowsQuery] = useState('');

  const updateRowsMutation = useUpdateDuckLakeRows();
  const deleteRowsMutation = useDeleteDuckLakeRows();
  const upsertRowsMutation = useUpsertDuckLakeRows();

  const handleOpenUpdateRowsDialog = () => {
    setUpdateRowsQuery(
      `UPDATE ${tableName} SET /* column = value */ WHERE /* condition */;`,
    );
    setUpdateRowsDialogOpen(true);
  };

  const handleConfirmUpdateRows = () => {
    if (!instanceId || !tableName) {
      setUpdateRowsDialogOpen(false);
      return;
    }

    updateRowsMutation.mutate({
      instanceId,
      tableName,
      updateQuery: updateRowsQuery,
    });

    setUpdateRowsDialogOpen(false);
  };

  const handleOpenDeleteRowsDialog = () => {
    setDeleteRowsQuery(`DELETE FROM ${tableName} WHERE /* condition */;`);
    setDeleteRowsDialogOpen(true);
  };

  const handleConfirmDeleteRows = () => {
    if (!instanceId || !tableName) {
      setDeleteRowsDialogOpen(false);
      return;
    }

    deleteRowsMutation.mutate({
      instanceId,
      tableName,
      deleteQuery: deleteRowsQuery,
    });

    setDeleteRowsDialogOpen(false);
  };

  const handleOpenUpsertRowsDialog = () => {
    setUpsertRowsQuery(
      `INSERT INTO ${tableName} (/* cols */) VALUES (/* values */) /* upsert clause */;`,
    );
    setUpsertRowsDialogOpen(true);
  };

  const handleConfirmUpsertRows = () => {
    if (!instanceId || !tableName) {
      setUpsertRowsDialogOpen(false);
      return;
    }

    upsertRowsMutation.mutate({
      instanceId,
      tableName,
      upsertQuery: upsertRowsQuery,
    });

    setUpsertRowsDialogOpen(false);
  };

  return (
    <>
      <Card>
        <CardContent>
          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              mb: 2,
              gap: 2,
            }}
          >
            <Typography variant="h6">Data / Rows (manual SQL)</Typography>
            <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
              <Button
                variant="outlined"
                onClick={handleOpenUpdateRowsDialog}
                disabled={
                  updateRowsMutation.isLoading ||
                  deleteRowsMutation.isLoading ||
                  upsertRowsMutation.isLoading
                }
              >
                Update
              </Button>
              <Button
                variant="outlined"
                color="error"
                onClick={handleOpenDeleteRowsDialog}
                disabled={
                  deleteRowsMutation.isLoading ||
                  updateRowsMutation.isLoading ||
                  upsertRowsMutation.isLoading
                }
              >
                Delete
              </Button>
              <Button
                variant="outlined"
                onClick={handleOpenUpsertRowsDialog}
                disabled={
                  upsertRowsMutation.isLoading ||
                  updateRowsMutation.isLoading ||
                  deleteRowsMutation.isLoading
                }
              >
                Upsert
              </Button>
            </Box>
          </Box>

          <Alert severity="info">
            Row operations are executed as raw SQL. Review the query carefully
            before running.
          </Alert>

          <Dialog
            open={updateRowsDialogOpen}
            onClose={() => setUpdateRowsDialogOpen(false)}
            maxWidth="md"
            fullWidth
          >
            <DialogTitle>Update rows</DialogTitle>
            <DialogContent>
              <TextField
                fullWidth
                multiline
                minRows={8}
                label="UPDATE SQL"
                value={updateRowsQuery}
                onChange={(e) => setUpdateRowsQuery(e.target.value)}
                disabled={updateRowsMutation.isLoading}
                autoFocus
              />
            </DialogContent>
            <DialogActions>
              <Button
                color="inherit"
                onClick={() => setUpdateRowsDialogOpen(false)}
              >
                Cancel
              </Button>
              <Button
                variant="contained"
                onClick={handleConfirmUpdateRows}
                disabled={
                  updateRowsMutation.isLoading || updateRowsQuery.trim() === ''
                }
              >
                Run
              </Button>
            </DialogActions>
          </Dialog>

          <Dialog
            open={deleteRowsDialogOpen}
            onClose={() => setDeleteRowsDialogOpen(false)}
            maxWidth="md"
            fullWidth
          >
            <DialogTitle>Delete rows</DialogTitle>
            <DialogContent>
              <TextField
                fullWidth
                multiline
                minRows={8}
                label="DELETE SQL"
                value={deleteRowsQuery}
                onChange={(e) => setDeleteRowsQuery(e.target.value)}
                disabled={deleteRowsMutation.isLoading}
                autoFocus
              />
            </DialogContent>
            <DialogActions>
              <Button
                color="inherit"
                onClick={() => setDeleteRowsDialogOpen(false)}
              >
                Cancel
              </Button>
              <Button
                color="error"
                variant="contained"
                onClick={handleConfirmDeleteRows}
                disabled={
                  deleteRowsMutation.isLoading || deleteRowsQuery.trim() === ''
                }
              >
                Run
              </Button>
            </DialogActions>
          </Dialog>

          <Dialog
            open={upsertRowsDialogOpen}
            onClose={() => setUpsertRowsDialogOpen(false)}
            maxWidth="md"
            fullWidth
          >
            <DialogTitle>Upsert rows</DialogTitle>
            <DialogContent>
              <TextField
                fullWidth
                multiline
                minRows={8}
                label="UPSERT SQL"
                value={upsertRowsQuery}
                onChange={(e) => setUpsertRowsQuery(e.target.value)}
                disabled={upsertRowsMutation.isLoading}
                autoFocus
              />
            </DialogContent>
            <DialogActions>
              <Button
                color="inherit"
                onClick={() => setUpsertRowsDialogOpen(false)}
              >
                Cancel
              </Button>
              <Button
                variant="contained"
                onClick={handleConfirmUpsertRows}
                disabled={
                  upsertRowsMutation.isLoading || upsertRowsQuery.trim() === ''
                }
              >
                Run
              </Button>
            </DialogActions>
          </Dialog>
        </CardContent>
      </Card>
    </>
  );
};
