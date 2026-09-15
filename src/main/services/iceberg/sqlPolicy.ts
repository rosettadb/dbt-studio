import type { IcebergSqlStatementClass } from '../../../types/iceberg';

const reject = (): never => {
  throw new Error('ICEBERG_SQL_STATEMENT_REJECTED');
};

// Explicitly accepted pure functions. Unknown functions (including extension,
// file, introspection and dynamic-query functions) fail closed before binding.
const functions = new Set(
  `abs ceil ceiling floor round trunc sqrt pow power
exp ln log log10 sign greatest least coalesce nullif if ifnull upper lower length
char_length concat concat_ws substring substr trim ltrim rtrim replace reverse
left right starts_with ends_with contains like_escape ilike_escape regexp_matches
regexp_replace regexp_extract split_part string_split array_length list_extract
list_value struct_pack count sum avg min max median mode stddev stddev_pop
stddev_samp variance var_pop var_samp bool_and bool_or string_agg array_agg list
first last any_value arg_min arg_max count_star date_part date_trunc date_diff
 datediff date_add last_day make_date strftime strptime epoch year month day
hour minute second current_date current_timestamp now row_number rank dense_rank
percent_rank cume_dist ntile lag lead first_value last_value nth_value`.split(
    /\s+/,
  ),
);
const expressionClasses = new Set([
  'CONSTANT',
  'COLUMN_REF',
  'STAR',
  'FUNCTION',
  'WINDOW',
  'CAST',
  'COMPARISON',
  'CONJUNCTION',
  'OPERATOR',
  'CASE',
  'SUBQUERY',
  'BETWEEN',
  'COLLATE',
]);

/** Validate the native, unbound DuckDB SELECT AST, never a prepared query. */
export function validateIcebergSelectAst(ast: any): void {
  if (ast.error || ast.statements?.length !== 1) reject();
  const visit = (value: any, ctes: Set<string>): void => {
    if (!value || typeof value !== 'object') return;
    if (Array.isArray(value)) {
      value.forEach((child) => visit(child, ctes));
      return;
    }
    let scope = ctes;
    if (value.cte_map) {
      scope = new Set(ctes);
      (value.cte_map.map ?? []).forEach((entry: any) => {
        scope.add(String(entry.key).toLowerCase());
      });
    }
    if (value.type === 'BASE_TABLE') {
      const isCte =
        !value.catalog_name &&
        !value.schema_name &&
        scope.has(String(value.table_name).toLowerCase());
      if (
        !isCte &&
        (String(value.catalog_name).toLowerCase() !== 'iceberg' ||
          !value.schema_name ||
          !value.table_name)
      )
        reject();
    }
    if (
      'sample' in value &&
      'alias' in value &&
      !['BASE_TABLE', 'EMPTY', 'JOIN', 'SUBQUERY', 'EXPRESSION_LIST'].includes(
        value.type,
      )
    )
      reject();
    if (value.class && !expressionClasses.has(value.class)) reject();
    if (value.class === 'FUNCTION' || value.class === 'WINDOW') {
      const name = String(value.function_name).toLowerCase();
      const operator =
        value.class === 'FUNCTION' &&
        value.is_operator &&
        [
          '+',
          '-',
          '*',
          '/',
          '//',
          '%',
          '**',
          '~~',
          '!~~',
          '~~*',
          '!~~*',
          '||',
          '&',
          '|',
          '^',
          '<<',
          '>>',
        ].includes(name);
      if ((!operator && !functions.has(name)) || value.catalog || value.schema)
        reject();
    }
    Object.values(value).forEach((child) => visit(child, scope));
  };
  visit(ast.statements[0].node, new Set());
}

type Token = { text: string; word?: string; identifier?: string };
// Each lexer branch consumes a complete token before continuing.
/* eslint-disable no-continue */
function tokenize(sql: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  while (i < sql.length) {
    const rest = sql.slice(i);
    const whitespace = /^\s+/.exec(rest);
    if (whitespace) {
      i += whitespace[0].length;
      continue;
    }
    if (rest.startsWith('--')) {
      const end = sql.indexOf('\n', i + 2);
      i = end < 0 ? sql.length : end + 1;
      continue;
    }
    if (rest.startsWith('/*')) {
      let depth = 1;
      i += 2;
      while (depth && i < sql.length) {
        if (sql.slice(i, i + 2) === '/*') {
          depth += 1;
          i += 2;
        } else if (sql.slice(i, i + 2) === '*/') {
          depth -= 1;
          i += 2;
        } else i += 1;
      }
      if (depth) reject();
      continue;
    }
    const quoted = /^(?:'(?:[^']|'')*'|"(?:[^"]|"")*")/.exec(rest);
    if (quoted) {
      const text = quoted[0];
      tokens.push({
        text,
        ...(text[0] === '"'
          ? { identifier: text.slice(1, -1).replace(/""/g, '"') }
          : {}),
      });
      i += text.length;
      continue;
    }
    const word = /^[a-zA-Z_][a-zA-Z_0-9]*/.exec(rest);
    if (word) {
      tokens.push({
        text: word[0],
        word: word[0].toUpperCase(),
        identifier: word[0],
      });
      i += word[0].length;
      continue;
    }
    const other =
      /^(?:\d+(?:\.\d+)?(?:[eE][+-]?\d+)?|::|=>|<=|>=|<>|!=|\|\||[-+*/%=<>().,;[\]])/.exec(
        rest,
      );
    if (!other) reject();
    tokens.push({ text: other![0] });
    i += other![0].length;
  }
  if (tokens[tokens.length - 1]?.text === ';') tokens.pop();
  if (!tokens.length || tokens.some((token) => token.text === ';')) reject();
  return tokens;
}

/* eslint-enable no-continue */

/** Narrow mutation grammar; every expression/source is parsed by DuckDB as a
 * SELECT below. Unsupported syntax is rejected, never passed through unchecked. */
export function parseIcebergSql(sql: string): {
  statementClass: IcebergSqlStatementClass;
  selectSql?: string;
} {
  if (!sql.trim() || sql.length > 1_000_000)
    throw new Error('ICEBERG_SQL_INVALID');
  const t = tokenize(sql);
  const text = (tokens: Token[]) => tokens.map((token) => token.text).join(' ');
  let i = 0;
  const eat = (word: string) => {
    if (t[i]?.word !== word) reject();
    i += 1;
  };
  const group = (): Token[] => {
    if (t[i]?.text !== '(') reject();
    i += 1;
    const start = i;
    let depth = 1;
    while (i < t.length) {
      if (t[i].text === '(') depth += 1;
      if (t[i].text === ')') depth -= 1;
      if (!depth) {
        const content = t.slice(start, i);
        i += 1;
        return content;
      }
      i += 1;
    }
    return reject();
  };
  // Consume CTE declarations only to locate the main statement. The native
  // SELECT AST subsequently validates each CTE body and its relation scope.
  if (t[i]?.word === 'WITH') {
    i += 1;
    if (t[i]?.word === 'RECURSIVE') i += 1;
    do {
      if (!t[i]?.identifier) reject();
      i += 1;
      if (t[i]?.text === '(') group();
      eat('AS');
      if (t[i]?.word === 'NOT') i += 1;
      if (t[i]?.word === 'MATERIALIZED') i += 1;
      group();
      if (t[i]?.text !== ',') break;
      i += 1;
    } while (i < t.length);
  }
  const prefix = text(t.slice(0, i));
  const command = t[i]?.word;
  i += 1;
  const target = (parts: number): string => {
    const start = i;
    for (let n = 0; n < parts; n += 1) {
      if (!t[i]?.identifier) reject();
      if (n === 0 && t[i].identifier!.toLowerCase() !== 'iceberg') reject();
      i += 1;
      if (n < parts - 1) {
        if (t[i]?.text !== '.') reject();
        i += 1;
      }
    }
    return text(t.slice(start, i));
  };
  const select = (query: string, statementClass: IcebergSqlStatementClass) => ({
    statementClass,
    selectSql: `${prefix} ${query}`.trim(),
  });
  if (command === 'SELECT' || command === 'VALUES' || command === 'FROM') {
    return { statementClass: 'select', selectSql: text(t) };
  }
  if (command === 'INSERT') {
    eat('INTO');
    target(3);
    if (t[i]?.text === '(') {
      const columns = group();
      if (
        !columns.length ||
        columns.some((token, n) =>
          n % 2 === 0 ? !token.identifier : token.text !== ',',
        ) ||
        columns.length % 2 === 0
      )
        reject();
    }
    if (!['SELECT', 'WITH', 'VALUES', 'FROM'].includes(t[i]?.word ?? ''))
      reject();
    return select(text(t.slice(i)), 'insert');
  }
  if (command === 'DELETE') {
    eat('FROM');
    const table = target(3);
    if (i < t.length && t[i]?.word !== 'WHERE') reject();
    return select(`SELECT * FROM ${table} ${text(t.slice(i))}`, 'delete');
  }
  if (command === 'UPDATE') {
    const table = target(3);
    eat('SET');
    const expressions: Token[][] = [];
    while (i < t.length) {
      if (!t[i]?.identifier || t[i + 1]?.text !== '=') reject();
      i += 2;
      const start = i;
      let depth = 0;
      while (i < t.length) {
        if (!depth && (t[i].text === ',' || t[i].word === 'WHERE')) break;
        if (t[i].text === '(' || t[i].text === '[') depth += 1;
        if (t[i].text === ')' || t[i].text === ']') depth -= 1;
        if (depth < 0) reject();
        i += 1;
      }
      if (i === start || depth) reject();
      expressions.push(t.slice(start, i));
      if (t[i]?.text !== ',') break;
      i += 1;
    }
    if (!expressions.length) reject();
    return select(
      `SELECT ${expressions.map(text).join(', ')} FROM ${table} ${text(t.slice(i))}`,
      'update',
    );
  }
  if ((command === 'CREATE' || command === 'DROP') && !prefix) {
    const kind = t[i]?.word;
    i += 1;
    if (kind !== 'TABLE' && kind !== 'SCHEMA') reject();
    if (t[i]?.word === 'IF') {
      i += 1;
      if (command === 'CREATE') eat('NOT');
      eat('EXISTS');
    }
    target(kind === 'TABLE' ? 3 : 2);
    if (command === 'CREATE' && kind === 'TABLE') {
      if (t[i]?.word === 'AS') {
        i += 1;
        return select(text(t.slice(i)), 'create');
      }
      const columns = group();
      // Basic typed columns and primary keys only. Defaults, expression-based
      // constraints, custom types and generated columns require separate acceptance.
      const definition =
        /^(?:"(?:[^"]|"")*"|[a-z_][a-z_0-9]*)\s+(?:BOOLEAN|TINYINT|SMALLINT|INTEGER|INT|BIGINT|FLOAT|REAL|DOUBLE(?: PRECISION)?|VARCHAR|TEXT|STRING|BLOB|DATE|TIME|TIMESTAMP|TIMESTAMPTZ|UUID|DECIMAL(?:\s*\(\s*\d+\s*,\s*\d+\s*\))?)(?:\s+NOT\s+NULL)?(?:\s+PRIMARY\s+KEY)?$/i;
      const definitions: Token[][] = [[]];
      let depth = 0;
      columns.forEach((token) => {
        if (token.text === '(') depth += 1;
        if (token.text === ')') depth -= 1;
        if (!depth && token.text === ',') definitions.push([]);
        else definitions[definitions.length - 1].push(token);
      });
      if (definitions.some((column) => !definition.test(text(column))))
        reject();
    }
    if (i !== t.length) reject();
    return { statementClass: command === 'CREATE' ? 'create' : 'drop' };
  }
  return reject();
}
