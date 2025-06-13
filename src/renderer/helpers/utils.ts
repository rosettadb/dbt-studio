import { parsePatch, diffLines } from 'diff';
import { Table } from '../../types/backend';
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
    return path; // projectName not found, return full path
  }

  const prefix = path.slice(0, 10); // Show first 10 characters (or adjust as needed)
  const projectPart = path.slice(startIndex);

  return `${prefix}...${projectPart}`;
};

export const getVersionsFromDiff = (newContent: string, diffString: string) => {
  const patch = parsePatch(diffString)[0]; // get first file diff
  const newLines = newContent.split('\n');

  const oldLines = [...newLines]; // clone current content
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
        // eslint-disable-next-line no-plusplus
        newIndex++;
      } else {
        // eslint-disable-next-line no-plusplus
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
      // eslint-disable-next-line no-plusplus
      for (let i = 0; i < lines; i++) added.push(line + i);
      line += lines;
    } else if (part.removed) {
      // eslint-disable-next-line no-plusplus
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
  // eslint-disable-next-line no-plusplus
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
  const seenLabels = new Set<string>(); // Track seen labels to prevent duplicates

  // Add SQL keywords (only once)
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

  // Collect unique schemas first
  const uniqueSchemas = new Set<string>();
  tables.forEach((table) => {
    uniqueSchemas.add(table.schema);
  });

  // Add unique schemas
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

    // Add table name (unique)
    if (!seenLabels.has(name)) {
      seenLabels.add(name);
      completions.push({
        label: name,
        kind: MonacoCompletionItemKind.Struct,
        insertText: name,
        detail: `Table in ${schema}`,
      });
    }

    // Add qualified table name (always unique due to schema.table format)
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
      // Add column name (deduplicated)
      if (!seenLabels.has(column.name)) {
        seenLabels.add(column.name);
        completions.push({
          label: column.name,
          kind: MonacoCompletionItemKind.Field,
          insertText: column.name,
          detail: `Column`,
        });
      }

      // Add fully qualified column (always unique due to schema.table.column format)
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

// Function to safely register completion providers with Monaco
export const registerMonacoCompletionProvider = (
  monaco: any,
  completions: Omit<CompletionItem, 'range'>[],
  previousDisposable?: any
): any => {
  // Dispose previous provider if it exists
  if (previousDisposable) {
    try {
      previousDisposable.dispose();
    } catch (err) {
      console.error('Error disposing previous completion provider:', err);
    }
  }

  // Clear ALL existing completion providers for SQL to prevent duplicates
  try {
    // Get all existing providers for 'sql' language and dispose them
    const existingProviders = monaco?.languages?._completionProviders?.get?.('sql');
    if (existingProviders && Array.isArray(existingProviders)) {
      existingProviders.forEach((provider: any) => {
        try {
          if (provider && typeof provider.dispose === 'function') {
            provider.dispose();
          }
        } catch (err) {
          // Ignore disposal errors
        }
      });
      // Clear the array
      existingProviders.length = 0;
    }
  } catch (err) {
    // Ignore errors accessing internal Monaco structures
  }

  // Register new provider
  if (monaco?.languages && completions.length > 0) {
    return monaco.languages.registerCompletionItemProvider('sql', {
      provideCompletionItems: (model: any, position: any) => {
        const word = model.getWordUntilPosition(position);
        const range = {
          startLineNumber: position.lineNumber,
          endLineNumber: position.lineNumber,
          startColumn: word.startColumn,
          endColumn: word.endColumn,
        };

        const suggestions = completions.map((item) => ({
          ...item,
          range,
        }));

        return { suggestions };
      }
    });
  }

  return null;
};
