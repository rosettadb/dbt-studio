import { Table } from '../../../types/backend';

// Tagged, colon-delimited identity keys for the schema tree (MUI X Tree View
// requires every itemId to be globally unique). Each level is tagged
// (D/S/T/V/C) so a database, schema, table, view, and column node can never
// collide with each other. A collision between two different tables would
// require a schema or table name containing a literal tag sequence like
// ":T:" or ":C:" - not something any real schema/table name does.
export const schemaTreeKey = (
  databaseName: string,
  schemaName: string,
): string => `D:${databaseName}:S:${schemaName}`;

export const tableTreeKey = (
  table: Pick<Table, 'schema' | 'name' | 'type'>,
): string =>
  `S:${table.schema}:${table.type === 'VIEW' ? 'V' : 'T'}:${table.name}`;

export const columnTreeKey = (
  table: Pick<Table, 'schema' | 'name' | 'type'>,
  columnName: string,
): string => `${tableTreeKey(table)}:C:${columnName}`;
