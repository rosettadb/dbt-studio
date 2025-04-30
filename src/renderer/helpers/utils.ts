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

export const splitPath = (path: string, projectName: string) => {
  const paths = path.split(`${projectName}/`);

  if (paths.length > 2) {
    return `${projectName}/${paths[1].trim()}/${projectName}/${paths[2]}`;
  }
  return `${projectName}/${paths[1]}`;
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

export const generateMonacoCompletions = (
  tables: Table[],
): Omit<CompletionItem, 'range'>[] => {
  const completions: Omit<CompletionItem, 'range'>[] = [];

  MonacoAutocompleteSQLKeywords.forEach((keyword) => {
    completions.push({
      label: keyword,
      kind: MonacoCompletionItemKind.Keyword,
      insertText: keyword,
      detail: 'SQL keyword',
    });
  });

  tables.forEach((table) => {
    const { schema, name, columns = [] } = table;

    completions.push({
      label: schema,
      kind: MonacoCompletionItemKind.Module,
      insertText: schema,
      detail: 'Schema',
    });

    completions.push({
      label: name,
      kind: MonacoCompletionItemKind.Struct,
      insertText: name,
      detail: `Table in ${schema}`,
    });

    completions.push({
      label: `${schema}.${name}`,
      kind: MonacoCompletionItemKind.Struct,
      insertText: `${schema}.${name}`,
      detail: 'Qualified table name',
    });

    columns.forEach((column) => {
      completions.push({
        label: column.name,
        kind: MonacoCompletionItemKind.Field,
        insertText: column.name,
        detail: `Column in ${name}`,
      });

      completions.push({
        label: `${schema}.${name}.${column.name}`,
        kind: MonacoCompletionItemKind.Value,
        insertText: `${schema}.${name}.${column.name}`,
        detail: 'Fully qualified column',
      });
    });
  });

  return completions;
};
