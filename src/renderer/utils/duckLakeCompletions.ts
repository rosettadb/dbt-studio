/**
 * DuckLake Completions Utility
 * Generates Monaco Editor code completions for DuckLake instances
 * Includes system tables, functions, and user-defined tables/columns
 */

import * as Monaco from 'monaco-editor';
import { DuckLakeSchemaInfo } from '../../types/duckLake';

/**
 * Generate Monaco code completions from DuckLake schema information
 * @param schema Schema information extracted from DuckLake instance
 * @returns Array of Monaco completion items
 */
export function generateDuckLakeCompletions(
  schema: DuckLakeSchemaInfo,
): Omit<Monaco.languages.CompletionItem, 'range'>[] {
  const completions: Omit<Monaco.languages.CompletionItem, 'range'>[] = [];

  // Add DuckLake system tables
  schema.systemTables.forEach((tableName) => {
    completions.push({
      label: tableName,
      kind: Monaco.languages.CompletionItemKind.Struct,
      insertText: tableName,
      detail: 'DuckLake System Table',
      documentation: `System metadata table: ${tableName}`,
    });
  });

  // Add DuckLake-specific functions
  const functionDetails: Record<
    string,
    { params: string; description: string }
  > = {
    ducklake_snapshots: {
      params: '(table_name)',
      description: 'Lists all snapshots for a table',
    },
    ducklake_table_info: {
      params: '(table_name)',
      description: 'Returns metadata information about a table',
    },
    ducklake_table_insertions: {
      params: '(table_name, snapshot_id)',
      description: 'Returns rows inserted in a specific snapshot',
    },
    ducklake_table_deletions: {
      params: '(table_name, snapshot_id)',
      description: 'Returns rows deleted in a specific snapshot',
    },
    ducklake_table_changes: {
      params: '(table_name, from_snapshot, to_snapshot)',
      description: 'Returns all changes between two snapshots',
    },
  };

  schema.functions.forEach((funcName) => {
    const detail = functionDetails[funcName];
    completions.push({
      label: funcName,
      kind: 1, // Monaco.languages.CompletionItemKind.Function
      insertText: detail ? `${funcName}${detail.params}` : funcName,
      detail: 'DuckLake Function',
      documentation: detail
        ? detail.description
        : `DuckLake function: ${funcName}`,
    });
  });

  // Add user tables and columns
  schema.schemas.forEach((schemaObj) => {
    schemaObj.tables.forEach((table) => {
      // Add table completion
      completions.push({
        label: table.name,
        kind: Monaco.languages.CompletionItemKind.Struct,
        insertText: table.name,
        detail: `Table (${schemaObj.name}.${table.name})`,
        documentation: `Table: ${table.name}\nType: ${table.type}\nColumns: ${table.columns.length}`,
      });

      // Add column completions
      table.columns.forEach((column) => {
        completions.push({
          label: column.name,
          kind: Monaco.languages.CompletionItemKind.Field,
          insertText: column.name,
          detail: `${table.name}.${column.name} (${column.type})`,
          documentation: `Column: ${column.name}\nType: ${column.type}\nTable: ${table.name}`,
        });
      });
    });
  });

  // Add common SQL keywords and DuckLake-specific syntax
  const duckLakeKeywords = [
    {
      label: 'FOR SYSTEM_TIME AS OF SNAPSHOT',
      detail: 'Time travel query syntax',
    },
    { label: 'ATTACH', detail: 'Attach a DuckLake catalog' },
    { label: 'DETACH', detail: 'Detach a DuckLake catalog' },
  ];

  duckLakeKeywords.forEach((keyword) => {
    completions.push({
      label: keyword.label,
      kind: Monaco.languages.CompletionItemKind.Keyword,
      insertText: keyword.label,
      detail: keyword.detail,
      documentation: `DuckLake keyword: ${keyword.label}`,
    });
  });

  return completions;
}

/**
 * Merge DuckLake completions with existing database completions
 * @param existingCompletions Existing completions from database connections
 * @param duckLakeCompletions DuckLake-specific completions
 * @returns Combined array of completions
 */
export function mergeCompletions(
  existingCompletions: Omit<Monaco.languages.CompletionItem, 'range'>[],
  duckLakeCompletions: Omit<Monaco.languages.CompletionItem, 'range'>[],
): Omit<Monaco.languages.CompletionItem, 'range'>[] {
  // Create a map to avoid duplicates (DuckLake takes precedence)
  const completionMap = new Map<
    string,
    Omit<Monaco.languages.CompletionItem, 'range'>
  >();

  const getCompletionKey = (
    completion: Omit<Monaco.languages.CompletionItem, 'range'>,
  ): string => {
    const labelPart =
      typeof completion.label === 'string'
        ? completion.label
        : `${completion.label.label}|${completion.label.detail ?? ''}|${completion.label.description ?? ''}`;

    const kindPart = completion.kind ?? '';
    const detailPart = completion.detail ?? '';
    const insertTextPart =
      typeof completion.insertText === 'string' ? completion.insertText : '';

    return `${labelPart}::${kindPart}::${detailPart}::${insertTextPart}`;
  };

  // Add existing completions first
  existingCompletions.forEach((completion) => {
    completionMap.set(getCompletionKey(completion), completion);
  });

  // Add/override with DuckLake completions
  duckLakeCompletions.forEach((completion) => {
    completionMap.set(getCompletionKey(completion), completion);
  });

  return Array.from(completionMap.values());
}
