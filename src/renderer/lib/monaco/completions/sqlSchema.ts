/**
 * Schema-driven completions for the plain `sql` language (SQL editor and
 * notebook SQL cells).
 *
 * One provider is registered globally; each editor publishes its own
 * completion items (and, optionally, the raw table list) into a registry
 * keyed by Monaco model id. This replaces the previous per-editor providers,
 * which were registered on the same global language id and produced
 * duplicated suggestions once both the SQL editor and a notebook had been
 * opened.
 *
 * With a table list available the provider is also context aware:
 *  - `alias.` / `table.`  → columns of that table
 *  - `schema.`            → tables in that schema
 *  - after FROM/JOIN/...  → tables and schemas sort first
 *  - after SELECT/WHERE/… → columns sort first
 * Everything else returns the full item list exactly as before, so nothing
 * users could complete previously disappears.
 *
 * Only type imports from `monaco-editor` so the logic is unit-testable.
 */

import type * as monaco from 'monaco-editor';
import type { Table } from '../../../../types/backend';

type Monaco = typeof monaco;

export type SqlCompletionItem = Omit<monaco.languages.CompletionItem, 'range'>;

export type SqlSchemaCompletionEntry = {
  items: SqlCompletionItem[];
  tables?: Table[];
};

export type CompletionModelLike = Pick<
  monaco.editor.ITextModel,
  'getWordUntilPosition' | 'getValueInRange' | 'getValue'
>;

// monaco.languages.CompletionItemKind values (kept local to avoid a runtime
// import of the Monaco bundle).
const KIND = {
  Module: 9,
  Struct: 22,
  Field: 5,
  Value: 12,
} as const;

const registry = new Map<string, SqlSchemaCompletionEntry>();

export const setSqlSchemaCompletions = (
  modelId: string,
  entry: SqlSchemaCompletionEntry,
): void => {
  registry.set(modelId, entry);
};

export const clearSqlSchemaCompletions = (modelId: string): void => {
  registry.delete(modelId);
};

export const getSqlSchemaCompletions = (
  modelId: string,
): SqlSchemaCompletionEntry | undefined => registry.get(modelId);

/** Test helper. */
export const resetSqlSchemaCompletions = (): void => registry.clear();

// --- context detection -----------------------------------------------------

const TABLE_CONTEXT =
  /\b(FROM|JOIN|INTO|UPDATE|TABLE|VIEW|TRUNCATE|DESCRIBE|DESC)\s+$/i;
const COLUMN_CONTEXT =
  /\b(SELECT|WHERE|AND|OR|ON|BY|HAVING|SET|DISTINCT|WHEN|THEN|ELSE|RETURNING)\s+$|,\s*$|\(\s*$/i;

// "double quoted" | `backtick quoted` | [bracketed] | bare identifier
const IDENT = `(?:"[^"]+"|\`[^\`]+\`|\\[[^\\]]+\\]|[A-Za-z_][\\w$]*)`;
const DOTTED_ONE = new RegExp(`(${IDENT})\\s*\\.\\s*$`);
const DOTTED_TWO = new RegExp(`(${IDENT})\\s*\\.\\s*(${IDENT})\\s*\\.\\s*$`);

const NOT_ALIASES = new Set([
  'as',
  'cross',
  'except',
  'fetch',
  'full',
  'group',
  'having',
  'inner',
  'intersect',
  'join',
  'left',
  'limit',
  'natural',
  'offset',
  'on',
  'order',
  'outer',
  'qualify',
  'right',
  'set',
  'union',
  'using',
  'where',
  'window',
  'with',
]);

const unquote = (identifier: string): string =>
  identifier.replace(/^["`[]/, '').replace(/["`\]]$/, '');

export type TableRef = { schema?: string; name: string };

/**
 * Collect `FROM x AS a` / `JOIN s.t b` aliases from a SQL text. Keys are
 * lower-cased aliases; bare table names are also keyed so `orders.` resolves
 * without an alias.
 */
export const collectTableAliases = (sql: string): Map<string, TableRef> => {
  const aliases = new Map<string, TableRef>();
  const re = new RegExp(
    String.raw`\b(?:FROM|JOIN|UPDATE|INTO)\s+((?:${IDENT}\s*\.\s*)*${IDENT})(?:\s+(?:AS\s+)?([A-Za-z_][\w$]*))?`,
    'gi',
  );

  let match: RegExpExecArray | null;
  // eslint-disable-next-line no-cond-assign
  while ((match = re.exec(sql)) !== null) {
    const parts = match[1].split('.').map((p) => unquote(p.trim()));
    const name = parts[parts.length - 1];
    const schema = parts.length > 1 ? parts[parts.length - 2] : undefined;
    const ref: TableRef = { schema, name };

    aliases.set(name.toLowerCase(), ref);
    const alias = match[2];
    if (alias && !NOT_ALIASES.has(alias.toLowerCase())) {
      aliases.set(alias.toLowerCase(), ref);
    }
  }
  return aliases;
};

const findTable = (tables: Table[], ref: TableRef): Table | undefined => {
  const name = ref.name.toLowerCase();
  const schema = ref.schema?.toLowerCase();
  const byName = tables.filter((t) => t.name.toLowerCase() === name);
  if (schema) {
    return byName.find((t) => t.schema.toLowerCase() === schema) ?? byName[0];
  }
  return byName[0];
};

const labelOf = (item: SqlCompletionItem): string =>
  typeof item.label === 'string' ? item.label : item.label.label;

const prioritise =
  (kinds: readonly number[]) =>
  (item: SqlCompletionItem): SqlCompletionItem => ({
    ...item,
    sortText: `${kinds.includes(item.kind) ? '0' : '1'}${labelOf(item)}`,
  });

/**
 * Pure completion logic. `entry` is the registry entry for the model.
 */
export const provideSqlSchemaCompletions = (
  model: CompletionModelLike,
  position: monaco.IPosition,
  entry: SqlSchemaCompletionEntry,
): monaco.languages.CompletionList => {
  const word = model.getWordUntilPosition(position);
  const range: monaco.IRange = {
    startLineNumber: position.lineNumber,
    endLineNumber: position.lineNumber,
    startColumn: word.startColumn,
    endColumn: word.endColumn,
  };
  const lineBefore = model.getValueInRange({
    startLineNumber: position.lineNumber,
    startColumn: 1,
    endLineNumber: position.lineNumber,
    endColumn: word.startColumn,
  });

  const withRange = (
    items: SqlCompletionItem[],
  ): monaco.languages.CompletionItem[] => items.map((i) => ({ ...i, range }));

  const tables = entry.tables ?? [];

  // `x.` — resolve x as alias, table or schema.
  const dotted = DOTTED_ONE.exec(lineBefore);
  if (dotted && tables.length > 0) {
    const qualifier = unquote(dotted[1]);
    let table: Table | undefined;

    const twoLevel = DOTTED_TWO.exec(lineBefore);
    if (twoLevel) {
      table = findTable(tables, {
        schema: unquote(twoLevel[1]),
        name: unquote(twoLevel[2]),
      });
    }
    if (!table) {
      const alias = collectTableAliases(model.getValue()).get(
        qualifier.toLowerCase(),
      );
      if (alias) table = findTable(tables, alias);
    }
    if (!table) {
      table = findTable(tables, { name: qualifier });
    }

    if (table) {
      const owner = `${table.schema ? `${table.schema}.` : ''}${table.name}`;
      return {
        suggestions: table.columns.map((column) => ({
          label: column.name,
          kind: KIND.Field,
          insertText: column.name,
          detail: column.typeName
            ? `${column.typeName} · ${owner}`
            : `Column of ${owner}`,
          sortText: `0${column.name}`,
          range,
        })),
      };
    }

    const inSchema = tables.filter(
      (t) => t.schema.toLowerCase() === qualifier.toLowerCase(),
    );
    if (inSchema.length > 0) {
      return {
        suggestions: inSchema.map((t) => ({
          label: t.name,
          kind: KIND.Struct,
          insertText: t.name,
          detail: t.type === 'VIEW' ? 'View' : 'Table',
          sortText: `0${t.name}`,
          range,
        })),
      };
    }
    // Unknown qualifier: fall through to the full list.
  }

  if (TABLE_CONTEXT.test(lineBefore)) {
    return {
      suggestions: withRange(
        entry.items.map(prioritise([KIND.Struct, KIND.Module])),
      ),
    };
  }
  if (COLUMN_CONTEXT.test(lineBefore)) {
    return {
      suggestions: withRange(
        entry.items.map(prioritise([KIND.Field, KIND.Value])),
      ),
    };
  }

  return { suggestions: withRange(entry.items) };
};

let disposable: monaco.IDisposable | null = null;

/**
 * Register the single `sql` completion provider. Idempotent.
 */
export const registerSqlSchemaCompletions = (
  monacoNs: Monaco,
): monaco.IDisposable => {
  if (disposable) return disposable;
  disposable = monacoNs.languages.registerCompletionItemProvider('sql', {
    triggerCharacters: ['.'],
    provideCompletionItems: (model, position) => {
      const entry = registry.get(model.id);
      if (!entry) return { suggestions: [] };
      return provideSqlSchemaCompletions(model, position, entry);
    },
  });
  return disposable;
};
