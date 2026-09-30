/**
 * SQL Cell Component
 * Monaco editor for SQL with execution and output display
 * Enhanced with custom SQL syntax highlighting theme and schema autocomplete (Phase 4)
 * Updated to use shared hooks from SQL Editor (Phase 2)
 */

import React, { useRef, useEffect, useState } from 'react';
import { Box, CircularProgress, Typography, useTheme } from '@mui/material';
import Editor, { OnMount } from '@monaco-editor/react';
import * as monaco from 'monaco-editor';
import { editor } from 'monaco-editor';
import { NotebookCell } from '../../../types/notebooks';
import { useSchemaForConnection } from '../../hooks';

// SQL themes ('sql-enhanced-dark', 'sql-enhanced-light') and the enhanced
// SQL Monarch tokenizer are registered once at app startup via
// lib/monaco/bootstrap → registerSqlEnhanced. No per-cell registration here.

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

  // Update Monaco theme when MUI theme changes. Themes themselves are
  // registered globally at bootstrap, so this is just a setTheme call.
  useEffect(() => {
    if (editorRef.current) {
      monaco.editor.setTheme(monacoTheme);
    }
  }, [monacoTheme]);

  const handleEditorDidMount: OnMount = (editorInstance, _monaco) => {
    editorRef.current = editorInstance;
    _monaco.editor.setTheme(monacoTheme);
    editorInstance.addCommand(
      // eslint-disable-next-line no-bitwise
      _monaco.KeyMod.CtrlCmd | _monaco.KeyCode.Enter,
      () => {
        if (isExecutingRef.current) return;
        const content = editorInstance.getValue();
        handleRunRef.current(content);
      },
    );

    editorInstance.addCommand(
      // eslint-disable-next-line no-bitwise
      _monaco.KeyMod.Shift | _monaco.KeyCode.Enter,
      () => {
        if (isExecutingRef.current) return;
        const content = editorInstance.getValue();
        // eslint-disable-next-line @typescript-eslint/no-floating-promises
        handleRunRef.current(content);
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
            fontSize: 12,
            tabSize: 2,
            automaticLayout: true,
            padding: { top: 4, bottom: 12 },
            lineHeight: 18,
            scrollbar: {
              vertical: 'hidden',
              horizontal: 'auto',
            },
            renderLineHighlight: 'all',
            cursorBlinking: 'smooth',
            cursorSmoothCaretAnimation: 'on',
            smoothScrolling: true,
            fontLigatures: true,
            bracketPairColorization: { enabled: true },
            // WordHighlighter throws "Canceled" during model swap / dispose.
            // We don't need the feature; turning it off is the root-cause fix.
            occurrencesHighlight: 'off',
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
