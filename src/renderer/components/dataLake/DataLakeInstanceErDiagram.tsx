import React, { useMemo } from 'react';
import { Box } from '@mui/material';
import { useDuckLakeSchema } from '../../controllers/duckLake.controller';
import { ErDiagramPanel, duckLakeErTables } from '../erDiagram';

/**
 * The instance's ER Diagram tab: every schema, one at a time. The schema is
 * loaded when the tab is opened, since the page only renders the shown tab.
 */
export const DataLakeInstanceErDiagram: React.FC<{ instanceId: string }> = ({
  instanceId,
}) => {
  const schemaQuery = useDuckLakeSchema(instanceId);
  const tables = useMemo(
    () => duckLakeErTables(schemaQuery.data),
    [schemaQuery.data],
  );

  return (
    <Box
      sx={{
        height: 'calc(100vh - 300px)',
        minHeight: 400,
        border: 1,
        borderColor: 'divider',
        borderRadius: 1,
        overflow: 'hidden',
      }}
    >
      <ErDiagramPanel
        tables={tables}
        isLoading={schemaQuery.isLoading}
        error={
          schemaQuery.isError
            ? (schemaQuery.error as Error | undefined)?.message ||
              'Failed to load the schema'
            : null
        }
        headerSx={{ px: 2, py: 1.5 }}
      />
    </Box>
  );
};
