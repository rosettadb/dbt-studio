import { Table } from '../../../types/backend';
import { tableTreeKey } from './treeIds';

// MUI X Tree View requires every itemId to be unique. RenderTree derives
// itemIds from tableTreeKey(table), so a schema extractor that returns the
// same table twice (seen intermittently on Windows, likely from a
// stale/racing DuckDB connection) crashes the whole tree instead of just
// rendering a duplicate row. Drop repeats before they reach the tree.
export const dedupeTables = (tables: Table[]): Table[] => {
  const seen = new Set<string>();
  return tables.filter((table) => {
    const key = tableTreeKey(table);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};
