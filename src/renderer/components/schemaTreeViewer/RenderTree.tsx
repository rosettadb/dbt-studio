// RenderTree.tsx
import React from 'react';
import { TreeItem } from '@mui/x-tree-view';
import { TreeItems, TreeItemRootProps } from './TreeItems';
import { Table } from '../../../types/backend';
import { tableTreeKey, columnTreeKey } from './treeIds';
import {
  SchemaTreeDragContext,
  SchemaTreeNodeRef,
  toSchemaDragPayload,
} from './types';
import { setSchemaDragData } from '../../utils/sql/schemaDragPayload';

type Props = {
  table: Table;
  /**
   * When true, table/view/column rows can be dragged into an editor. Off by
   * default so callers that don't opt in keep the exact previous behaviour.
   */
  draggable?: boolean;
  /** Connection identity written into drag payloads. */
  dragContext?: SchemaTreeDragContext;
  /** Right-click on a row. Nothing is attached when omitted. */
  onContextMenu?: (
    event: React.MouseEvent<HTMLDivElement>,
    node: SchemaTreeNodeRef,
  ) => void;
};

const tableNodeRef = (table: Table): SchemaTreeNodeRef => ({
  kind: table.type === 'VIEW' ? 'view' : 'table',
  schema: table.schema,
  table: table.name,
  tableType: table.type,
  columns: table.columns.map((c) => c.name),
});

const columnNodeRef = (
  table: Table,
  column: Table['columns'][number],
): SchemaTreeNodeRef => ({
  ...tableNodeRef(table),
  kind: 'column',
  column: column.name,
  columnType: column.typeName,
});

/**
 * Build the DOM props for a row label: drag wiring, context menu wiring and
 * `data-*` hooks for tests. Returns `undefined` when nothing is needed so the
 * label renders exactly as before.
 */
export const useTreeRowProps = (
  draggable: boolean,
  dragContext: SchemaTreeDragContext | undefined,
  onContextMenu: Props['onContextMenu'],
) =>
  React.useCallback(
    (node: SchemaTreeNodeRef): TreeItemRootProps | undefined => {
      const props: TreeItemRootProps = {
        'data-testid': `schema-tree-${node.kind}`,
        'data-schema': node.schema,
        'data-table': node.table,
        'data-column': node.column,
      };

      if (draggable) {
        const payload = toSchemaDragPayload(node, dragContext);
        if (payload) {
          props.draggable = true;
          props.onDragStart = (event) => {
            // Keep the drag local to this row; nothing above needs to react.
            event.stopPropagation();
            setSchemaDragData(event.dataTransfer, payload);
          };
        }
      }

      if (onContextMenu) {
        props.onContextMenu = (event) => onContextMenu(event, node);
      }

      return props;
    },
    [draggable, dragContext, onContextMenu],
  );

const RenderTree: React.FC<Props> = ({
  table,
  draggable = false,
  dragContext,
  onContextMenu,
}) => {
  const rowProps = useTreeRowProps(draggable, dragContext, onContextMenu);

  const label = React.useMemo(() => {
    const rootProps = rowProps(tableNodeRef(table));
    if (table.type === 'VIEW') {
      return <TreeItems.View label={table.name} rootProps={rootProps} />;
    }
    return <TreeItems.Table label={table.name} rootProps={rootProps} />;
  }, [table, rowProps]);

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
              rootProps={rowProps(columnNodeRef(table, col))}
            />
          }
        />
      ))}
    </TreeItem>
  );
};

export { RenderTree };
