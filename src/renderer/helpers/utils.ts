/* eslint-disable no-plusplus, consistent-return, no-case-declarations */
import React from 'react';
import { parsePatch, diffLines } from 'diff';
import {
  BigQueryConnection,
  ConnectionModel,
  DatabricksConnection,
  DuckDBConnection,
  PostgresConnection,
  RedshiftConnection,
  SnowflakeConnection,
  Table,
} from '../../types/backend';
import { CompletionItem } from '../../types/frontend';
import {
  MonacoAutocompleteSQLKeywords,
  MonacoCompletionItemKind,
} from '../config/constants';

export const capitalizeFirstLetter = (str: string): string => {
  if (!str) return '';
  return str.charAt(0).toUpperCase() + str.slice(1);
};

export const underscoreToTitleCase = (input: string): string => {
  return input
    .split('_')
    .filter((part) => part.length > 0)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(' ');
};

export const format = (str: string, ...args: (string | number)[]) => {
  let i = 0;
  // eslint-disable-next-line no-return-assign,no-plusplus
  return str.replace(/{}/g, () => String(args[i++]));
};

export const getFileName = (
  path: string,
  withExtension: boolean = true,
): string => {
  const parts = path.split('/');
  const name = parts.pop() || '';

  if (!name || !name.includes('.')) {
    throw new Error('The provided path is a folder, not a file.');
  }

  return withExtension ? name : name.split('.').slice(0, -1).join('.');
};

export const extractSchemaAndTable = (
  filename: string,
): { schema: string; table: string } => {
  const firstUnderscoreIndex = filename.indexOf('_');

  if (firstUnderscoreIndex === -1) {
    throw new Error(
      'Filename must contain an underscore to separate schema and table',
    );
  }

  const schema = filename.slice(0, firstUnderscoreIndex);
  const table = filename.slice(firstUnderscoreIndex + 1);

  return { schema, table };
};

export const splitPath = (path: string, projectName: string): string => {
  const startIndex = path.indexOf(projectName);

  if (startIndex === -1) {
    return path;
  }

  const prefix = path.slice(0, 10);
  const projectPart = path.slice(startIndex);

  return `${prefix}...${projectPart}`;
};

export const getVersionsFromDiff = (newContent: string, diffString: string) => {
  const patch = parsePatch(diffString)[0];
  const newLines = newContent.split('\n');

  const oldLines = [...newLines];
  let offset = 0;

  patch.hunks.forEach((hunk) => {
    let newIndex = hunk.newStart - 1 + offset;
    let removedCount = 0;

    hunk.lines.forEach((line) => {
      const type = line[0];
      const value = line.slice(1);

      if (type === '+') {
        oldLines.splice(newIndex, 1);
        removedCount += 1;
      } else if (type === '-') {
        oldLines.splice(newIndex, 0, value);
        newIndex++;
      } else {
        newIndex++;
      }
    });

    offset -= removedCount;
  });

  return {
    oldVersion: oldLines.join('\n'),
    newVersion: newContent,
  };
};

export function getChangedLineNumbers(oldStr: string, newStr: string) {
  const changes = diffLines(oldStr, newStr);
  let line = 1;
  const added: number[] = [];
  const removed: number[] = [];

  changes.forEach((part) => {
    const lines = part.value.split('\n').length - 1;
    if (part.added) {
      for (let i = 0; i < lines; i++) added.push(line + i);
      line += lines;
    } else if (part.removed) {
      for (let i = 0; i < lines; i++) removed.push(line + i);
    } else {
      line += lines;
    }
  });

  return { added, removed };
}

export const getInitials = (name: string): string => {
  const cleaned = name.trim().replace(/_/g, ' ');
  const parts = cleaned.split(' ').filter(Boolean);
  if (parts.length === 1) return parts[0][0].toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
};

export const getRandomColor = (seed: string): string => {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    // eslint-disable-next-line no-bitwise
    hash = seed.charCodeAt(i) + ((hash << 5) - hash);
  }
  return `hsl(${hash % 360}, 70%, 50%)`;
};

export const handleExternalLink = (
  event: React.MouseEvent<HTMLAnchorElement, MouseEvent>,
  url: string,
): void => {
  event.preventDefault();
  window.electron.ipcRenderer.invoke('open:external', url);
};

export const generateMonacoCompletions = (
  tables: Table[],
): Omit<CompletionItem, 'range'>[] => {
  const completions: Omit<CompletionItem, 'range'>[] = [];
  const seenLabels = new Set<string>();

  MonacoAutocompleteSQLKeywords.forEach((keyword) => {
    if (!seenLabels.has(keyword)) {
      seenLabels.add(keyword);
      completions.push({
        label: keyword,
        kind: MonacoCompletionItemKind.Keyword,
        insertText: keyword,
        detail: 'SQL keyword',
      });
    }
  });

  const uniqueSchemas = new Set<string>();
  tables.forEach((table) => {
    uniqueSchemas.add(table.schema);
  });

  uniqueSchemas.forEach((schema) => {
    if (!seenLabels.has(schema)) {
      seenLabels.add(schema);
      completions.push({
        label: schema,
        kind: MonacoCompletionItemKind.Module,
        insertText: schema,
        detail: 'Schema',
      });
    }
  });

  tables.forEach((table) => {
    const { schema, name, columns = [] } = table;
    if (!seenLabels.has(name)) {
      seenLabels.add(name);
      completions.push({
        label: name,
        kind: MonacoCompletionItemKind.Struct,
        insertText: name,
        detail: `Table in ${schema}`,
      });
    }

    const qualifiedTableName = `${schema}.${name}`;
    if (!seenLabels.has(qualifiedTableName)) {
      seenLabels.add(qualifiedTableName);
      completions.push({
        label: qualifiedTableName,
        kind: MonacoCompletionItemKind.Struct,
        insertText: qualifiedTableName,
        detail: 'Qualified table name',
      });
    }

    columns.forEach((column) => {
      if (!seenLabels.has(column.name)) {
        seenLabels.add(column.name);
        completions.push({
          label: column.name,
          kind: MonacoCompletionItemKind.Field,
          insertText: column.name,
          detail: `Column`,
        });
      }

      const fullyQualifiedColumn = `${schema}.${name}.${column.name}`;
      if (!seenLabels.has(fullyQualifiedColumn)) {
        seenLabels.add(fullyQualifiedColumn);
        completions.push({
          label: fullyQualifiedColumn,
          kind: MonacoCompletionItemKind.Value,
          insertText: fullyQualifiedColumn,
          detail: 'Fully qualified column',
        });
      }
    });
  });

  return completions;
};

export const convertToSourcePath = (path: string): string => {
  const parts = path.split('/');
  const modelName = parts[parts.length - 1];

  const underscoreParts = modelName.split('_');
  if (underscoreParts.length >= 2) {
    const schema = underscoreParts[0];
    const table = underscoreParts.slice(1).join('_');
    return `source:${schema}.${table}`;
  }
  return `source:${modelName}`;
};

export const getConnectionInput = (conn: ConnectionModel) => {
  if (!conn) {
    return;
  }
  const { connection } = conn;
  const { type } = connection;
  switch (type) {
    case 'postgres':
      const pg = connection as PostgresConnection;
      return {
        type,
        host: pg.host,
        port: pg.port,
        username: pg.username,
        password: pg.password,
        database: pg.database,
        schema: pg.schema || 'public',
      };
    case 'redshift':
      const rs = connection as RedshiftConnection;
      return {
        type,
        host: rs.host,
        port: rs.port,
        username: rs.username,
        password: rs.password,
        database: rs.database,
        schema: rs.schema || 'public',
      };
    case 'snowflake':
      const sf = connection as SnowflakeConnection;
      return {
        type,
        account: sf.account,
        username: sf.username,
        password: sf.password,
        database: sf.database,
        warehouse: sf.warehouse,
        schema: sf.schema || 'PUBLIC',
        role: sf.role,
      };
    case 'bigquery':
      const bq = connection as BigQueryConnection;
      return {
        type,
        projectId: bq.project,
        keyFilename: bq.keyfile,
        schema: bq.database,
        method: bq.method,
        keyfile: bq.keyfile,
        location: bq.location,
        priority: bq.priority,
      };
    case 'databricks':
      const db = connection as DatabricksConnection;
      return {
        type,
        host: db.host,
        port: db.port,
        httpPath: db.httpPath,
        token: db.token, // Use token directly
        database: db.database,
        schema: db.schema,
      };
    case 'duckdb':
      const duck = connection as DuckDBConnection;
      return {
        type,
        database_path: duck.database_path,
        database: duck.database,
        schema: duck.schema || 'main',
        name: connection.name,
      };
    default:
      return undefined;
  }
};

export const extractModelNameFromPath = (filePath: string): string => {
  // Extract model name from file path
  // Example: /path/to/project/models/staging/my_model.sql -> staging.my_model
  const pathParts = filePath.split('/');
  const modelsIndex = pathParts.findIndex((part) => part === 'models');
  if (modelsIndex === -1) return '';

  // Get the path after 'models/' and before '.sql'
  const modelPath = pathParts.slice(modelsIndex + 1).join('/');
  const modelName = modelPath.replace('.sql', '');

  // Convert path separators to dots for dbt selection
  return modelName.replace(/\//g, '.');
};

/**
 * List of file extensions that should not be edited as text
 */
const NON_EDITABLE_EXTENSIONS = ['.duckdb', '.db', '.sqlite', '.sqlite3'];

/**
 * Gets the file extension from a file path
 * @param filePath - The path to the file
 * @returns the file extension in lowercase (including the dot)
 */
export const getFileExtension = (filePath: string): string => {
  const parts = filePath.toLowerCase().split('.');
  if (parts.length < 2) return '';
  return `.${parts[parts.length - 1]}`;
};

/**
 * Checks if a file is editable based on its extension
 * @param filePath - The path to the file
 * @returns true if the file can be edited as text, false otherwise
 */
export const isEditableFile = (filePath: string): boolean => {
  const extension = getFileExtension(filePath);
  return !NON_EDITABLE_EXTENSIONS.includes(extension);
};

/**
 * Gets an appropriate message for non-editable files
 * @param filePath - The path to the file
 * @returns a message explaining why the file cannot be edited
 */
export const getNonEditableFileMessage = (filePath: string): string => {
  const extension = getFileExtension(filePath);
  const fileName = filePath.split('/').pop() || 'Unknown file';

  switch (extension) {
    case '.duckdb':
      return `# DuckDB Database File

This file is a DuckDB database file and cannot be edited as text.

**File:** ${fileName}

DuckDB files contain binary data and should be accessed through:
- Database queries and connections
- DuckDB CLI tools
- Database management applications

**Note:** Attempting to edit this file as text could corrupt the database.`;

    case '.db':
    case '.sqlite':
    case '.sqlite3':
      return `# Database File

This file is a database file and cannot be edited as text.

**File:** ${fileName}

Database files contain binary data and should be accessed through appropriate database tools and applications.

**Note:** Attempting to edit this file as text could corrupt the database.`;

    default:
      return `# Non-Editable File

This file type cannot be edited as text.

**File:** ${fileName}

Please use an appropriate application to view or edit this file type.`;
  }
};
