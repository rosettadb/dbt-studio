/**
 * SQL Cell Component
 * Monaco editor for SQL with execution and output display
 */

import React, { useRef, useEffect } from 'react';
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
          }}
          theme="vs-dark"
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
