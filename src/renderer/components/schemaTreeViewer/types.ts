import type { SchemaDragPayload } from '../../utils/sql/schemaDragPayload';

export type SchemaTreeNodeKind =
  | 'database'
  | 'schema'
  | 'table'
  | 'view'
  | 'column';

/**
 * Identity of a node in the Data tree, handed to drag and context-menu
 * callbacks. Flat on purpose so consumers can read fields without narrowing.
 */
export type SchemaTreeNodeRef = {
  kind: SchemaTreeNodeKind;
  databaseName?: string;
  schema?: string;
  table?: string;
  /** 'TABLE' | 'VIEW' | whatever the connector reports. */
  tableType?: string;
  column?: string;
  columnType?: string;
  /** Column names of the enclosing table, in ordinal order. */
  columns?: string[];
};

/** Connection identity the tree needs to build drag payloads. */
export type SchemaTreeDragContext = {
  connectionId?: string;
  connectionType?: string;
};

/**
 * Convert a tree node into a drag payload. Database nodes are not draggable
 * and yield `null`.
 */
export const toSchemaDragPayload = (
  node: SchemaTreeNodeRef,
  context: SchemaTreeDragContext = {},
): SchemaDragPayload | null => {
  const base = {
    version: 1 as const,
    connectionId: context.connectionId,
    connectionType: context.connectionType,
    schema: node.schema ?? '',
  };

  switch (node.kind) {
    case 'schema':
      return { ...base, kind: 'schema' };
    case 'table':
    case 'view':
      if (!node.table) return null;
      return {
        ...base,
        kind: node.kind,
        table: node.table,
        columns: node.columns,
      };
    case 'column':
      if (!node.table || !node.column) return null;
      return {
        ...base,
        kind: 'column',
        table: node.table,
        column: node.column,
        columns: node.columns,
      };
    case 'database':
    default:
      return null;
  }
};
