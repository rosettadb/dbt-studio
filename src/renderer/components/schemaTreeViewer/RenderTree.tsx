// RenderTree.tsx
import React from 'react';
import { TreeItem } from '@mui/x-tree-view';
import { TreeItems } from './TreeItems';
import { Table } from '../../../types/backend';

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
      key={table.name}
      itemId={`${table.schema}.${table.name}`}
      label={label}
    >
      {table.columns.map((col) => (
        <TreeItem
          key={col.name}
          itemId={`${table.schema}.${table.name}.${col.name}`}
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
