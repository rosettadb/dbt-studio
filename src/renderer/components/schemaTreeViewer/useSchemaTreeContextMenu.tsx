import React from 'react';
import { toast } from 'react-toastify';
import {
  SchemaTreeContextMenu,
  type SchemaTreeContextMenuState,
  type SchemaTreeMenuAction,
} from './SchemaTreeContextMenu';
import { RenameSchemaObjectDialog } from './RenameSchemaObjectDialog';
import type { SchemaTreeNodeRef } from './types';
import {
  buildCountByColumnStatement,
  buildCountStatement,
  buildInsertTemplate,
  buildSelectDistinctStatement,
  buildSelectStatement,
  formatColumnList,
  qualifiedColumnName,
  qualifiedName,
  quoteIdentifier,
  type SchemaObjectRef,
  type SqlDialect,
} from '../../utils/sql/schemaObjectSql';

export type SchemaTreeContextMenuOptions = {
  /** Dialect used for quoting and generated SQL. */
  connectionType?: string;
  /** Insert text at the cursor of the host's active editor. */
  onInsertText?: (text: string) => void;
  /** Run a SELECT and show its results (Preview data). */
  onPreviewSql?: (sql: string) => void;
  /**
   * Rename a table/view/column. The host decides whether this executes
   * immediately (DuckLake) or only generates an ALTER statement.
   */
  onRename?: (node: SchemaTreeNodeRef, newName: string) => void;
  /**
   * Text shown in the rename dialog so users know what will happen. Return
   * `undefined` for no description.
   */
  describeRename?: (node: SchemaTreeNodeRef) => string | undefined;
  /** Refresh the schema tree. */
  onRefresh?: () => void;
  /** Number of rows for generated SELECTs and previews. Defaults to 100. */
  previewLimit?: number;
};

const copyToClipboard = async (text: string, what: string) => {
  try {
    await navigator.clipboard.writeText(text);
    toast.success(`Copied ${what}`);
  } catch {
    toast.error('Failed to copy to clipboard');
  }
};

const toObjectRef = (node: SchemaTreeNodeRef): SchemaObjectRef => ({
  schema: node.schema ?? '',
  name: node.table ?? '',
  type: node.tableType,
  columns: node.columns,
});

/**
 * Build the text a menu action produces for a node. Exported so it can be
 * unit tested without rendering the menu. Returns `null` for actions that
 * don't yield text (preview/rename/refresh) or nodes lacking the needed data.
 */
export const buildActionText = (
  action: SchemaTreeMenuAction,
  node: SchemaTreeNodeRef,
  dialect: SqlDialect,
  limit = 100,
): string | null => {
  const ref = toObjectRef(node);
  const column = node.column ?? '';

  switch (action) {
    case 'insert-name':
      if (node.kind === 'column') return quoteIdentifier(column, dialect);
      if (node.kind === 'schema')
        return quoteIdentifier(node.schema ?? '', dialect);
      if (!node.table) return null;
      return qualifiedName(ref, dialect);
    case 'copy-name':
      if (node.kind === 'column') return column;
      if (node.kind === 'schema') return node.schema ?? '';
      if (node.kind === 'database') return node.databaseName ?? '';
      return node.table ?? null;
    case 'copy-qualified-name':
      if (node.kind === 'column')
        return qualifiedColumnName(ref, column, dialect);
      if (!node.table) return null;
      return qualifiedName(ref, dialect);
    case 'copy-columns':
      if (!node.columns?.length) return null;
      return formatColumnList(node.columns, dialect);
    case 'generate-select':
      if (!node.table) return null;
      return buildSelectStatement(ref, dialect, { limit });
    case 'generate-select-columns':
      if (!node.table || !node.columns?.length) return null;
      return buildSelectStatement(ref, dialect, {
        limit,
        columns: node.columns,
      });
    case 'generate-count':
      if (!node.table) return null;
      return buildCountStatement(ref, dialect);
    case 'generate-insert':
      if (!node.table) return null;
      return buildInsertTemplate(ref, dialect, node.columns ?? []);
    case 'generate-select-column':
      if (!node.table || !column) return null;
      return buildSelectStatement(ref, dialect, { limit, columns: [column] });
    case 'generate-select-distinct':
      if (!node.table || !column) return null;
      return buildSelectDistinctStatement(ref, column, dialect, limit);
    case 'generate-count-by':
      if (!node.table || !column) return null;
      return buildCountByColumnStatement(ref, column, dialect);
    case 'preview':
      if (!node.table) return null;
      return buildSelectStatement(ref, dialect, { limit });
    default:
      return null;
  }
};

const renameKindLabel = (node: SchemaTreeNodeRef): string => {
  if (node.kind === 'column') return 'column';
  if (node.kind === 'view') return 'view';
  return 'table';
};

/**
 * Wires a right-click menu (and rename dialog) to the Data tree. Returns the
 * `onContextMenu` handler to pass to the tree and a `menu` element to render
 * once anywhere in the host.
 */
export const useSchemaTreeContextMenu = (
  options: SchemaTreeContextMenuOptions,
) => {
  const {
    connectionType,
    onInsertText,
    onPreviewSql,
    onRename,
    describeRename,
    onRefresh,
    previewLimit = 100,
  } = options;

  const [state, setState] = React.useState<SchemaTreeContextMenuState>(null);
  const [renameTarget, setRenameTarget] =
    React.useState<SchemaTreeNodeRef | null>(null);

  const onContextMenu = React.useCallback(
    (event: React.MouseEvent, node: SchemaTreeNodeRef) => {
      event.preventDefault();
      event.stopPropagation();
      setState({ mouseX: event.clientX, mouseY: event.clientY, node });
    },
    [],
  );

  const close = React.useCallback(() => setState(null), []);

  const handleAction = React.useCallback(
    (action: SchemaTreeMenuAction, node: SchemaTreeNodeRef) => {
      switch (action) {
        case 'refresh':
          onRefresh?.();
          return;
        case 'rename':
          setRenameTarget(node);
          return;
        case 'preview': {
          const sql = buildActionText(
            action,
            node,
            connectionType,
            previewLimit,
          );
          if (sql) onPreviewSql?.(sql);
          return;
        }
        case 'copy-name':
        case 'copy-qualified-name':
        case 'copy-columns': {
          const text = buildActionText(action, node, connectionType);
          if (text != null) {
            copyToClipboard(
              text,
              action === 'copy-columns' ? 'column list' : 'name',
            );
          }
          return;
        }
        default: {
          const text = buildActionText(
            action,
            node,
            connectionType,
            previewLimit,
          );
          if (text != null) onInsertText?.(text);
        }
      }
    },
    [connectionType, onInsertText, onPreviewSql, onRefresh, previewLimit],
  );

  const capabilities = React.useMemo(
    () => ({
      insert: !!onInsertText,
      preview: !!onPreviewSql,
      rename: !!onRename,
      refresh: !!onRefresh,
    }),
    [onInsertText, onPreviewSql, onRename, onRefresh],
  );

  const renameCurrentName = renameTarget
    ? ((renameTarget.kind === 'column'
        ? renameTarget.column
        : renameTarget.table) ?? '')
    : '';

  const menu = (
    <>
      <SchemaTreeContextMenu
        state={state}
        onClose={close}
        onAction={handleAction}
        capabilities={capabilities}
      />
      <RenameSchemaObjectDialog
        open={renameTarget !== null}
        objectKind={renameTarget ? renameKindLabel(renameTarget) : 'table'}
        currentName={renameCurrentName}
        description={renameTarget ? describeRename?.(renameTarget) : undefined}
        onClose={() => setRenameTarget(null)}
        onConfirm={(newName) => {
          const target = renameTarget;
          setRenameTarget(null);
          if (target) onRename?.(target, newName);
        }}
      />
    </>
  );

  return { onContextMenu, menu, isOpen: state !== null };
};
