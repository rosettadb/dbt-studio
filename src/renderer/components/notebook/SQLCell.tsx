/**
 * SQL Cell Component
 * Monaco editor for SQL with execution and output display
 * Enhanced with custom SQL syntax highlighting theme
 */

import React, { useRef, useEffect, useState } from 'react';
import { Box, CircularProgress, Typography } from '@mui/material';
import Editor, { OnMount, loader } from '@monaco-editor/react';
import { editor } from 'monaco-editor';
import { NotebookCell, CellOutput } from '../../../types/notebook';
import { OutputPanel } from './OutputPanel';

// Configure Monaco loader for Electron
loader.config({
  paths: {
    vs: 'app-asset://zui/node_modules/monaco-editor/min/vs',
  },
});

/**
 * Define custom SQL theme with 9 distinct colors for better readability
 */
const defineSQLTheme = (monaco: any) => {
  monaco.editor.defineTheme('sql-enhanced', {
    base: 'vs-dark',
    inherit: true,
    rules: [
      // SQL Keywords (bright blue, bold)
      { token: 'keyword.sql', foreground: '569CD6', fontStyle: 'bold' },

      // Table names (green)
      { token: 'identifier.table', foreground: '4EC9B0' },

      // Column names (light blue)
      { token: 'identifier.column', foreground: '9CDCFE' },

      // Functions (yellow)
      { token: 'predefined.sql', foreground: 'DCDCAA' },

      // Strings (orange)
      { token: 'string.sql', foreground: 'CE9178' },

      // Numbers (light green)
      { token: 'number.sql', foreground: 'B5CEA8' },

      // Comments (gray, italic)
      { token: 'comment.sql', foreground: '6A9955', fontStyle: 'italic' },

      // Operators (white)
      { token: 'operator.sql', foreground: 'D4D4D4' },

      // Type keywords (cyan)
      { token: 'type.sql', foreground: '4EC9B0' },
    ],
    colors: {
      'editor.background': '#1E1E1E',
      'editor.foreground': '#D4D4D4',
      'editor.lineHighlightBackground': '#2A2A2A',
      'editorCursor.foreground': '#AEAFAD',
      'editor.selectionBackground': '#264F78',
      'editor.inactiveSelectionBackground': '#3A3D41',
    },
  });
};

/**
 * Configure SQL language with enhanced tokenization
 */
const configureSQLLanguage = (monaco: any) => {
  monaco.languages.setMonarchTokensProvider('sql', {
    defaultToken: '',
    tokenPostfix: '.sql',
    ignoreCase: true,

    keywords: [
      'SELECT',
      'FROM',
      'WHERE',
      'JOIN',
      'LEFT',
      'RIGHT',
      'INNER',
      'OUTER',
      'FULL',
      'CROSS',
      'ON',
      'AS',
      'AND',
      'OR',
      'NOT',
      'IN',
      'EXISTS',
      'BETWEEN',
      'LIKE',
      'ILIKE',
      'IS',
      'NULL',
      'TRUE',
      'FALSE',
      'GROUP',
      'BY',
      'HAVING',
      'ORDER',
      'ASC',
      'DESC',
      'LIMIT',
      'OFFSET',
      'UNION',
      'INTERSECT',
      'EXCEPT',
      'ALL',
      'DISTINCT',
      'CASE',
      'WHEN',
      'THEN',
      'ELSE',
      'END',
      'WITH',
      'RECURSIVE',
      'OVER',
      'PARTITION',
      'WINDOW',
      'ROWS',
      'RANGE',
      'UNBOUNDED',
      'PRECEDING',
      'FOLLOWING',
      'CURRENT',
      'ROW',
      'INSERT',
      'INTO',
      'VALUES',
      'UPDATE',
      'SET',
      'DELETE',
      'CREATE',
      'DROP',
      'ALTER',
      'TABLE',
      'VIEW',
      'INDEX',
      'SCHEMA',
      'DATABASE',
      'CONSTRAINT',
      'PRIMARY',
      'KEY',
      'FOREIGN',
      'REFERENCES',
      'UNIQUE',
      'CHECK',
      'DEFAULT',
      'USING',
      'SAMPLE',
      'QUALIFY',
      'EXCLUDE',
      'REPLACE',
    ],

    operators: [
      '=',
      '>',
      '<',
      '!',
      '~',
      '?',
      ':',
      '==',
      '<=',
      '>=',
      '!=',
      '<>',
      '&&',
      '||',
      '++',
      '--',
      '+',
      '-',
      '*',
      '/',
      '&',
      '|',
      '^',
      '%',
      '<<',
      '>>',
      '>>>',
      '+=',
      '-=',
      '*=',
      '/=',
      '&=',
      '|=',
      '^=',
      '%=',
      '<<=',
      '>>=',
      '>>>=',
    ],

    builtinFunctions: [
      // Aggregate functions
      'COUNT',
      'SUM',
      'AVG',
      'MIN',
      'MAX',
      'STDDEV',
      'VARIANCE',
      'STRING_AGG',
      'ARRAY_AGG',
      'LIST',
      'MEDIAN',
      'MODE',

      // Window functions
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

      // String functions
      'CONCAT',
      'SUBSTRING',
      'LENGTH',
      'UPPER',
      'LOWER',
      'TRIM',
      'LTRIM',
      'RTRIM',
      'REPLACE',
      'SPLIT',
      'REGEXP_MATCHES',
      'REGEXP_REPLACE',

      // Date functions
      'NOW',
      'CURRENT_DATE',
      'CURRENT_TIME',
      'CURRENT_TIMESTAMP',
      'DATE_TRUNC',
      'DATE_PART',
      'EXTRACT',
      'AGE',
      'INTERVAL',

      // Type conversion
      'CAST',
      'TRY_CAST',
      'COALESCE',
      'NULLIF',
      'IFNULL',

      // Math functions
      'ABS',
      'CEIL',
      'FLOOR',
      'ROUND',
      'SQRT',
      'POWER',
      'EXP',
      'LN',
      'LOG',

      // Conditional
      'IF',
      'CASE',
      'WHEN',
      'THEN',
      'ELSE',
      'END',
    ],

    builtinTypes: [
      'INTEGER',
      'BIGINT',
      'SMALLINT',
      'TINYINT',
      'DOUBLE',
      'FLOAT',
      'DECIMAL',
      'NUMERIC',
      'VARCHAR',
      'CHAR',
      'TEXT',
      'STRING',
      'BOOLEAN',
      'BOOL',
      'DATE',
      'TIME',
      'TIMESTAMP',
      'TIMESTAMPTZ',
      'INTERVAL',
      'BLOB',
      'BYTEA',
      'UUID',
      'JSON',
      'ARRAY',
      'LIST',
      'STRUCT',
      'MAP',
    ],

    tokenizer: {
      root: [
        // Whitespace
        { include: '@whitespace' },

        // Numbers
        [/\d+(\.\d+)?/, 'number.sql'],

        // Strings
        [/'([^'\\]|\\.)*$/, 'string.invalid.sql'],
        [/'/, 'string.sql', '@string'],
        [/"([^"\\]|\\.)*$/, 'string.invalid.sql'],
        [/"/, 'identifier.quoted.sql', '@quotedIdentifier'],

        // Identifiers and keywords
        [
          /[a-zA-Z_][\w]*/,
          {
            cases: {
              '@keywords': 'keyword.sql',
              '@builtinFunctions': 'predefined.sql',
              '@builtinTypes': 'type.sql',
              '@default': 'identifier.sql',
            },
          },
        ],

        // Delimiters and operators
        [/[;,.]/, 'delimiter.sql'],
        [/[()[\]]/, 'delimiter.parenthesis.sql'],
        [/[<>]=?/, 'operator.sql'],
        [/[+\-*/%]/, 'operator.sql'],
        [/[=!<>]=/, 'operator.sql'],
      ],

      whitespace: [
        [/\s+/, 'white'],
        [/--.*$/, 'comment.sql'],
        [/\/\*/, 'comment.sql', '@comment'],
      ],

      comment: [
        [/[^/*]+/, 'comment.sql'],
        [/\*\//, 'comment.sql', '@pop'],
        [/[/*]/, 'comment.sql'],
      ],

      string: [
        [/[^\\']+/, 'string.sql'],
        [/\\./, 'string.escape.sql'],
        [/'/, 'string.sql', '@pop'],
      ],

      quotedIdentifier: [
        [/[^\\"]+/, 'identifier.quoted.sql'],
        [/\\./, 'string.escape.sql'],
        [/"/, 'identifier.quoted.sql', '@pop'],
      ],
    },
  });
};

interface SQLCellProps {
  cell: NotebookCell;
  isExecuting: boolean;
  onRun: (content: string) => void;
  onUpdate: (content: string) => void;
}

export const SQLCell: React.FC<SQLCellProps> = ({
  cell,
  isExecuting,
  onRun,
  onUpdate,
}) => {
  const editorRef = useRef<editor.IStandaloneCodeEditor | null>(null);
  const [monacoConfigured, setMonacoConfigured] = useState(false);

  // Configure Monaco theme and language on mount
  useEffect(() => {
    loader.init().then((monaco) => {
      if (!monacoConfigured) {
        defineSQLTheme(monaco);
        configureSQLLanguage(monaco);
        setMonacoConfigured(true);
      }
    });
  }, [monacoConfigured]);

  // Debug: Log when cell output changes
  useEffect(() => {
    // eslint-disable-next-line no-console
    console.log('[SQLCell] Cell output updated:', {
      cellId: cell.id,
      hasOutput: !!cell.output,
      output: cell.output,
      outputType: cell.output?.type,
      dataLength: cell.output?.data?.length,
      columns: cell.output?.columns,
      rowCount: cell.output?.rowCount,
    });
  }, [cell.id, cell.output]);

  const handleEditorDidMount: OnMount = (editor, monaco) => {
    editorRef.current = editor;

    // Ensure theme is applied
    monaco.editor.setTheme('sql-enhanced');

    // Add keyboard shortcut: Cmd/Ctrl + Enter to run
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, () => {
      const content = editor.getValue();
      onRun(content);
    });

    // Add keyboard shortcut: Shift + Enter to run and move to next
    editor.addCommand(monaco.KeyMod.Shift | monaco.KeyCode.Enter, () => {
      const content = editor.getValue();
      onRun(content);
      // TODO: Move to next cell
    });
  };

  const handleEditorChange = (value: string | undefined) => {
    if (value !== undefined && value !== cell.content) {
      onUpdate(value);
    }
  };

  return (
    <Box>
      {/* SQL Editor */}
      <Box
        sx={{
          border: '1px solid',
          borderColor: 'divider',
          borderRadius: 1,
          overflow: 'hidden',
          minHeight: 100,
        }}
      >
        <Editor
          height="150px"
          defaultLanguage="sql"
          value={cell.content}
          onChange={handleEditorChange}
          onMount={handleEditorDidMount}
          options={{
            minimap: { enabled: false },
            lineNumbers: 'on',
            scrollBeyondLastLine: false,
            wordWrap: 'on',
            fontSize: 14,
            tabSize: 2,
            automaticLayout: true,
            padding: { top: 8, bottom: 8 },
            // Enhanced visual settings
            renderLineHighlight: 'all',
            cursorBlinking: 'smooth',
            cursorSmoothCaretAnimation: 'on',
            smoothScrolling: true,
            fontLigatures: true,
            bracketPairColorization: { enabled: true },
          }}
          theme="sql-enhanced"
        />
      </Box>

      {/* Execution Status */}
      {isExecuting && (
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            gap: 1,
            mt: 2,
            color: 'primary.main',
          }}
        >
          <CircularProgress size={16} />
          <Typography variant="body2">Executing query...</Typography>
        </Box>
      )}

      {/* Output Panel */}
      {cell.output && !isExecuting && (
        <Box sx={{ mt: 2 }}>
          <OutputPanel output={cell.output} />
        </Box>
      )}
    </Box>
  );
};
