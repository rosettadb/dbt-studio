import { Table } from '../../../types/backend';

// MUI X Tree View requires every itemId to be unique. RenderTree derives
// itemIds from `${table.schema}.${table.name}`, so a schema extractor that
// returns the same table twice (seen intermittently on Windows, likely from
// a stale/racing DuckDB connection) crashes the whole tree instead of just
// rendering a duplicate row. Drop repeats before they reach the tree.
export const dedupeTables = (tables: Table[]): Table[] => {
  const seen = new Set<string>();
  return tables.filter((table) => {
    const key = `${table.schema}.${table.name}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};
