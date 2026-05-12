import type * as monaco from 'monaco-editor';

type Monaco = typeof monaco;

/**
 * Register the `jinja-sql` language — Monaco's `sql` Monarch tokenizer
 * extended with dbt-style Jinja delimiters (`{{ }}`, `{% %}`, `{# #}`)
 * and dbt macro tokens. Idempotent.
 */
export function registerJinjaSqlLanguage(monacoNs: Monaco): void {
  if (monacoNs.languages.getLanguages().some((l) => l.id === 'jinja-sql')) {
    return;
  }

  monacoNs.languages.register({ id: 'jinja-sql' });

  monacoNs.languages.setLanguageConfiguration('jinja-sql', {
    comments: { lineComment: '--', blockComment: ['{#', '#}'] },
    brackets: [
      ['{', '}'],
      ['[', ']'],
      ['(', ')'],
    ],
    autoClosingPairs: [
      { open: '{', close: '}' },
      { open: '{{', close: '}}' },
      { open: '{%', close: '%}' },
      { open: '{#', close: '#}' },
      { open: '(', close: ')' },
      { open: '[', close: ']' },
      { open: "'", close: "'", notIn: ['string', 'comment'] },
      { open: '"', close: '"', notIn: ['string', 'comment'] },
    ],
    surroundingPairs: [
      { open: '{', close: '}' },
      { open: '{{', close: '}}' },
      { open: '{%', close: '%}' },
      { open: '{#', close: '#}' },
      { open: '[', close: ']' },
      { open: '(', close: ')' },
      { open: "'", close: "'" },
      { open: '"', close: '"' },
    ],
  });

  monacoNs.languages.setMonarchTokensProvider('jinja-sql', {
    ignoreCase: true,
    defaultToken: 'source',
    tokenPostfix: '.jinja-sql',
    keywords: [
      'SELECT',
      'FROM',
      'WHERE',
      'JOIN',
      'LEFT',
      'RIGHT',
      'INNER',
      'OUTER',
      'ON',
      'AS',
      'AND',
      'OR',
      'NOT',
      'IN',
      'IS',
      'NULL',
      'LIKE',
      'UNION',
      'ALL',
      'DISTINCT',
      'GROUP',
      'BY',
      'ORDER',
      'HAVING',
      'LIMIT',
      'WITH',
      'CASE',
      'WHEN',
      'THEN',
      'ELSE',
      'END',
      'CAST',
      'OVER',
      'PARTITION',
      'TRUE',
      'FALSE',
      'COALESCE',
      'NULLIF',
    ],
    dbtMacros: [
      'ref',
      'source',
      'config',
      'doc',
      'var',
      'env_var',
      'run_query',
      'log',
      'this',
      'adapter',
      'execute',
      'is_incremental',
    ],
    jinjaKeywords: [
      'if',
      'else',
      'elif',
      'endif',
      'for',
      'endfor',
      'macro',
      'endmacro',
      'set',
    ],
    tokenizer: {
      root: [
        [/\{#/, 'comment.jinja', '@jinjaComment'],
        [/\{\{-?/, 'delimiter.jinja', '@jinjaExpr'],
        [/\{%-?/, 'delimiter.jinja', '@jinjaStmt'],
        [/--.*$/, 'comment'],
        [/'/, 'string', '@stringSingle'],
        [/"/, 'string', '@stringDouble'],
        [/\d+\.?\d*/, 'number'],
        [
          /[a-zA-Z_]\w*/,
          { cases: { '@keywords': 'keyword', '@default': 'identifier' } },
        ],
        [/[,;.]/, 'delimiter'],
        [/[()[\]{}]/, '@brackets'],
        [/\s+/, 'white'],
      ],
      jinjaComment: [
        [/-?#\}/, 'comment.jinja', '@pop'],
        [/./, 'comment.jinja'],
      ],
      jinjaExpr: [
        [/-?\}\}/, 'delimiter.jinja', '@pop'],
        [
          /[a-zA-Z_]\w*/,
          {
            cases: {
              '@dbtMacros': 'keyword.dbt',
              '@default': 'variable.jinja',
            },
          },
        ],
        [/'[^']*'/, 'string.jinja'],
        [/"[^"]*"/, 'string.jinja'],
        [/\d+/, 'number.jinja'],
        [/[|.,]/, 'delimiter.jinja'],
        [/[()[\]]/, '@brackets'],
        [/\s+/, 'white'],
      ],
      jinjaStmt: [
        [/-?%\}/, 'delimiter.jinja', '@pop'],
        [
          /[a-zA-Z_]\w*/,
          {
            cases: {
              '@dbtMacros': 'keyword.dbt',
              '@jinjaKeywords': 'keyword.jinja',
              '@default': 'variable.jinja',
            },
          },
        ],
        [/'[^']*'/, 'string.jinja'],
        [/"[^"]*"/, 'string.jinja'],
        [/\s+/, 'white'],
      ],
      stringSingle: [
        [/[^']+/, 'string'],
        [/''/, 'string.escape'],
        [/'/, 'string', '@pop'],
      ],
      stringDouble: [
        [/[^"]+/, 'string'],
        [/""/, 'string.escape'],
        [/"/, 'string', '@pop'],
      ],
    },
  });
}
