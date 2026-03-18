import MonacoEditor, { OnChange } from '@monaco-editor/react';
import React, { useEffect, useRef } from 'react';
import { Shimmer } from '../shimmer';
import { getDecorations } from './helpers';
import {
  IDisposable,
  IEditorDecorationsCollection,
  IMonaco,
  IStandaloneCodeEditor,
} from '../../../types/editor';
import { registerJinjaSqlLanguage } from './jinjaSqlLanguage';
import { languageIntelligenceService } from '../../services';

// Module-level disposable for the static SQL keyword provider.
// Monaco's registerCompletionItemProvider is GLOBAL, so we guard it here
// to avoid duplicate registrations across tab re-mounts.
let sqlKeywordProviderDisposable: IDisposable | null = null;
let yamlProviderDisposable: IDisposable | null = null;

// Returns partial name typed after ref(' or ref("
const getRefContext = (line: string) => {
  const m = line.match(/\bref\(\s*(['"]?)([^'")\s]*)$/);
  return m ? { kind: 'ref' as const, partial: m[2] } : null;
};

// Returns { sourceName } when inside source('srcName', '...
const getSourceTableContext = (line: string) => {
  const m = line.match(
    /\bsource\(\s*(['"])([^'"]+)\1\s*,\s*(['"]?)([^'")\s]*)$/,
  );
  return m
    ? { kind: 'source_table' as const, sourceName: m[2], partial: m[4] }
    : null;
};

// Returns partial when inside source(' with no comma yet
const getSourceNameContext = (line: string) => {
  const m = line.match(/\bsource\(\s*(['"]?)([^'",)\s]*)$/);
  return m ? { kind: 'source_name' as const, partial: m[2] } : null;
};

const getDocContext = (line: string) => {
  const m = line.match(/\bdoc\(\s*(['"]?)([^'")\s]*)$/);
  return m ? { kind: 'doc' as const, partial: m[2] } : null;
};

const getMacroContext = (line: string) => {
  const m = line.match(/\{\{-?\s*([a-zA-Z_][\w]*)$/);
  return m ? { kind: 'macro' as const, partial: m[1] } : null;
};

const getVarContext = (line: string) => {
  const m = line.match(/\bvar\(\s*(['"]?)([^'")\s]*)$/);
  return m ? { kind: 'var' as const, partial: m[2] } : null;
};

const getEnvVarContext = (line: string) => {
  const m = line.match(/\benv_var\(\s*(['"]?)([^'")\s]*)$/);
  return m ? { kind: 'env_var' as const, partial: m[2] } : null;
};

const DBT_BUILTIN_MACROS = [
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
  'exceptions',
  'modules',
  'flags',
  'target',
  'is_incremental',
  'generate_schema_name',
  'generate_alias_name',
];

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
  // DDL (useful in dbt pre/post hooks)
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

// Common SQL scalar functions — works across DuckDB, Postgres, Snowflake, BigQuery
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
  // Array / Object (DuckDB / Snowflake / BigQuery)
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
  // Hash / Crypto
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

export const CodeEditor = ({
  content,
  originalContent,
  language,
  theme,
  onChange,
  readOnly = false,
  projectId,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  onOpenFile,
}: {
  content: string;
  originalContent: string | null;
  language: string;
  theme: string;
  onChange: OnChange;
  readOnly?: boolean;
  projectId?: string;
  onOpenFile?: (filePath: string) => void;
}) => {
  const [isMounted, setIsMounted] = React.useState(false);
  const [isDisposed, setIsDisposed] = React.useState(false);
  const editorRef = useRef<IStandaloneCodeEditor | null>(null);
  const monacoRef = useRef<IMonaco | null>(null);
  const decorationsRef = useRef<IEditorDecorationsCollection | null>(null);
  const completionDisposableRef = useRef<IDisposable | null>(null);
  const hoverDisposableRef = useRef<IDisposable | null>(null);

  const applyHighlights = (current: string, original: string | null) => {
    if (!editorRef.current || !monacoRef.current) return;

    try {
      const monacoInstance = monacoRef.current;
      const editor = editorRef.current;
      if (!editor || !editor.getModel) return;

      const model = editor.getModel();
      if (!model) return;

      const range = (index: number) =>
        new monacoInstance.Range(index, 1, index, 1);

      const decorations = getDecorations(
        original,
        current,
        model.getLineCount(),
        range,
      );
      if (!decorationsRef.current) {
        decorationsRef.current =
          editor.createDecorationsCollection(decorations);
      } else {
        decorationsRef.current.set(decorations);
      }
    } catch (error) {
      // Ignore decoration errors during rapid editor changes
    }
  };

  const handleMount = async (
    editor: IStandaloneCodeEditor,
    monacoInstance: IMonaco,
  ) => {
    // Clean up previous resources if they exist
    try {
      if (decorationsRef.current && !decorationsRef.current.clear) {
        decorationsRef.current = null;
      } else {
        decorationsRef.current?.clear();
        decorationsRef.current = null;
      }
      completionDisposableRef.current?.dispose();
      completionDisposableRef.current = null;
    } catch (error) {
      // Ignore cleanup errors during rapid remounting
    }

    // Configure Monaco
    monacoInstance.languages.typescript.javascriptDefaults.setDiagnosticsOptions(
      { noSemanticValidation: true, noSyntaxValidation: true },
    );
    monacoInstance.languages.typescript.typescriptDefaults.setDiagnosticsOptions(
      { noSemanticValidation: true, noSyntaxValidation: true },
    );

    // Phase 6: Register dbt-specific completion provider for jinja-sql
    completionDisposableRef.current =
      monacoInstance.languages.registerCompletionItemProvider('jinja-sql', {
        triggerCharacters: ["'", '"', '(', '.', ','],
        provideCompletionItems: async (model, position) => {
          const line = model.getValueInRange({
            startLineNumber: position.lineNumber,
            startColumn: 1,
            endLineNumber: position.lineNumber,
            endColumn: position.column,
          });

          // Helper: build the replacement range starting at the beginning of
          // the typed partial so Monaco replaces the right text on accept.
          const makeRange = (partial: string) => ({
            startLineNumber: position.lineNumber,
            endLineNumber: position.lineNumber,
            // go back by partial length so the typed prefix is replaced
            startColumn: position.column - partial.length,
            endColumn: position.column,
          });

          const kind = monacoInstance.languages.CompletionItemKind;

          // ref()
          const refCtx = getRefContext(line);
          if (refCtx) {
            const res = await languageIntelligenceService.listModels(projectId);
            const rng = makeRange(refCtx.partial);
            return {
              suggestions: res.models
                .filter(
                  (m) =>
                    !refCtx.partial ||
                    m.name
                      .toLowerCase()
                      .startsWith(refCtx.partial.toLowerCase()),
                )
                .slice(0, 200)
                .map((m) => ({
                  label: m.name,
                  kind: kind.Module,
                  insertText: m.name,
                  filterText: m.name,
                  detail: m.packageName,
                  documentation: m.description,
                  range: rng,
                })),
            };
          }

          // source() — second arg (table)
          const srcTableCtx = getSourceTableContext(line);
          if (srcTableCtx) {
            const res =
              await languageIntelligenceService.listSources(projectId);
            const rng = makeRange(srcTableCtx.partial);
            return {
              suggestions: res.sources
                .filter((s) => s.sourceName === srcTableCtx.sourceName)
                .filter(
                  (s) =>
                    !srcTableCtx.partial ||
                    s.tableName
                      .toLowerCase()
                      .startsWith(srcTableCtx.partial.toLowerCase()),
                )
                .slice(0, 200)
                .map((s) => ({
                  label: s.tableName,
                  kind: kind.Field,
                  insertText: s.tableName,
                  filterText: s.tableName,
                  documentation: s.description,
                  range: rng,
                })),
            };
          }

          // source() — first arg (source name)
          const srcNameCtx = getSourceNameContext(line);
          if (srcNameCtx) {
            const res =
              await languageIntelligenceService.listSources(projectId);
            const names = [...new Set(res.sources.map((s) => s.sourceName))];
            const rng = makeRange(srcNameCtx.partial);
            return {
              suggestions: names
                .filter(
                  (n) =>
                    !srcNameCtx.partial ||
                    n
                      .toLowerCase()
                      .startsWith(srcNameCtx.partial.toLowerCase()),
                )
                .map((n) => ({
                  label: n,
                  kind: kind.Module,
                  insertText: n,
                  filterText: n,
                  range: rng,
                })),
            };
          }

          // doc()
          const docCtx = getDocContext(line);
          if (docCtx) {
            const res = await languageIntelligenceService.listDocs(projectId);
            const rng = makeRange(docCtx.partial);
            return {
              suggestions: res.docs
                .filter(
                  (d) =>
                    !docCtx.partial ||
                    d.name
                      .toLowerCase()
                      .startsWith(docCtx.partial.toLowerCase()),
                )
                .slice(0, 200)
                .map((d) => ({
                  label: d.name,
                  kind: kind.Value,
                  insertText: d.name,
                  filterText: d.name,
                  documentation: d.description,
                  range: rng,
                })),
            };
          }

          // var()
          const varCtx = getVarContext(line);
          if (varCtx) {
            const res =
              await languageIntelligenceService.listVariables(projectId);
            const rng = makeRange(varCtx.partial);
            return {
              suggestions: res.variables
                .filter(
                  (v) =>
                    !varCtx.partial ||
                    v.name
                      .toLowerCase()
                      .startsWith(varCtx.partial.toLowerCase()),
                )
                .map((v) => ({
                  label: v.name,
                  kind: kind.Variable,
                  insertText: v.name,
                  filterText: v.name,
                  range: rng,
                })),
            };
          }

          // env_var()
          const envCtx = getEnvVarContext(line);
          if (envCtx) {
            const res =
              await languageIntelligenceService.listEnvVars(projectId);
            const rng = makeRange(envCtx.partial);
            return {
              suggestions: res.envVars
                .filter(
                  (e: { name: string }) =>
                    !envCtx.partial ||
                    e.name
                      .toLowerCase()
                      .startsWith(envCtx.partial.toLowerCase()),
                )
                .map((e: { name: string }) => ({
                  label: e.name,
                  kind: kind.Constant,
                  insertText: e.name,
                  filterText: e.name,
                  range: rng,
                })),
            };
          }

          // macro — {{ partial
          const macroCtx = getMacroContext(line);
          if (macroCtx) {
            const res = await languageIntelligenceService.listMacros(projectId);
            const macroNames = [
              ...new Set([
                ...res.macros.map((m) => m.name),
                ...DBT_BUILTIN_MACROS,
              ]),
            ];
            const rng = makeRange(macroCtx.partial);
            return {
              suggestions: macroNames
                .filter(
                  (n) =>
                    !macroCtx.partial ||
                    n.toLowerCase().startsWith(macroCtx.partial.toLowerCase()),
                )
                .map((n) => ({
                  label: n,
                  kind: kind.Function,
                  insertText: n,
                  filterText: n,
                  range: rng,
                })),
            };
          }

          return { suggestions: [] };
        },
      });

    // Phase 6b: Register SQL keyword + function provider for jinja-sql (global, once).
    // Guard prevents duplicate registrations across editor tab re-mounts.
    if (!sqlKeywordProviderDisposable) {
      sqlKeywordProviderDisposable =
        monacoInstance.languages.registerCompletionItemProvider('jinja-sql', {
          provideCompletionItems: (model, position) => {
            const lineUntilCursor = model.getValueInRange({
              startLineNumber: position.lineNumber,
              startColumn: 1,
              endLineNumber: position.lineNumber,
              endColumn: position.column,
            });

            const insideJinja =
              lineUntilCursor.lastIndexOf('{{') >
                lineUntilCursor.lastIndexOf('}}') ||
              lineUntilCursor.lastIndexOf('{%') >
                lineUntilCursor.lastIndexOf('%}');
            if (insideJinja) return { suggestions: [] };

            const wordInfo = model.getWordUntilPosition(position);
            // Compare case-insensitively — keywords are uppercase, user may type lowercase
            const typed = wordInfo.word.toUpperCase();

            const range = {
              startLineNumber: position.lineNumber,
              endLineNumber: position.lineNumber,
              startColumn: wordInfo.startColumn,
              endColumn: wordInfo.endColumn,
            };

            const kwKind = monacoInstance.languages.CompletionItemKind.Keyword;
            const fnKind = monacoInstance.languages.CompletionItemKind.Function;

            const keywords = SQL_KEYWORDS.filter(
              (kw) => !typed || kw.toUpperCase().startsWith(typed),
            ).map((kw) => ({
              label: kw,
              kind: kwKind,
              insertText: kw,
              detail: 'SQL keyword',
              sortText: `0_${kw}`,
              range,
            }));

            const functions = SQL_FUNCTIONS.filter(
              (fn) => !typed || fn.toUpperCase().startsWith(typed),
            ).map((fn) => ({
              label: fn,
              kind: fnKind,
              insertText: `${fn}($0)`,
              insertTextRules:
                monacoInstance.languages.CompletionItemInsertTextRule
                  .InsertAsSnippet,
              detail: 'SQL function',
              sortText: `1_${fn}`,
              range,
            }));

            return { suggestions: [...keywords, ...functions] };
          },
        });
    }

    // Phase 7: YAML doc() Provider
    // Register globally exactly once, regardless of what file type triggers the first mount
    if (!yamlProviderDisposable) {
      yamlProviderDisposable =
        monacoInstance.languages.registerCompletionItemProvider('yaml', {
          triggerCharacters: ["'", '"', '('],
          provideCompletionItems: async (model, position) => {
            const line = model.getValueInRange({
              startLineNumber: position.lineNumber,
              startColumn: 1,
              endLineNumber: position.lineNumber,
              endColumn: position.column,
            });
            const docCtx = getDocContext(line);
            if (!docCtx) return { suggestions: [] };

            const makeRange = (partial: string) => ({
              startLineNumber: position.lineNumber,
              endLineNumber: position.lineNumber,
              startColumn: position.column - partial.length,
              endColumn: position.column,
            });

            const rng = makeRange(docCtx.partial);
            const res = await languageIntelligenceService.listDocs(projectId);
            return {
              suggestions: res.docs
                .filter(
                  (d) =>
                    !docCtx.partial ||
                    d.name.toLowerCase().includes(docCtx.partial.toLowerCase()),
                )
                .slice(0, 200)
                .map((d) => ({
                  label: d.name,
                  kind: monacoInstance.languages.CompletionItemKind.Value,
                  insertText: d.name,
                  filterText: d.name,
                  documentation: d.description,
                  range: rng,
                })),
            };
          },
        });
    }

    editorRef.current = editor;
    monacoRef.current = monacoInstance;
    setIsDisposed(false);

    setTimeout(() => {
      if (!isDisposed) {
        setIsMounted(true);
      }
    }, 50);
  };

  useEffect(() => {
    if (editorRef.current && monacoRef.current && isMounted) {
      applyHighlights(content, originalContent);
    }
    // NOTE: do NOT dispose providers here — this runs on every keystroke.
    // Provider disposal is handled exclusively in the unmount useEffect below.
  }, [content, originalContent, isMounted]);

  // Cleanup global instances
  useEffect(() => {
    return () => {
      setIsDisposed(true);
      try {
        completionDisposableRef.current?.dispose();
        hoverDisposableRef.current?.dispose();
        completionDisposableRef.current = null;
        hoverDisposableRef.current = null;

        if (decorationsRef.current) {
          try {
            decorationsRef.current.clear();
          } catch (e) {
            // Ignore clear errors
          }
          decorationsRef.current = null;
        }

        editorRef.current = null;
        monacoRef.current = null;
      } catch (error) {
        // Ignore disposal errors - they're expected during rapid unmounting
      }
    };
  }, []);

  return (
    <MonacoEditor
      height="100%"
      width="100%"
      theme={theme}
      language={language}
      value={content}
      beforeMount={(monaco) => {
        // Register jinja-sql BEFORE the model is created so Monaco links
        // the tokenizer and completion providers immediately.
        registerJinjaSqlLanguage(monaco);
      }}
      onMount={handleMount}
      onChange={onChange}
      loading={<Shimmer text="Loading editor..." />}
      options={{
        fontSize: 14,
        minimap: { enabled: false },
        lineNumbers: 'on',
        scrollBeyondLastLine: false,
        automaticLayout: true,
        readOnly,
        // Render suggest/hover/parameter widgets with position:fixed so they
        // are never clipped by parent overflow containers (e.g. SplitPane panes).
        // Without this, the autocomplete popup is hidden behind the Terminal panel.
        fixedOverflowWidgets: true,
        // Allow suggestions to re-fire while typing inside string
        // tokens (e.g., inside ref('...') or source('...'))
        quickSuggestions: {
          other: true,
          comments: false,
          strings: true,
        },
        suggestOnTriggerCharacters: true,
      }}
    />
  );
};
