import {
  clearSqlSchemaCompletions,
  collectTableAliases,
  getSqlSchemaCompletions,
  provideSqlSchemaCompletions,
  registerSqlSchemaCompletions,
  resetSqlSchemaCompletions,
  setSqlSchemaCompletions,
  type SqlCompletionItem,
} from '../../../../src/renderer/lib/monaco/completions/sqlSchema';
import type { Table } from '../../../../src/types/backend';

const column = (name: string, typeName = 'integer') => ({
  name,
  typeName,
  ordinalPosition: 1,
  primaryKeySequenceId: 0,
  columnDisplaySize: 0,
  scale: 0,
  precision: 0,
  columnProperties: [],
  autoincrement: false,
  primaryKey: false,
  nullable: true,
});

const tables: Table[] = [
  {
    name: 'orders',
    type: 'TABLE',
    schema: 'sales',
    columns: [column('id'), column('total', 'numeric')],
  },
  {
    name: 'customers',
    type: 'TABLE',
    schema: 'crm',
    columns: [column('id'), column('email', 'text')],
  },
  {
    name: 'orders_v',
    type: 'VIEW',
    schema: 'sales',
    columns: [column('id')],
  },
];

const items: SqlCompletionItem[] = [
  { label: 'SELECT', kind: 14, insertText: 'SELECT' },
  { label: 'sales', kind: 9, insertText: 'sales' },
  { label: 'orders', kind: 22, insertText: 'orders' },
  { label: 'total', kind: 5, insertText: 'total' },
];

/** Single-line fake model: `text` is the full content, cursor at its end. */
const modelAt = (text: string, fullText = text) => {
  const beforeCursor = text;
  const wordMatch = /[\w$]*$/.exec(beforeCursor);
  const wordStart = beforeCursor.length - (wordMatch?.[0].length ?? 0) + 1;
  return {
    model: {
      getWordUntilPosition: () => ({
        word: wordMatch?.[0] ?? '',
        startColumn: wordStart,
        endColumn: beforeCursor.length + 1,
      }),
      getValueInRange: (range: { startColumn: number; endColumn: number }) =>
        beforeCursor.slice(range.startColumn - 1, range.endColumn - 1),
      getValue: () => fullText,
    },
    position: { lineNumber: 1, column: beforeCursor.length + 1 },
  };
};

const labels = (list: { suggestions: { label: unknown }[] }) =>
  list.suggestions.map((s) => s.label);

describe('collectTableAliases', () => {
  it('maps aliases and bare names to table refs', () => {
    const aliases = collectTableAliases(
      'SELECT * FROM sales.orders o JOIN crm.customers AS c ON c.id = o.id WHERE o.total > 1',
    );
    expect(aliases.get('o')).toEqual({ schema: 'sales', name: 'orders' });
    expect(aliases.get('c')).toEqual({ schema: 'crm', name: 'customers' });
    expect(aliases.get('orders')).toEqual({ schema: 'sales', name: 'orders' });
    expect(aliases.get('customers')).toEqual({
      schema: 'crm',
      name: 'customers',
    });
  });

  it('does not treat keywords as aliases and handles quoted names', () => {
    const aliases = collectTableAliases(
      'SELECT * FROM "sales"."orders" WHERE 1 = 1 JOIN `crm`.`customers` ON 1 = 1',
    );
    expect(aliases.get('where')).toBeUndefined();
    expect(aliases.get('on')).toBeUndefined();
    expect(aliases.get('orders')).toEqual({ schema: 'sales', name: 'orders' });
    expect(aliases.get('customers')).toEqual({
      schema: 'crm',
      name: 'customers',
    });
  });
});

describe('provideSqlSchemaCompletions', () => {
  const entry = { items, tables };

  it('returns every item unchanged when there is no context', () => {
    const { model, position } = modelAt('sel');
    const result = provideSqlSchemaCompletions(model, position, entry);

    expect(labels(result)).toEqual(['SELECT', 'sales', 'orders', 'total']);
    expect(result.suggestions[0].sortText).toBeUndefined();
    expect(result.suggestions[0].range).toEqual({
      startLineNumber: 1,
      endLineNumber: 1,
      startColumn: 1,
      endColumn: 4,
    });
  });

  it('lists columns after an alias dot', () => {
    const sql = 'SELECT o. FROM sales.orders o';
    const { model, position } = modelAt('SELECT o.', sql);
    const result = provideSqlSchemaCompletions(model, position, entry);

    expect(labels(result)).toEqual(['id', 'total']);
    expect(result.suggestions[1].detail).toBe('numeric · sales.orders');
    expect(result.suggestions[1].kind).toBe(5);
  });

  it('lists columns after a bare table name dot', () => {
    const { model, position } = modelAt('SELECT customers.');
    expect(labels(provideSqlSchemaCompletions(model, position, entry))).toEqual(
      ['id', 'email'],
    );
  });

  it('lists columns after schema.table dot', () => {
    const { model, position } = modelAt('SELECT sales.orders_v.');
    expect(labels(provideSqlSchemaCompletions(model, position, entry))).toEqual(
      ['id'],
    );
  });

  it('lists tables after a schema dot', () => {
    const { model, position } = modelAt('SELECT * FROM sales.');
    const result = provideSqlSchemaCompletions(model, position, entry);
    expect(labels(result)).toEqual(['orders', 'orders_v']);
    expect(result.suggestions[1].detail).toBe('View');
  });

  it('falls back to the full list for an unknown qualifier', () => {
    const { model, position } = modelAt('SELECT nope.');
    expect(labels(provideSqlSchemaCompletions(model, position, entry))).toEqual(
      ['SELECT', 'sales', 'orders', 'total'],
    );
  });

  it('prioritises tables after FROM and columns after SELECT', () => {
    const from = modelAt('SELECT * FROM ');
    const fromResult = provideSqlSchemaCompletions(
      from.model,
      from.position,
      entry,
    );
    const sortOf = (
      result: { suggestions: { label: unknown; sortText?: string }[] },
      label: string,
    ) => result.suggestions.find((s) => s.label === label)?.sortText;

    expect(sortOf(fromResult, 'orders')).toBe('0orders');
    expect(sortOf(fromResult, 'sales')).toBe('0sales');
    expect(sortOf(fromResult, 'total')).toBe('1total');
    expect(sortOf(fromResult, 'SELECT')).toBe('1SELECT');

    const select = modelAt('SELECT ');
    const selectResult = provideSqlSchemaCompletions(
      select.model,
      select.position,
      entry,
    );
    expect(sortOf(selectResult, 'total')).toBe('0total');
    expect(sortOf(selectResult, 'orders')).toBe('1orders');

    // Still nothing is dropped
    expect(fromResult.suggestions).toHaveLength(items.length);
    expect(selectResult.suggestions).toHaveLength(items.length);
  });

  it('ignores dotted context without a table list', () => {
    const { model, position } = modelAt('SELECT o.');
    expect(
      labels(provideSqlSchemaCompletions(model, position, { items })),
    ).toEqual(['SELECT', 'sales', 'orders', 'total']);
  });
});

describe('registry + registerSqlSchemaCompletions', () => {
  beforeEach(() => resetSqlSchemaCompletions());

  it('stores entries per model id', () => {
    setSqlSchemaCompletions('m1', { items });
    expect(getSqlSchemaCompletions('m1')?.items).toBe(items);
    clearSqlSchemaCompletions('m1');
    expect(getSqlSchemaCompletions('m1')).toBeUndefined();
  });

  it('registers one provider for sql that reads from the registry', () => {
    const register = jest.fn().mockReturnValue({ dispose: jest.fn() });
    const monacoNs = {
      languages: { registerCompletionItemProvider: register },
    } as any;

    const first = registerSqlSchemaCompletions(monacoNs);
    const second = registerSqlSchemaCompletions(monacoNs);
    expect(first).toBe(second);
    expect(register).toHaveBeenCalledTimes(1);
    expect(register.mock.calls[0][0]).toBe('sql');

    const provider = register.mock.calls[0][1];
    expect(provider.triggerCharacters).toEqual(['.']);

    const { model, position } = modelAt('sel');
    const unknownModel = { ...model, id: 'unknown' };
    expect(provider.provideCompletionItems(unknownModel, position)).toEqual({
      suggestions: [],
    });

    setSqlSchemaCompletions('known', { items });
    const knownModel = { ...model, id: 'known' };
    expect(
      labels(provider.provideCompletionItems(knownModel, position)),
    ).toEqual(['SELECT', 'sales', 'orders', 'total']);
  });
});
