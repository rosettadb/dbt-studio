/**
 * SQL Cell Component
 * Monaco editor for SQL with execution and output display
 * Enhanced with custom SQL syntax highlighting theme and schema autocomplete (Phase 4)
 */

import React, { useRef, useEffect, useState } from 'react';
import { Box, CircularProgress, Typography } from '@mui/material';
import Editor, { OnMount, loader } from '@monaco-editor/react';
import { editor } from 'monaco-editor';
import { NotebookCell, CompletionItem } from '../../../../types/notebooks';
import {
  useSchema,
  useRefreshSchema,
} from '../../controllers/notebooks.controller';

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
  instanceId: string; // Added for schema autocomplete
  isExecuting: boolean;
  onRun: (content: string) => void;
  onUpdate: (content: string) => void;
}

export const SQLCell: React.FC<SQLCellProps> = ({
  cell,
  instanceId,
  isExecuting,
  onRun,
  onUpdate,
}) => {
  const editorRef = useRef<editor.IStandaloneCodeEditor | null>(null);
  const [monacoConfigured, setMonacoConfigured] = useState(false);
  const monacoInstanceRef = useRef<any>(null);
  const completionProviderRef = useRef<any>(null);
  const [editorHeight, setEditorHeight] = useState(120); // Reduced default from 150
  const resizeHandleRef = useRef<HTMLDivElement>(null);
  const [isHovering, setIsHovering] = useState(false);
  const [isDragging, setIsDragging] = useState(false);

  // Fetch schema for autocomplete (Phase 4)
  const { data: schemaInfo } = useSchema(instanceId);
  const { refreshSchema } = useRefreshSchema();

  // Convert schema to Monaco completion items
  const completions = React.useMemo((): CompletionItem[] => {
    if (!schemaInfo) return [];

    const items: CompletionItem[] = [];

    // Add schema completions
    schemaInfo.schemas.forEach((s) => {
      items.push({
        label: s.schema_name,
        kind: 9, // Module
        detail: `Schema (${s.schema_id})`,
        insertText: s.schema_name,
        sortText: `0_${s.schema_name}`,
      });
    });

    // Add table completions (simple and qualified)
    schemaInfo.tables.forEach((t) => {
      const recordInfo = t.record_count
        ? `${t.record_count.toLocaleString()} rows`
        : 'No data';

      // Simple: table
      items.push({
        label: t.table_name,
        kind: 7, // Class
        detail: `Table in ${t.schema_name}`,
        documentation: `${recordInfo}\nPath: ${t.path || 'N/A'}`,
        insertText: t.table_name,
        sortText: `1_${t.schema_name}_${t.table_name}`,
      });

      // Qualified: schema.table
      items.push({
        label: `${t.schema_name}.${t.table_name}`,
        kind: 7, // Class
        detail: 'Table (qualified)',
        documentation: recordInfo,
        insertText: `${t.schema_name}.${t.table_name}`,
        sortText: `1_${t.schema_name}_${t.table_name}_q`,
      });
    });

    // Add column completions (simple, qualified, nested)
    schemaInfo.columns.forEach((c) => {
      const nullInfo = c.nulls_allowed ? 'nullable' : 'not null';
      const statsInfo =
        c.min_value && c.max_value
          ? `Range: ${c.min_value} - ${c.max_value}`
          : '';

      // Simple: column
      items.push({
        label: c.column_name,
        kind: 5, // Field
        detail: `${c.column_type} (${nullInfo})`,
        documentation: `Table: ${c.schema_name}.${c.table_name}\n${statsInfo}`,
        insertText: c.column_name,
        sortText: `2_${c.column_name}`,
      });

      // Qualified: table.column
      items.push({
        label: `${c.table_name}.${c.column_name}`,
        kind: 5, // Field
        detail: `${c.column_type} (${nullInfo})`,
        documentation: statsInfo,
        insertText: `${c.table_name}.${c.column_name}`,
        sortText: `2_${c.table_name}_${c.column_name}`,
      });

      // Nested columns: parent.field
      if (c.parent_column && c.parent_column_name) {
        items.push({
          label: `${c.parent_column_name}.${c.column_name}`,
          kind: 5, // Field
          detail: `${c.column_type} (nested)`,
          documentation: `Parent: ${c.parent_column_name}`,
          insertText: `${c.parent_column_name}.${c.column_name}`,
          sortText: `3_${c.parent_column_name}_${c.column_name}`,
        });
      }
    });

    return items;
  }, [schemaInfo]);

  // Register completion provider (Phase 4)
  const registerCompletionProvider = React.useCallback(() => {
    const monacoInstance = monacoInstanceRef.current;
    if (!monacoInstance) return;

    // Dispose existing provider
    if (completionProviderRef.current) {
      completionProviderRef.current.dispose();
    }

    // Register new completion provider
    completionProviderRef.current =
      monacoInstance.languages.registerCompletionItemProvider('sql', {
        provideCompletionItems: (model: editor.ITextModel, position: any) => {
          const word = model.getWordUntilPosition(position);
          const range = {
            startLineNumber: position.lineNumber,
            endLineNumber: position.lineNumber,
            startColumn: word.startColumn,
            endColumn: word.endColumn,
          };

          const suggestions = completions.map((item) => ({
            ...item,
            range,
          }));
          return { suggestions };
        },
      });
  }, [completions]);

  // Update completion provider when completions change
  useEffect(() => {
    registerCompletionProvider();
  }, [registerCompletionProvider]);

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
  const handleRun = React.useCallback(
    (content: string) => {
      onRun(content);

      // Refresh schema if DDL operation
      if (isDDLOperation(content)) {
        setTimeout(() => {
          refreshSchema(instanceId);
        }, 1000); // Wait 1s for DDL to complete
      }
    },
    [onRun, instanceId, refreshSchema],
  );

  // Configure Monaco theme and language on mount
  useEffect(() => {
    loader
      .init()
      .then((monaco) => {
        if (!monacoConfigured) {
          defineSQLTheme(monaco);
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

  const handleEditorDidMount: OnMount = (editorInstance, monaco) => {
    editorRef.current = editorInstance;
    monacoInstanceRef.current = monaco;

    // Ensure theme is applied
    monaco.editor.setTheme('sql-enhanced');

    // Register initial completion provider after monaco is ready (Phase 4)
    registerCompletionProvider();

    // Add keyboard shortcut: Cmd/Ctrl + Enter to run
    editorInstance.addCommand(
      // eslint-disable-next-line no-bitwise
      monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter,
      () => {
        const content = editorInstance.getValue();
        handleRun(content);
      },
    );

    // Add keyboard shortcut: Shift + Enter to run and move to next
    editorInstance.addCommand(
      // eslint-disable-next-line no-bitwise
      monaco.KeyMod.Shift | monaco.KeyCode.Enter,
      () => {
        const content = editorInstance.getValue();
        handleRun(content);
        // TODO: Move to next cell
      },
    );
  };

  const handleEditorChange = (value: string | undefined) => {
    if (value !== undefined && value !== cell.content) {
      onUpdate(value);
    }
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (completionProviderRef.current) {
        completionProviderRef.current.dispose();
      }
    };
  }, []);

  // Handle resize drag
  useEffect(() => {
    const handleMouseDown = (e: MouseEvent) => {
      e.preventDefault();
      setIsDragging(true);
      const startY = e.clientY;
      const startHeight = editorHeight;

      const handleMouseMove = (moveEvent: MouseEvent) => {
        const deltaY = moveEvent.clientY - startY;
        const newHeight = Math.max(100, Math.min(800, startHeight + deltaY));
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
          minHeight: 100,
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
            padding: { top: 4, bottom: 4 }, // Reduced from 8
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
          theme="sql-enhanced"
        />

        {/* Resize Handle - Only visible on hover or while dragging */}
        <Box
          ref={resizeHandleRef}
          sx={{
            position: 'absolute',
            bottom: 0,
            left: 0,
            right: 0,
            height: '8px',
            cursor: 'row-resize',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            opacity: isHovering || isDragging ? 1 : 0,
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
