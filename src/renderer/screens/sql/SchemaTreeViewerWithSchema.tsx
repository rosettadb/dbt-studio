/* eslint-disable react/prop-types */
import React from 'react';
import { TreeItem } from '@mui/x-tree-view';
import { Box, CircularProgress, Tooltip } from '@mui/material';
import { Cached } from '@mui/icons-material';
import { RenderTree } from '../../components/schemaTreeViewer/RenderTree';
import {
  Container,
  Header,
  NoDataMessage,
  StyledTreeView,
} from '../../components/schemaTreeViewer/styles';
import { SupportedConnectionTypes, Table } from '../../../types/backend';
import { TreeItems } from '../../components/schemaTreeViewer/TreeItems';
import connectionIcons from '../../../../assets/connectionIcons';

type Props = {
  databaseName: string;
  type: SupportedConnectionTypes;
  schema: Table[];
  isLoading: boolean;
  onRefresh: () => void;
};

/**
 * A version of SchemaTreeViewer that accepts schema as a prop
 * instead of using useAppContext. This is used for connection-based
 * schema display in the SQL tool.
 */
export const SchemaTreeViewerWithSchema: React.FC<Props> = React.memo(
  ({ databaseName, type, schema: tables = [], isLoading, onRefresh }) => {
    const [expandedItems, setExpandedItems] = React.useState<string[]>([
      databaseName,
    ]);

    const schemaMap = React.useMemo(() => {
      return tables.reduce<Record<string, Table[]>>((acc, table) => {
        if (!acc[table.schema]) {
          acc[table.schema] = [];
        }
        acc[table.schema].push(table);
        return acc;
      }, {});
    }, [tables]);

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
        <Box padding={1}>
          <Header>
            <div>Schema</div>
            <Tooltip title="Refresh schema">
              {isLoading ? (
                <CircularProgress size={20} />
              ) : (
                <Cached
                  sx={{ color: 'primary.main', cursor: 'pointer' }}
                  onClick={onRefresh}
                />
              )}
            </Tooltip>
          </Header>
        </Box>
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
        {!isLoading && tables.length === 0 && (
          <NoDataMessage>No Schema available</NoDataMessage>
        )}
        {!isLoading && tables.length > 0 && (
          <StyledTreeView
            expandedItems={expandedItems}
            onExpandedItemsChange={handleExpandedItemsChange}
          >
            <TreeItem
              itemId={databaseName}
              label={
                <TreeItems.Database
                  label={databaseName}
                  icon={connectionIcons.images[type]}
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
