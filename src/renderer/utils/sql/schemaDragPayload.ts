/**
 * Drag-and-drop payload for schema objects dragged out of the Data tree.
 *
 * Two representations are written to the DataTransfer:
 *  - `text/plain`: the SQL identifier (qualified table name, column name…).
 *    Monaco's built-in drop handler inserts this, so any editor that does not
 *    know about the custom MIME still gets a sensible result.
 *  - `SCHEMA_OBJECT_MIME`: a JSON payload with the structured object so aware
 *    drop targets (SQL editor, notebook cells) can build richer text, e.g. a
 *    full SELECT statement when the user holds Shift.
 */

import {
  buildSelectStatement,
  qualifiedName,
  quoteIdentifier,
  type SqlDialect,
} from './schemaObjectSql';

export const SCHEMA_OBJECT_MIME = 'application/x-dbt-studio-schema-object';

export type SchemaDragObjectKind = 'schema' | 'table' | 'view' | 'column';

export type SchemaDragPayload = {
  version: 1;
  kind: SchemaDragObjectKind;
  connectionId?: string;
  connectionType?: string;
  schema: string;
  /** Present for table, view and column drags. */
  table?: string;
  /** Present for column drags. */
  column?: string;
  /** Column names of the table, when known. */
  columns?: string[];
};

/** Minimal surface of `DataTransfer` we rely on (keeps tests DOM-free). */
export type DataTransferLike = {
  types: readonly string[] | DOMStringList;
  setData(format: string, data: string): void;
  getData(format: string): string;
  effectAllowed?: string;
  dropEffect?: string;
};

const typesInclude = (
  types: readonly string[] | DOMStringList,
  mime: string,
): boolean => {
  if (typeof (types as DOMStringList).contains === 'function') {
    return (types as DOMStringList).contains(mime);
  }
  return Array.from(types as readonly string[]).includes(mime);
};

/** Plain identifier text for a payload: what a bare drop inserts. */
export const buildDragText = (payload: SchemaDragPayload): string => {
  const dialect: SqlDialect = payload.connectionType;
  switch (payload.kind) {
    case 'column':
      return quoteIdentifier(payload.column ?? '', dialect);
    case 'table':
    case 'view':
      return qualifiedName(
        { schema: payload.schema, name: payload.table ?? '' },
        dialect,
      );
    case 'schema':
    default:
      return quoteIdentifier(payload.schema, dialect);
  }
};

/**
 * Richer text for a modifier drop (Shift). Tables and views expand to a
 * SELECT with their column list; everything else falls back to plain text.
 */
export const buildDragSelectStatement = (
  payload: SchemaDragPayload,
): string => {
  if ((payload.kind === 'table' || payload.kind === 'view') && payload.table) {
    return buildSelectStatement(
      { schema: payload.schema, name: payload.table, columns: payload.columns },
      payload.connectionType,
      { columns: payload.columns },
    );
  }
  return buildDragText(payload);
};

/** Write both representations onto a drag's DataTransfer. */
export const setSchemaDragData = (
  dataTransfer: DataTransferLike,
  payload: SchemaDragPayload,
): void => {
  dataTransfer.setData(SCHEMA_OBJECT_MIME, JSON.stringify(payload));
  dataTransfer.setData('text/plain', buildDragText(payload));
  // eslint-disable-next-line no-param-reassign
  dataTransfer.effectAllowed = 'copy';
};

/**
 * True when a drag carries a schema payload. Safe to call during `dragover`,
 * where `getData` is not readable but `types` is.
 */
export const hasSchemaDragData = (
  dataTransfer: DataTransferLike | null | undefined,
): boolean =>
  !!dataTransfer && typesInclude(dataTransfer.types, SCHEMA_OBJECT_MIME);

/** Parse the structured payload from a `drop` event, or `null`. */
export const readSchemaDragData = (
  dataTransfer: DataTransferLike | null | undefined,
): SchemaDragPayload | null => {
  if (!hasSchemaDragData(dataTransfer)) return null;
  try {
    const raw = dataTransfer!.getData(SCHEMA_OBJECT_MIME);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (
      !parsed ||
      typeof parsed !== 'object' ||
      parsed.version !== 1 ||
      typeof parsed.kind !== 'string' ||
      typeof parsed.schema !== 'string'
    ) {
      return null;
    }
    return parsed as SchemaDragPayload;
  } catch {
    return null;
  }
};
