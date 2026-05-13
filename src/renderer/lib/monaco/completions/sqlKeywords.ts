import type * as monaco from 'monaco-editor';

type Monaco = typeof monaco;

const SQL_KEYWORDS = [
  // DML
  'SELECT',
  'FROM',
  'WHERE',
  'JOIN',
  'LEFT JOIN',
  'RIGHT JOIN',
  'INNER JOIN',
  'FULL OUTER JOIN',
  'CROSS JOIN',
  'ON',
  'AS',
  'WITH',
  'UNION',
  'UNION ALL',
  'INTERSECT',
  'EXCEPT',
  'INSERT INTO',
  'VALUES',
  'UPDATE',
  'SET',
  'DELETE FROM',
  // Clauses
  'GROUP BY',
  'ORDER BY',
  'HAVING',
  'LIMIT',
  'OFFSET',
  'DISTINCT',
  'ALL',
  'PARTITION BY',
  'OVER',
  'ROWS BETWEEN',
  'RANGE BETWEEN',
  'UNBOUNDED PRECEDING',
  'CURRENT ROW',
  'UNBOUNDED FOLLOWING',
  // Logic
  'AND',
  'OR',
  'NOT',
  'IN',
  'NOT IN',
  'EXISTS',
  'NOT EXISTS',
  'IS NULL',
  'IS NOT NULL',
  'LIKE',
  'ILIKE',
  'NOT LIKE',
  'BETWEEN',
  'CASE',
  'WHEN',
  'THEN',
  'ELSE',
  'END',
  // DDL
  'CREATE TABLE',
  'CREATE VIEW',
  'DROP TABLE',
  'DROP VIEW',
  'ALTER TABLE',
  'ADD COLUMN',
  'DROP COLUMN',
  // Values
  'TRUE',
  'FALSE',
  'NULL',
];

const SQL_FUNCTIONS = [
  // Aggregates
  'COUNT',
  'COUNT_IF',
  'SUM',
  'AVG',
  'MIN',
  'MAX',
  'COUNT_DISTINCT',
  'APPROX_COUNT_DISTINCT',
  'LISTAGG',
  'ARRAY_AGG',
  'STRING_AGG',
  'GROUP_CONCAT',
  // Window
  'ROW_NUMBER',
  'RANK',
  'DENSE_RANK',
  'PERCENT_RANK',
  'CUME_DIST',
  'NTILE',
  'LAG',
  'LEAD',
  'FIRST_VALUE',
  'LAST_VALUE',
  'NTH_VALUE',
  // String
  'CONCAT',
  'CONCAT_WS',
  'SUBSTR',
  'SUBSTRING',
  'LEFT',
  'RIGHT',
  'UPPER',
  'LOWER',
  'TRIM',
  'LTRIM',
  'RTRIM',
  'REPLACE',
  'SPLIT_PART',
  'LENGTH',
  'CHAR_LENGTH',
  'POSITION',
  'REGEXP_REPLACE',
  'REGEXP_EXTRACT',
  'REGEXP_LIKE',
  'INITCAP',
  'REPEAT',
  'LPAD',
  'RPAD',
  // Numeric
  'ROUND',
  'FLOOR',
  'CEIL',
  'CEILING',
  'ABS',
  'MOD',
  'POWER',
  'SQRT',
  'LOG',
  'LN',
  'EXP',
  'SIGN',
  'TRUNC',
  'RANDOM',
  // Date / Time
  'NOW',
  'CURRENT_DATE',
  'CURRENT_TIMESTAMP',
  'CURRENT_TIME',
  'DATE_TRUNC',
  'DATE_PART',
  'DATE_DIFF',
  'DATEADD',
  'DATEDIFF',
  'EXTRACT',
  'TO_DATE',
  'TO_TIMESTAMP',
  'TO_CHAR',
  'TIMESTAMP_ADD',
  'TIMESTAMP_DIFF',
  'DATETIME_TRUNC',
  'FORMAT_DATE',
  'FORMAT_TIMESTAMP',
  'YEAR',
  'MONTH',
  'DAY',
  'HOUR',
  'MINUTE',
  'SECOND',
  'QUARTER',
  'DAYOFWEEK',
  'DAYOFYEAR',
  'WEEK',
  'WEEKOFYEAR',
  // Conditional / Null
  'COALESCE',
  'NULLIF',
  'NVL',
  'NVL2',
  'IFF',
  'IIF',
  'IF',
  'IFNULL',
  'ZEROIFNULL',
  'DECODE',
  'GREATEST',
  'LEAST',
  // Type conversion
  'CAST',
  'TRY_CAST',
  'CONVERT',
  'TO_NUMBER',
  'TO_DECIMAL',
  'TO_VARCHAR',
  'TO_BOOLEAN',
  // Array / Object
  'ARRAY_LENGTH',
  'ARRAY_CONTAINS',
  'ARRAY_SLICE',
  'ARRAY_CONSTRUCT',
  'ARRAY_POSITION',
  'ARRAY_DISTINCT',
  'ARRAY_COMPACT',
  'ARRAY_FLATTEN',
  'OBJECT_CONSTRUCT',
  'OBJECT_KEYS',
  'OBJECT_VALUES',
  'JSON_EXTRACT_PATH_TEXT',
  'JSON_EXTRACT',
  'PARSE_JSON',
  // Hash
  'MD5',
  'SHA1',
  'SHA2',
  'HASH',
  // Misc
  'GENERATE_SERIES',
  'RANGE',
  'UNNEST',
  'FLATTEN',
  'LATERAL',
  'QUALIFY',
  'SAMPLE',
  'TABLESAMPLE',
];

/**
 * Register a `jinja-sql` completion provider that suggests common SQL
 * keywords and built-in functions. Skips firing inside Jinja blocks
 * (`{{ }}` / `{% %}`) — the dbt provider handles those.
 */
export const registerSqlKeywordCompletions = (monacoNs: Monaco): void => {
  monacoNs.languages.registerCompletionItemProvider('jinja-sql', {
    provideCompletionItems: (model, position) => {
      const lineUntilCursor = model.getValueInRange({
        startLineNumber: position.lineNumber,
        startColumn: 1,
        endLineNumber: position.lineNumber,
        endColumn: position.column,
      });

      // Skip keyword suggestions inside Jinja blocks — the dbt provider
      // handles those.
      const insideJinja =
        lineUntilCursor.lastIndexOf('{{') > lineUntilCursor.lastIndexOf('}}') ||
        lineUntilCursor.lastIndexOf('{%') > lineUntilCursor.lastIndexOf('%}');
      if (insideJinja) return { suggestions: [] };

      const wordInfo = model.getWordUntilPosition(position);
      const typed = wordInfo.word.toUpperCase();
      const range = {
        startLineNumber: position.lineNumber,
        endLineNumber: position.lineNumber,
        startColumn: wordInfo.startColumn,
        endColumn: wordInfo.endColumn,
      };

      const kwKind = monacoNs.languages.CompletionItemKind.Keyword;
      const fnKind = monacoNs.languages.CompletionItemKind.Function;

      const keywords = SQL_KEYWORDS.filter(
        (kw) => !typed || kw.startsWith(typed),
      ).map((kw) => ({
        label: kw,
        kind: kwKind,
        insertText: kw,
        detail: 'SQL keyword',
        sortText: `0_${kw}`,
        range,
      }));

      const functions = SQL_FUNCTIONS.filter(
        (fn) => !typed || fn.startsWith(typed),
      ).map((fn) => ({
        label: fn,
        kind: fnKind,
        insertText: `${fn}($0)`,
        insertTextRules:
          monacoNs.languages.CompletionItemInsertTextRule.InsertAsSnippet,
        detail: 'SQL function',
        sortText: `1_${fn}`,
        range,
      }));

      return { suggestions: [...keywords, ...functions] };
    },
  });
};
