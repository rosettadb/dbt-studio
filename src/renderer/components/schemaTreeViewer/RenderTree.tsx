// RenderTree.tsx
import React from 'react';
import { TreeItem } from '@mui/x-tree-view';
import { TreeItems } from './TreeItems';
import { Table } from '../../../types/backend';
import { tableTreeKey, columnTreeKey } from './treeIds';

type Props = {
  table: Table;
};

const RenderTree: React.FC<Props> = ({ table }) => {
  const label = React.useMemo(() => {
    if (table.type === 'VIEW') {
      return <TreeItems.View label={table.name} />;
    }
    return <TreeItems.Table label={table.name} />;
  }, [table]);

  return (
    <TreeItem
      key={tableTreeKey(table)}
      itemId={tableTreeKey(table)}
      label={label}
    >
      {table.columns.map((col) => (
        <TreeItem
          key={columnTreeKey(table, col.name)}
          itemId={columnTreeKey(table, col.name)}
          label={
            <TreeItems.Column
              label={col.name}
              typeName={col.typeName}
              primaryKey={col.primaryKey}
              foreignKey={(col.foreignKeys?.length ?? 0) > 0}
            />
          }
        />
      ))}
    </TreeItem>
  );
};

export { RenderTree };
