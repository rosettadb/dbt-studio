import { createContext } from 'react';
import type { Table } from '../../../types/backend';
import type { SqlCompletionItem } from '../../lib/monaco/completions/sqlSchema';

export type NotebookSqlCompletions = {
  items: SqlCompletionItem[];
  tables?: Table[];
};

/**
 * Completion data the notebook editor computes once per connection and every
 * SQL cell publishes to the shared `sql` completion provider for its own
 * Monaco model.
 */
export const NotebookSqlCompletionsContext =
  createContext<NotebookSqlCompletions>({ items: [] });
