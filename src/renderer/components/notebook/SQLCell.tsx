/**
 * SQL Cell Component
 * Monaco editor for SQL with execution and output display
 * Enhanced with custom SQL syntax highlighting theme and schema autocomplete (Phase 4)
 * Updated to use shared hooks from SQL Editor (Phase 2)
 */

import React, { useRef, useEffect, useState } from 'react';
import { Box, CircularProgress, Typography, useTheme } from '@mui/material';
import Editor, { OnMount, loader } from '@monaco-editor/react';
import { editor } from 'monaco-editor';
import { NotebookCell } from '../../../types/notebooks';
import { useSchemaForConnection } from '../../hooks';

// Configure Monaco loader for Electron
loader.config({
  paths: {
    vs: 'app-asset://zui/node_modules/monaco-editor/min/vs',
  },
});

/**
 * Define custom SQL themes with 9 distinct colors for better readability
 * Supports both dark and light modes
 */
const defineSQLThemes = (monaco: any) => {
  // Dark theme
  monaco.editor.defineTheme('sql-enhanced-dark', {
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
      'editor.background': '#121212',
      'editor.foreground': '#D4D4D4',
      'editor.lineHighlightBackground': '#1e1e1e',
      'editorCursor.foreground': '#AEAFAD',
      'editor.selectionBackground': '#264F78',
      'editor.inactiveSelectionBackground': '#3A3D41',
    },
  });

  // Light theme
  monaco.editor.defineTheme('sql-enhanced-light', {
    base: 'vs',
    inherit: true,
    rules: [
      // SQL Keywords (dark blue, bold)
      { token: 'keyword.sql', foreground: '0000FF', fontStyle: 'bold' },

      // Table names (dark green)
      { token: 'identifier.table', foreground: '267F99' },

      // Column names (dark blue)
      { token: 'identifier.column', foreground: '001080' },

      // Functions (dark yellow/brown)
      { token: 'predefined.sql', foreground: '795E26' },

      // Strings (red)
      { token: 'string.sql', foreground: 'A31515' },

      // Numbers (green)
      { token: 'number.sql', foreground: '098658' },

      // Comments (green, italic)
      { token: 'comment.sql', foreground: '008000', fontStyle: 'italic' },

      // Operators (black)
      { token: 'operator.sql', foreground: '000000' },

      // Type keywords (teal)
      { token: 'type.sql', foreground: '267F99' },
    ],
    colors: {
      'editor.background': '#fafafa',
      'editor.foreground': '#000000',
      'editor.lineHighlightBackground': '#f5f5f5',
      'editorCursor.foreground': '#000000',
      'editor.selectionBackground': '#ADD6FF',
      'editor.inactiveSelectionBackground': '#E5EBF1',
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
  connectionId: string; // Changed from instanceId to connectionId for consistency
  isExecuting: boolean;
  onRun: (content: string) => void | Promise<void>;
  onUpdate: (content: string) => void;
}

export const SQLCell: React.FC<SQLCellProps> = ({
  cell,
  connectionId,
  isExecuting,
  onRun,
  onUpdate,
}) => {
  const theme = useTheme();
  const editorRef = useRef<editor.IStandaloneCodeEditor | null>(null);
  const [monacoConfigured, setMonacoConfigured] = useState(false);
  const [editorHeight, setEditorHeight] = useState(80); // Compact default height
  const resizeHandleRef = useRef<HTMLDivElement>(null);
  const [isHovering, setIsHovering] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const isExecutingRef = useRef(isExecuting);
  const handleRunRef = useRef(onRun);

  // Determine Monaco theme based on MUI theme
  const monacoTheme =
    theme.palette.mode === 'dark' ? 'sql-enhanced-dark' : 'sql-enhanced-light';

  // Keep refs in sync with latest values
  useEffect(() => {
    isExecutingRef.current = isExecuting;
  }, [isExecuting]);

  useEffect(() => {
    handleRunRef.current = onRun;
  }, [onRun]);

  // Fetch schema for DDL refresh only (autocomplete is handled by NotebookEditor)
  const { refetch: refetchSchema } = useSchemaForConnection(connectionId);

  // Detect DDL operations and refresh schema (Phase 4)
  const isDDLOperation = (query: string): boolean => {
    const normalized = query.trim().toUpperCase();
    const ddlKeywords = [
      'CREATE TABLE',
      'DROP TABLE',
      'ALTER TABLE',
      'CREATE SCHEMA',
      'DROP SCHEMA',
      'CREATE VIEW',
      'DROP VIEW',
    ];
    return ddlKeywords.some((kw) => normalized.includes(kw));
  };

  // Wrap onRun to detect DDL and refresh schema
  const handleRunWithDDL = React.useCallback(
    async (content: string) => {
      await Promise.resolve(onRun(content));

      // Refresh schema if DDL operation (after run completes)
      if (isDDLOperation(content)) {
        refetchSchema();
      }
    },
    [onRun, refetchSchema],
  );

  // Update handleRunRef with DDL-aware wrapper
  useEffect(() => {
    handleRunRef.current = handleRunWithDDL;
  }, [handleRunWithDDL]);

  // Configure Monaco theme and language on mount
  useEffect(() => {
    loader
      .init()
      .then((monaco) => {
        if (!monacoConfigured) {
          defineSQLThemes(monaco);
          configureSQLLanguage(monaco);
          setMonacoConfigured(true);
        }
        return undefined;
      })
      .catch((error) => {
        // eslint-disable-next-line no-console
        console.error('Failed to initialize Monaco editor:', error);
      });
  }, [monacoConfigured]);

  // Update Monaco theme when MUI theme changes
  useEffect(() => {
    if (editorRef.current && monacoConfigured) {
      loader
        .init()
        .then((monaco) => {
          monaco.editor.setTheme(monacoTheme);
          return undefined;
        })
        .catch((error) => {
          // eslint-disable-next-line no-console
          console.error('Failed to update Monaco theme:', error);
        });
    }
  }, [monacoTheme, monacoConfigured]);

  const handleEditorDidMount: OnMount = (editorInstance, monaco) => {
    editorRef.current = editorInstance;

    // Ensure theme is applied based on current MUI theme
    monaco.editor.setTheme(monacoTheme);

    // Add keyboard shortcut: Cmd/Ctrl + Enter to run
    editorInstance.addCommand(
      // eslint-disable-next-line no-bitwise
      monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter,
      () => {
        if (isExecutingRef.current) return;
        const content = editorInstance.getValue();
        // eslint-disable-next-line @typescript-eslint/no-floating-promises
        handleRunRef.current(content);
      },
    );

    // Add keyboard shortcut: Shift + Enter to run and move to next
    editorInstance.addCommand(
      // eslint-disable-next-line no-bitwise
      monaco.KeyMod.Shift | monaco.KeyCode.Enter,
      () => {
        if (isExecutingRef.current) return;
        const content = editorInstance.getValue();
        // eslint-disable-next-line @typescript-eslint/no-floating-promises
        handleRunRef.current(content);
        // TODO: Move to next cell
      },
    );
  };

  const handleEditorChange = (value: string | undefined) => {
    if (value !== undefined && value !== cell.content) {
      onUpdate(value);
    }
  };

  // Handle resize drag
  useEffect(() => {
    const handleMouseDown = (e: MouseEvent) => {
      e.preventDefault();
      setIsDragging(true);
      const startY = e.clientY;
      const startHeight = editorHeight;

      const handleMouseMove = (moveEvent: MouseEvent) => {
        const deltaY = moveEvent.clientY - startY;
        const newHeight = Math.max(40, Math.min(800, startHeight + deltaY));
        setEditorHeight(newHeight);
      };

      const handleMouseUp = () => {
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
        setIsDragging(false);
      };

      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = 'row-resize';
      document.body.style.userSelect = 'none';
    };

    const resizeHandle = resizeHandleRef.current;
    if (resizeHandle) {
      resizeHandle.addEventListener('mousedown', handleMouseDown);
      return () => {
        resizeHandle.removeEventListener('mousedown', handleMouseDown);
      };
    }
    return undefined;
  }, [editorHeight]);

  return (
    <Box
      onMouseEnter={() => setIsHovering(true)}
      onMouseLeave={() => setIsHovering(false)}
    >
      {/* SQL Editor */}
      <Box
        sx={{
          border: '1px solid',
          borderColor: 'divider',
          borderRadius: 1,
          overflow: 'hidden',
          minHeight: 40,
          position: 'relative',
        }}
      >
        <Editor
          height={`${editorHeight}px`}
          defaultLanguage="sql"
          value={cell.content}
          onChange={handleEditorChange}
          onMount={handleEditorDidMount}
          options={{
            minimap: { enabled: false },
            lineNumbers: 'on',
            scrollBeyondLastLine: false,
            wordWrap: 'on',
            fontSize: 12, // Reduced from 14
            tabSize: 2,
            automaticLayout: true,
            padding: { top: 4, bottom: 12 }, // Increased bottom padding to avoid overlap with resize handle
            lineHeight: 18, // Compact line height
            scrollbar: {
              vertical: 'hidden',
              horizontal: 'auto',
            },
            // Enhanced visual settings
            renderLineHighlight: 'all',
            cursorBlinking: 'smooth',
            cursorSmoothCaretAnimation: 'on',
            smoothScrolling: true,
            fontLigatures: true,
            bracketPairColorization: { enabled: true },
          }}
          theme={monacoTheme}
        />

        {/* Resize Handle - Always visible, more prominent */}
        <Box
          ref={resizeHandleRef}
          sx={{
            position: 'absolute',
            bottom: 0,
            left: 0,
            right: 0,
            height: '10px',
            cursor: 'row-resize',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            opacity: isHovering || isDragging ? 1 : 0.3,
            transition: 'opacity 0.2s ease-in-out',
            backgroundColor: 'transparent',
            zIndex: 10,
            '&:hover': {
              opacity: 1,
            },
          }}
        >
          {/* Visual handle indicator */}
          <Box
            sx={{
              width: '40px',
              height: '4px',
              borderRadius: '2px',
              backgroundColor: isDragging ? 'primary.main' : 'divider',
              transition: 'background-color 0.2s',
              '&:hover': {
                backgroundColor: 'primary.main',
              },
            }}
          />
        </Box>
      </Box>

      {/* Execution Status */}
      {isExecuting && (
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            gap: 0.75,
            mt: 1, // Reduced from 2
            color: 'primary.main',
          }}
        >
          <CircularProgress size={14} /> {/* Reduced from 16 */}
          <Typography variant="body2" sx={{ fontSize: 12 }}>
            Executing query...
          </Typography>
        </Box>
      )}
    </Box>
  );
};
