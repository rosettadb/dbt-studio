import React from 'react';
import { TreeItem } from '@mui/x-tree-view';
import { Box, CircularProgress, Tooltip } from '@mui/material';
import { Cached } from '@mui/icons-material';
import { RenderTree } from './RenderTree';
import { Container, Header, NoDataMessage, StyledTreeView } from './styles';
import { SupportedConnectionTypes, Table } from '../../../types/backend';
import { TreeItems } from './TreeItems';
import { useAppContext } from '../../hooks';
import connectionIcons from '../../../../assets/connectionIcons';

type Props = {
  databaseName: string;
  type: SupportedConnectionTypes;
};

const SchemaTreeViewer: React.FC<Props> = ({ databaseName, type }) => {
  const { fetchSchema, schema: tables = [], isLoadingSchema } = useAppContext();
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

  return (
    <Container>
      <Box padding={1}>
        <Header>
          <div>Schema</div>
          <Tooltip title="Refresh schema">
            {isLoadingSchema ? (
              <CircularProgress size={20} />
            ) : (
              <Cached
                sx={{ color: 'primary.main', cursor: 'pointer' }}
                onClick={fetchSchema}
              />
            )}
          </Tooltip>
        </Header>
      </Box>
      {tables.length === 0 && (
        <NoDataMessage>No Schema available</NoDataMessage>
      )}
      {tables.length > 0 && (
        <StyledTreeView
          expandedItems={expandedItems}
          onExpandedItemsChange={(_, newExpanded) =>
            setExpandedItems(newExpanded)
          }
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
};

export { SchemaTreeViewer };
