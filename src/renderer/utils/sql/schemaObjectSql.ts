/**
 * Dialect-aware SQL text generation for schema objects (schemas, tables,
 * views, columns) surfaced by the Data tree.
 *
 * Everything in this module is pure and side-effect free so it can be unit
 * tested without a DOM or Monaco. The generators only *produce* text — they
 * never execute anything.
 */

import type { SupportedConnectionTypes } from '../../../types/backend';

export type SqlDialect = SupportedConnectionTypes | string | undefined;

/** Minimal description of a table-like object in the tree. */
export type SchemaObjectRef = {
  schema: string;
  name: string;
  /** 'TABLE' | 'VIEW' | anything the connector reports. */
  type?: string;
  /** Column names, in ordinal order, when known. */
  columns?: string[];
};

type QuoteStyle = 'double' | 'backtick' | 'bracket';
type CaseFolding = 'lower' | 'upper' | 'none';
type LimitStyle = 'limit' | 'top' | 'fetch';

type DialectRules = {
  quote: QuoteStyle;
  folding: CaseFolding;
  limit: LimitStyle;
};

const DEFAULT_RULES: DialectRules = {
  quote: 'double',
  folding: 'none',
  limit: 'limit',
};

const DIALECT_RULES: Record<string, DialectRules> = {
  postgres: { quote: 'double', folding: 'lower', limit: 'limit' },
  redshift: { quote: 'double', folding: 'lower', limit: 'limit' },
  duckdb: { quote: 'double', folding: 'none', limit: 'limit' },
  ducklake: { quote: 'double', folding: 'none', limit: 'limit' },
  sqlite: { quote: 'double', folding: 'none', limit: 'limit' },
  kinetica: { quote: 'double', folding: 'none', limit: 'limit' },
  snowflake: { quote: 'double', folding: 'upper', limit: 'limit' },
  oracle: { quote: 'double', folding: 'upper', limit: 'fetch' },
  db2: { quote: 'double', folding: 'upper', limit: 'fetch' },
  mysql: { quote: 'backtick', folding: 'none', limit: 'limit' },
  bigquery: { quote: 'backtick', folding: 'none', limit: 'limit' },
  databricks: { quote: 'backtick', folding: 'none', limit: 'limit' },
  googlecloud: { quote: 'backtick', folding: 'none', limit: 'limit' },
  mssql: { quote: 'bracket', folding: 'none', limit: 'top' },
};

/**
 * Words that are reserved in most SQL dialects. An identifier matching one of
 * these is always quoted so generated SQL stays valid even for columns named
 * `order`, `user`, `date`, etc. The list is intentionally conservative — a
 * false positive only adds harmless quotes.
 */
const RESERVED_WORDS = new Set<string>([
  'all',
  'alter',
  'and',
  'any',
  'as',
  'asc',
  'between',
  'by',
  'case',
  'check',
  'column',
  'constraint',
  'create',
  'cross',
  'current',
  'date',
  'day',
  'default',
  'delete',
  'desc',
  'distinct',
  'drop',
  'else',
  'end',
  'exists',
  'foreign',
  'from',
  'full',
  'group',
  'having',
  'hour',
  'in',
  'index',
  'inner',
  'insert',
  'into',
  'is',
  'join',
  'key',
  'left',
  'like',
  'limit',
  'minute',
  'month',
  'natural',
  'not',
  'null',
  'offset',
  'on',
  'or',
  'order',
  'outer',
  'primary',
  'references',
  'right',
  'role',
  'row',
  'rows',
  'second',
  'select',
  'set',
  'table',
  'then',
  'time',
  'timestamp',
  'to',
  'top',
  'union',
  'unique',
  'update',
  'user',
  'using',
  'values',
  'view',
  'when',
  'where',
  'with',
  'year',
]);

const SIMPLE_IDENTIFIER = /^[A-Za-z_][A-Za-z0-9_]*$/;

export const getDialectRules = (dialect: SqlDialect): DialectRules =>
  (dialect && DIALECT_RULES[dialect]) || DEFAULT_RULES;

/**
 * True when `identifier` cannot be written bare in `dialect` without changing
 * its meaning: it contains characters outside `[A-Za-z0-9_]`, starts with a
 * digit, is a reserved word, or has a case that the dialect would fold away.
 */
export const needsQuoting = (
  identifier: string,
  dialect: SqlDialect,
): boolean => {
  if (!identifier) return false;
  if (!SIMPLE_IDENTIFIER.test(identifier)) return true;
  if (RESERVED_WORDS.has(identifier.toLowerCase())) return true;

  const { folding } = getDialectRules(dialect);
  if (folding === 'lower' && identifier !== identifier.toLowerCase()) {
    return true;
  }
  if (folding === 'upper' && identifier !== identifier.toUpperCase()) {
    return true;
  }
  return false;
};

const wrap = (identifier: string, style: QuoteStyle): string => {
  switch (style) {
    case 'backtick':
      return `\`${identifier.replace(/`/g, '``')}\``;
    case 'bracket':
      return `[${identifier.replace(/]/g, ']]')}]`;
    case 'double':
    default:
      return `"${identifier.replace(/"/g, '""')}"`;
  }
};

/**
 * Quote `identifier` for `dialect` only when necessary. Pass `{ force: true }`
 * to always quote.
 */
export const quoteIdentifier = (
  identifier: string,
  dialect: SqlDialect,
  options: { force?: boolean } = {},
): string => {
  if (!identifier) return identifier;
  if (!options.force && !needsQuoting(identifier, dialect)) return identifier;
  return wrap(identifier, getDialectRules(dialect).quote);
};

/** `schema.table`, with each part quoted as needed. Schema is optional. */
export const qualifiedName = (
  ref: Pick<SchemaObjectRef, 'schema' | 'name'>,
  dialect: SqlDialect,
  options: { includeSchema?: boolean } = {},
): string => {
  const includeSchema = options.includeSchema ?? true;
  const name = quoteIdentifier(ref.name, dialect);
  if (!includeSchema || !ref.schema) return name;
  return `${quoteIdentifier(ref.schema, dialect)}.${name}`;
};

/** `schema.table.column`, with each part quoted as needed. */
export const qualifiedColumnName = (
  ref: Pick<SchemaObjectRef, 'schema' | 'name'>,
  column: string,
  dialect: SqlDialect,
): string =>
  `${qualifiedName(ref, dialect)}.${quoteIdentifier(column, dialect)}`;

/** Comma-separated column list, each quoted as needed. */
export const formatColumnList = (
  columns: string[],
  dialect: SqlDialect,
  separator = ', ',
): string => columns.map((c) => quoteIdentifier(c, dialect)).join(separator);

const limitClause = (
  limit: number | null | undefined,
  style: LimitStyle,
): { selectPrefix: string; trailing: string } => {
  if (limit == null || limit <= 0) return { selectPrefix: '', trailing: '' };
  switch (style) {
    case 'top':
      return { selectPrefix: `TOP ${limit} `, trailing: '' };
    case 'fetch':
      return { selectPrefix: '', trailing: `\nFETCH FIRST ${limit} ROWS ONLY` };
    case 'limit':
    default:
      return { selectPrefix: '', trailing: `\nLIMIT ${limit}` };
  }
};

export type SelectOptions = {
  /** Row cap. `null` disables the clause. Defaults to 100. */
  limit?: number | null;
  /** Explicit column list. Omit (or pass an empty array) for `SELECT *`. */
  columns?: string[];
};

/**
 * `SELECT * FROM schema.table LIMIT n` (or the dialect's equivalent). With
 * `columns`, each column is listed on its own line.
 */
export const buildSelectStatement = (
  ref: SchemaObjectRef,
  dialect: SqlDialect,
  options: SelectOptions = {},
): string => {
  const { limit: style } = getDialectRules(dialect);
  const limit = options.limit === undefined ? 100 : options.limit;
  const { selectPrefix, trailing } = limitClause(limit, style);
  const columns = options.columns ?? [];

  // "SELECT" or "SELECT TOP 100"
  const head = `SELECT ${selectPrefix}`.trimEnd();
  const body =
    columns.length > 0
      ? `\n  ${formatColumnList(columns, dialect, ',\n  ')}`
      : ' *';

  return `${head}${body}\nFROM ${qualifiedName(ref, dialect)}${trailing};`;
};

/** `SELECT COUNT(*) AS total_rows FROM schema.table` */
export const buildCountStatement = (
  ref: SchemaObjectRef,
  dialect: SqlDialect,
): string =>
  `SELECT COUNT(*) AS total_rows\nFROM ${qualifiedName(ref, dialect)};`;

/**
 * `INSERT INTO schema.table (c1, c2) VALUES (?, ?)` with a comment naming each
 * placeholder. The `?` placeholders are deliberately not valid literals so an
 * unedited template fails loudly instead of inserting a row of NULLs.
 */
export const buildInsertTemplate = (
  ref: SchemaObjectRef,
  dialect: SqlDialect,
  columns: string[] = ref.columns ?? [],
): string => {
  const target = qualifiedName(ref, dialect);
  if (columns.length === 0) {
    return `INSERT INTO ${target}\nVALUES (?);`;
  }
  const values = columns
    .map((c, i) => {
      const isLast = i === columns.length - 1;
      return `  ?${isLast ? ' ' : ','} -- ${c}`;
    })
    .join('\n');
  return `INSERT INTO ${target} (${formatColumnList(columns, dialect)})\nVALUES (\n${values}\n);`;
};

/** `SELECT DISTINCT col FROM schema.table LIMIT n` */
export const buildSelectDistinctStatement = (
  ref: SchemaObjectRef,
  column: string,
  dialect: SqlDialect,
  limit: number | null = 100,
): string => {
  const { limit: style } = getDialectRules(dialect);
  const { selectPrefix, trailing } = limitClause(limit, style);
  return `SELECT DISTINCT ${selectPrefix}${quoteIdentifier(column, dialect)}\nFROM ${qualifiedName(ref, dialect)}${trailing};`;
};

/** `SELECT col, COUNT(*) ... GROUP BY col ORDER BY total_rows DESC` */
export const buildCountByColumnStatement = (
  ref: SchemaObjectRef,
  column: string,
  dialect: SqlDialect,
): string => {
  const col = quoteIdentifier(column, dialect);
  return `SELECT\n  ${col},\n  COUNT(*) AS total_rows\nFROM ${qualifiedName(ref, dialect)}\nGROUP BY ${col}\nORDER BY total_rows DESC;`;
};

/** Dialect-specific table rename. Never executed by this module. */
export const buildRenameTableStatement = (
  ref: SchemaObjectRef,
  newName: string,
  dialect: SqlDialect,
): string => {
  const from = qualifiedName(ref, dialect);
  switch (dialect) {
    case 'mysql':
      return `RENAME TABLE ${from} TO ${qualifiedName({ schema: ref.schema, name: newName }, dialect)};`;
    case 'mssql': {
      const source = ref.schema ? `${ref.schema}.${ref.name}` : ref.name;
      return `EXEC sp_rename '${source.replace(/'/g, "''")}', '${newName.replace(/'/g, "''")}';`;
    }
    default:
      return `ALTER TABLE ${from} RENAME TO ${quoteIdentifier(newName, dialect)};`;
  }
};

/** Dialect-specific column rename. Never executed by this module. */
export const buildRenameColumnStatement = (
  ref: SchemaObjectRef,
  oldColumn: string,
  newColumn: string,
  dialect: SqlDialect,
): string => {
  switch (dialect) {
    case 'mssql': {
      const source = [ref.schema, ref.name, oldColumn]
        .filter(Boolean)
        .join('.');
      return `EXEC sp_rename '${source.replace(/'/g, "''")}', '${newColumn.replace(/'/g, "''")}', 'COLUMN';`;
    }
    default:
      return `ALTER TABLE ${qualifiedName(ref, dialect)} RENAME COLUMN ${quoteIdentifier(oldColumn, dialect)} TO ${quoteIdentifier(newColumn, dialect)};`;
  }
};
