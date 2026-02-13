import React, { useState } from 'react';
import {
  Box,
  Button,
  CircularProgress,
  Alert,
  Typography,
} from '@mui/material';
import { Add, Refresh } from '@mui/icons-material';
import { DataLakeTables } from './DataLakeTables';
import { DataLakeTableImportWizard } from './DataLakeTableImportWizard';
import {
  useDuckLakeTables,
  useImportDuckLakeTable,
  useInvalidateDuckLakeCache,
  useDuckLakeInstance,
  useSetDuckLakeTablePartitionedBy,
} from '../../controllers/duckLake.controller';

interface DataLakeTablesViewProps {
  instanceId: string;
}

export const DataLakeTablesView: React.FC<DataLakeTablesViewProps> = ({
  instanceId,
}) => {
  const [importWizardOpen, setImportWizardOpen] = useState(false);

  // React Query hooks
  const tablesQuery = useDuckLakeTables(instanceId);
  const importTableMutation = useImportDuckLakeTable();
  const setPartitionedByMutation = useSetDuckLakeTablePartitionedBy();
  const { invalidateTables } = useInvalidateDuckLakeCache();
  const instanceQuery = useDuckLakeInstance(instanceId);

  const handleImportTable = (
    tableName: string,
    sourceQuery: string,
    partitionColumns?: string[],
  ) => {
    importTableMutation.mutate(
      { instanceId, tableName, sourceQuery },
      {
        onSuccess: () => {
          if (partitionColumns && partitionColumns.length > 0) {
            setPartitionedByMutation.mutate(
              {
                instanceId,
                tableName,
                columnNames: partitionColumns,
              },
              {
                onSuccess: () => {
                  setImportWizardOpen(false);
                  invalidateTables(instanceId);
                },
                onError: () => {
                  setImportWizardOpen(false);
                  invalidateTables(instanceId);
                },
              },
            );
            return;
          }

          setImportWizardOpen(false);
          invalidateTables(instanceId);
        },
      },
    );
  };

  const handleRefresh = () => {
    invalidateTables(instanceId);
  };

  if (tablesQuery.isLoading) {
    return (
      <Box
        sx={{
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          minHeight: '400px',
        }}
      >
        <CircularProgress />
      </Box>
    );
  }

  if (tablesQuery.error) {
    const errorMessage =
      (tablesQuery.error as Error).message || 'Unknown error';

    return (
      <Box sx={{ p: 2 }}>
        <Alert severity="error" sx={{ mb: 2 }}>
          <Typography variant="body1" sx={{ fontWeight: 'bold', mb: 1 }}>
            Failed to load tables
          </Typography>
          <Typography variant="body2" sx={{ mb: 2 }}>
            {errorMessage}
          </Typography>
        </Alert>
        <Button
          variant="contained"
          onClick={handleRefresh}
          startIcon={<Refresh />}
        >
          Retry
        </Button>
      </Box>
    );
  }

  // Convert tables to format expected by DataLakeTables component
  const formattedTables = (tablesQuery.data || []).map((table) => ({
    id: `${instanceId}-${table.name}`,
    name: table.name,
    instanceId,
    instanceName: instanceId, // Would need to fetch instance name
    schema: table.schema,
    rowCount: table.rowCount,
    sizeBytes: table.sizeBytes,
    lastAccessed: table.updatedAt?.toISOString(),
    createdAt: table.createdAt?.toISOString() || new Date().toISOString(),
  }));

  return (
    <Box>
      <Box sx={{ p: 2, pb: 0, display: 'flex', justifyContent: 'flex-end' }}>
        <Button
          variant="contained"
          startIcon={<Add />}
          onClick={() => setImportWizardOpen(true)}
        >
          Import Data
        </Button>
      </Box>

      <DataLakeTables
        tables={formattedTables}
        selectedInstanceId={instanceId}
      />

      <DataLakeTableImportWizard
        open={importWizardOpen}
        onClose={() => setImportWizardOpen(false)}
        onImport={handleImportTable}
        isLoading={
          importTableMutation.isLoading || setPartitionedByMutation.isLoading
        }
        dataPath={instanceQuery.data?.dataPath}
      />
    </Box>
  );
};
