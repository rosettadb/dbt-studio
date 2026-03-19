/**
 * Shared Monaco Autocomplete Hook
 * Generates Monaco completion items from database schema and DuckLake schema
 */

import { useMemo } from 'react';
import { Table } from '../../types/backend';
import { DuckLakeSchemaInfo } from '../../types/duckLake';
import { utils } from '../helpers';
import {
  generateDuckLakeCompletions,
  mergeCompletions,
} from '../utils/duckLakeCompletions';

export function useMonacoAutocomplete(
  schema: Table[] | null,
  duckLakeSchema: DuckLakeSchemaInfo | null,
) {
  const completions = useMemo(() => {
    const baseCompletions = schema
      ? utils.generateMonacoCompletions(schema)
      : [];

    // Merge with DuckLake completions if available
    if (duckLakeSchema) {
      const duckLakeItems = generateDuckLakeCompletions(duckLakeSchema);
      return mergeCompletions(baseCompletions, duckLakeItems);
    }

    return baseCompletions;
  }, [schema, duckLakeSchema]);

  return completions;
}
