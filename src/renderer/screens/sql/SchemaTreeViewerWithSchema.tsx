/* eslint-disable react/prop-types */
import React from 'react';
import { TreeItem } from '@mui/x-tree-view';
import { Box, CircularProgress } from '@mui/material';
import { RenderTree } from '../../components/schemaTreeViewer/RenderTree';
import {
  Container,
  NoDataMessage,
  StyledTreeView,
} from '../../components/schemaTreeViewer/styles';
import { SupportedConnectionTypes, Table } from '../../../types/backend';
import { TreeItems } from '../../components/schemaTreeViewer/TreeItems';
import connectionIcons, {
  defaultIcon,
} from '../../../../assets/connectionIcons';

type Props = {
  databaseName: string;
  type: SupportedConnectionTypes;
  schema: Table[];
  isLoading: boolean;
  onRefresh: () => void;
  filter?: string;
};

/**
 * A version of SchemaTreeViewer that accepts schema as a prop
 * instead of using useAppContext. This is used for connection-based
 * schema display in the SQL tool.
 */
export const SchemaTreeViewerWithSchema: React.FC<Props> = React.memo(
  ({ databaseName, type, schema: tables = [], isLoading, filter = '' }) => {
    const [expandedItems, setExpandedItems] = React.useState<string[]>([
      databaseName,
    ]);

    const filteredTables = React.useMemo(() => {
      if (!filter) return tables;
      const lowerFilter = filter.toLowerCase();
      return tables.filter(
        (table) =>
          table.name.toLowerCase().includes(lowerFilter) ||
          table.schema.toLowerCase().includes(lowerFilter),
      );
    }, [tables, filter]);

    const schemaMap = React.useMemo(() => {
      return filteredTables.reduce<Record<string, Table[]>>((acc, table) => {
        if (!acc[table.schema]) {
          acc[table.schema] = [];
        }
        acc[table.schema].push(table);
        return acc;
      }, {});
    }, [filteredTables]);

    const handleExpandedItemsChange = React.useCallback(
      (_: React.SyntheticEvent, newExpanded: string[]) => {
        setExpandedItems(newExpanded);
      },
      [],
    );

    // Update expanded items when database name changes
    React.useEffect(() => {
      setExpandedItems([databaseName]);
    }, [databaseName]);

    return (
      <Container>
        {isLoading && (
          <Box
            sx={{
              display: 'flex',
              justifyContent: 'center',
              alignItems: 'center',
              padding: 4,
            }}
          >
            <CircularProgress size={24} />
          </Box>
        )}
        {!isLoading && filteredTables.length === 0 && (
          <NoDataMessage>
            {filter ? 'No results found' : 'No Schema available'}
          </NoDataMessage>
        )}
        {!isLoading && filteredTables.length > 0 && (
          <StyledTreeView
            expandedItems={expandedItems}
            onExpandedItemsChange={handleExpandedItemsChange}
          >
            <TreeItem
              itemId={databaseName}
              label={
                <TreeItems.Database
                  label={databaseName || 'Database'}
                  icon={connectionIcons.images[type] || defaultIcon}
                />
              }
            >
              {Object.entries(schemaMap).map(([schemaName, schemaTables]) => (
                <TreeItem
                  key={`${databaseName}.${schemaName}`}
                  itemId={`${databaseName}.${schemaName}`}
                  label={<TreeItems.Schema label={schemaName} />}
                >
                  {schemaTables.map((table) => (
                    <RenderTree key={table.name} table={table} />
                  ))}
                </TreeItem>
              ))}
            </TreeItem>
          </StyledTreeView>
        )}
      </Container>
    );
  },
);

SchemaTreeViewerWithSchema.displayName = 'SchemaTreeViewerWithSchema';
