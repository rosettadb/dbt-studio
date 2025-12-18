import React, { useState } from 'react';
import {
  Box,
  Button,
  CircularProgress,
  Alert,
  Typography,
} from '@mui/material';
import { Add } from '@mui/icons-material';
import { DataLakeTables } from './DataLakeTables';
import { DataLakeTableImportWizard } from './DataLakeTableImportWizard';
import {
  useDuckLakeTables,
  useImportDuckLakeTable,
  useInvalidateDuckLakeCache,
  useDuckLakeInstance,
} from '../../controllers/duckLake.controller';

interface DataLakeTablesViewProps {
  instanceId: string;
  onPreview?: (tableName: string) => void;
  onQuery?: (tableName: string) => void;
}

export const DataLakeTablesView: React.FC<DataLakeTablesViewProps> = ({
  instanceId,
  onPreview,
  onQuery,
}) => {
  const [importWizardOpen, setImportWizardOpen] = useState(false);

  // React Query hooks
  const tablesQuery = useDuckLakeTables(instanceId);
  const importTableMutation = useImportDuckLakeTable();
  const { invalidateTables } = useInvalidateDuckLakeCache();
  const instanceQuery = useDuckLakeInstance(instanceId);

  const handleImportTable = (tableName: string, sourceQuery: string) => {
    importTableMutation.mutate(
      { instanceId, tableName, sourceQuery },
      {
        onSuccess: () => {
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
    const isConnectionError =
      errorMessage.includes('SSL') ||
      errorMessage.includes('connection') ||
      errorMessage.includes('catalog') ||
      errorMessage.includes('closed');

    return (
      <Box sx={{ p: 2 }}>
        <Alert severity="error" sx={{ mb: 2 }}>
          <Typography variant="body1" sx={{ fontWeight: 'bold', mb: 1 }}>
            Failed to load tables
          </Typography>
          <Typography variant="body2" sx={{ mb: 2 }}>
            {errorMessage}
          </Typography>
          {isConnectionError && (
            <Box sx={{ mt: 2 }}>
              <Typography variant="body2" sx={{ fontWeight: 'bold', mb: 1 }}>
                Troubleshooting steps:
              </Typography>
              <Typography variant="body2" component="ul" sx={{ pl: 2, m: 0 }}>
                <li>Check that the instance is attached</li>
                <li>Verify your catalog database is accessible</li>
                <li>Check SSL/TLS settings if using PostgreSQL</li>
                <li>Ensure network connectivity to the catalog database</li>
                <li>Try detaching and re-attaching the instance</li>
              </Typography>
            </Box>
          )}
        </Alert>
        <Button variant="contained" onClick={handleRefresh}>
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
        onPreview={onPreview}
        onQuery={onQuery}
      />

      <DataLakeTableImportWizard
        open={importWizardOpen}
        onClose={() => setImportWizardOpen(false)}
        onImport={handleImportTable}
        isLoading={importTableMutation.isLoading}
        dataPath={instanceQuery.data?.dataPath}
      />
    </Box>
  );
};
