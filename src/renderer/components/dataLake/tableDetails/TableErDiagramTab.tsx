import React, { useMemo } from 'react';
import { Alert, Box, CircularProgress, Typography } from '@mui/material';
import { useDuckLakeSchema } from '../../../controllers/duckLake.controller';
import {
  ErDiagram,
  buildErGraph,
  duckLakeErTables,
  erTableId,
  relatedTablesGraph,
} from '../../erDiagram';

interface TableErDiagramTabProps {
  instanceId: string;
  schemaName: string;
  tableName: string;
}

/**
 * This table and the tables linked to it. The schema is loaded when the tab
 * is opened: the page only renders the tab that is shown.
 */
export const TableErDiagramTab: React.FC<TableErDiagramTabProps> = ({
  instanceId,
  schemaName,
  tableName,
}) => {
  const schemaQuery = useDuckLakeSchema(instanceId);
  const focusTableId = erTableId(schemaName, tableName);

  const graph = useMemo(() => {
    const schemaTables = duckLakeErTables(schemaQuery.data).filter(
      (t) => t.schema === schemaName,
    );
    return relatedTablesGraph(buildErGraph(schemaTables), focusTableId);
  }, [schemaQuery.data, schemaName, focusTableId]);

  if (schemaQuery.isLoading) {
    return (
      <Box sx={{ p: 4, display: 'flex', justifyContent: 'center' }}>
        <CircularProgress />
      </Box>
    );
  }

  if (schemaQuery.isError) {
    return (
      <Alert severity="error">
        {(schemaQuery.error as Error | undefined)?.message ||
          'Failed to load the schema'}
      </Alert>
    );
  }

  const relatedCount = graph.tables.length - 1;
  const howLinksAreFound =
    "DuckLake doesn't store relationships, so links are matched by column name (customer_id → customers.id).";

  return (
    <Box>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
        {relatedCount > 0
          ? `${tableName} and the ${relatedCount} ${
              relatedCount === 1 ? 'table' : 'tables'
            } linked to it. ${howLinksAreFound}`
          : `No related tables found. ${howLinksAreFound}`}
      </Typography>
      <Box
        sx={{
          height: 'calc(100vh - 320px)',
          minHeight: 400,
          border: 1,
          borderColor: 'divider',
          borderRadius: 1,
          overflow: 'hidden',
        }}
        data-testid="table-er-diagram"
      >
        <ErDiagram graph={graph} focusTableId={focusTableId} />
      </Box>
    </Box>
  );
};
