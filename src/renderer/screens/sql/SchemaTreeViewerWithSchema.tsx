/* eslint-disable react/prop-types */
import React from 'react';
import { TreeItem } from '@mui/x-tree-view';
import { Box, CircularProgress } from '@mui/material';
import { RenderTree } from '../../components/schemaTreeViewer/RenderTree';
import { dedupeTables } from '../../components/schemaTreeViewer/dedupeTables';
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
  schemaNames?: string[];
  isLoading: boolean;
  filter?: string;
  hideSchemaLevel?: boolean;
};

/**
 * A version of SchemaTreeViewer that accepts schema as a prop
 * instead of using useAppContext. This is used for connection-based
 * schema display in the SQL tool.
 */
export const SchemaTreeViewerWithSchema: React.FC<Props> = React.memo(
  ({
    databaseName,
    type,
    schema: tables = [],
    schemaNames,
    isLoading,
    filter = '',
    hideSchemaLevel = false,
  }) => {
    const [expandedItems, setExpandedItems] = React.useState<string[]>([
      databaseName,
    ]);

    const dedupedTables = React.useMemo(() => dedupeTables(tables), [tables]);

    const filteredTables = React.useMemo(() => {
      if (!filter) return dedupedTables;
      const lowerFilter = filter.toLowerCase();
      return dedupedTables.filter(
        (table) =>
          table.name.toLowerCase().includes(lowerFilter) ||
          table.schema.toLowerCase().includes(lowerFilter),
      );
    }, [dedupedTables, filter]);

    const schemaMap = React.useMemo(() => {
      const map = filteredTables.reduce<Record<string, Table[]>>(
        (acc, table) => {
          if (!acc[table.schema]) {
            acc[table.schema] = [];
          }
          acc[table.schema].push(table);
          return acc;
        },
        {},
      );

      if (schemaNames) {
        schemaNames.forEach((name) => {
          if (!map[name]) {
            map[name] = [];
          }
        });
      }
      return map;
    }, [filteredTables, schemaNames]);

    const hasData =
      filteredTables.length > 0 || (schemaNames && schemaNames.length > 0);

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
        {!isLoading && !hasData && (
          <NoDataMessage>
            {filter ? 'No results found' : 'No Schema available'}
          </NoDataMessage>
        )}
        {!isLoading && hasData && (
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
              {hideSchemaLevel &&
                filteredTables.map((table) => (
                  <RenderTree
                    key={`${table.schema}.${table.name}`}
                    table={table}
                  />
                ))}
              {!hideSchemaLevel &&
                Object.entries(schemaMap).map(([schemaName, schemaTables]) => (
                  <TreeItem
                    key={`${databaseName}.${schemaName}`}
                    itemId={`${databaseName}.${schemaName}`}
                    label={<TreeItems.Schema label={schemaName} />}
                  >
                    {schemaTables.map((table) => (
                      <RenderTree
                        key={`${schemaName}.${table.name}`}
                        table={table}
                      />
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
