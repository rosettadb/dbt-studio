import type { DuckLakeSchemaInfo } from '../../../types/duckLake';
import type { ErTableInput } from './buildErGraph';

/** DuckLake's schema dump as diagram tables. DuckLake has no keys. */
export const duckLakeErTables = (
  info: DuckLakeSchemaInfo | undefined,
): ErTableInput[] =>
  (info?.schemas ?? []).flatMap((schema) =>
    schema.tables.map((table) => ({
      name: table.name,
      schema: schema.name,
      type: table.type,
      columns: table.columns.map((column) => ({
        name: column.name,
        typeName: column.type,
      })),
    })),
  );
