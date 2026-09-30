/**
 * Python Code Cell
 * Monaco editor (python, or sql for SQL cells) that grows with its content.
 * Shift+Enter runs and advances, Ctrl/Cmd+Enter runs in place, Alt+Enter runs
 * and inserts below.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Box, useTheme } from '@mui/material';
import Editor, { OnMount } from '@monaco-editor/react';
import type { editor } from 'monaco-editor';
import { useSchemaObjectDrop } from '../../../hooks/useSchemaObjectDrop';
import {
  clearSqlSchemaCompletions,
  setSqlSchemaCompletions,
  type SqlSchemaCompletionEntry,
} from '../../../lib/monaco/completions/sqlSchema';

const MIN_HEIGHT = 56;
const MAX_HEIGHT = 720;

export type RunMode = 'stay' | 'advance' | 'insert';

/** Reports a cell's Monaco instance on mount, and `null` on unmount. */
export type EditorMountHandler = (
  cellId: string,
  instance: editor.IStandaloneCodeEditor | null,
) => void;

interface PythonCodeCellProps {
  cellId: string;
  source: string;
  isExecuting: boolean;
  /** Monaco language id; defaults to python */
  language?: 'python' | 'sql';
  onChange: (source: string) => void;
  onRun: (mode: RunMode) => void;
  onFocus: () => void;
  focusRequest?: number;
  onEditorMount?: EditorMountHandler;
  /** SQL cells: schema completions for the shared `sql` provider */
  sqlCompletions?: SqlSchemaCompletionEntry;
}

export const PythonCodeCell: React.FC<PythonCodeCellProps> = ({
  cellId,
  source,
  isExecuting,
  language = 'python',
  onChange,
  onRun,
  onFocus,
  focusRequest,
  onEditorMount,
  sqlCompletions,
}) => {
  const theme = useTheme();
  const editorRef = useRef<editor.IStandaloneCodeEditor | null>(null);
  const [height, setHeight] = useState(MIN_HEIGHT);
  const onRunRef = useRef(onRun);
  const isExecutingRef = useRef(isExecuting);
  const monacoTheme = theme.palette.mode === 'dark' ? 'vs-dark' : 'light';

  useEffect(() => {
    onRunRef.current = onRun;
  }, [onRun]);
  useEffect(() => {
    isExecutingRef.current = isExecuting;
  }, [isExecuting]);

  // SQL cells accept tables/columns dragged from the Data tree
  // (see useSchemaObjectDrop). Python cells keep Monaco's plain-text drop.
  const containerRef = useRef<HTMLDivElement>(null);
  const getEditor = useCallback(() => editorRef.current, []);
  useSchemaObjectDrop(containerRef, getEditor, { enabled: language === 'sql' });

  // Publish the notebook's schema completions for this cell's Monaco model
  // (see lib/monaco/completions/sqlSchema).
  const modelIdRef = useRef<string | null>(null);
  const publishCompletions = useCallback(() => {
    const model = editorRef.current?.getModel();
    if (!model) return;
    modelIdRef.current = model.id;
    if (language === 'sql' && sqlCompletions) {
      setSqlSchemaCompletions(model.id, sqlCompletions);
    } else {
      clearSqlSchemaCompletions(model.id);
    }
  }, [language, sqlCompletions]);

  useEffect(() => {
    publishCompletions();
  }, [publishCompletions]);

  useEffect(
    () => () => {
      if (modelIdRef.current) clearSqlSchemaCompletions(modelIdRef.current);
      onEditorMount?.(cellId, null);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  useEffect(() => {
    if (focusRequest && editorRef.current) {
      editorRef.current.focus();
    }
  }, [focusRequest]);

  const handleMount: OnMount = (instance, monaco) => {
    editorRef.current = instance;
    publishCompletions();
    onEditorMount?.(cellId, instance);

    const fit = () => {
      const contentHeight = instance.getContentHeight();
      setHeight(Math.max(MIN_HEIGHT, Math.min(MAX_HEIGHT, contentHeight + 8)));
    };
    instance.onDidContentSizeChange(fit);
    fit();

    instance.onDidFocusEditorWidget(onFocus);

    instance.addCommand(
      // eslint-disable-next-line no-bitwise
      monaco.KeyMod.Shift | monaco.KeyCode.Enter,
      () => onRunRef.current('advance'),
    );
    instance.addCommand(
      // eslint-disable-next-line no-bitwise
      monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter,
      () => onRunRef.current('stay'),
    );
    instance.addCommand(
      // eslint-disable-next-line no-bitwise
      monaco.KeyMod.Alt | monaco.KeyCode.Enter,
      () => onRunRef.current('insert'),
    );
  };

  return (
    <Box
      ref={containerRef}
      sx={{
        '& .monaco-editor, & .monaco-editor .margin, & .monaco-editor-background':
          {
            backgroundColor: 'transparent !important',
          },
      }}
    >
      <Editor
        key={cellId}
        height={`${height}px`}
        defaultLanguage={language}
        language={language}
        value={source}
        theme={monacoTheme}
        onChange={(value) => {
          if (value !== undefined && value !== source) onChange(value);
        }}
        onMount={handleMount}
        options={{
          minimap: { enabled: false },
          lineNumbers: 'off',
          glyphMargin: false,
          folding: false,
          lineDecorationsWidth: 8,
          lineNumbersMinChars: 0,
          scrollBeyondLastLine: false,
          wordWrap: 'on',
          fontSize: 13,
          tabSize: language === 'sql' ? 2 : 4,
          insertSpaces: true,
          automaticLayout: true,
          padding: { top: 8, bottom: 8 },
          lineHeight: 20,
          scrollbar: {
            vertical: 'auto',
            horizontal: 'auto',
            alwaysConsumeMouseWheel: false,
          },
          overviewRulerLanes: 0,
          hideCursorInOverviewRuler: true,
          renderLineHighlight: 'none',
          occurrencesHighlight: 'off',
          quickSuggestions: true,
          suggestOnTriggerCharacters: true,
          fontLigatures: true,
          bracketPairColorization: { enabled: true },
        }}
      />
    </Box>
  );
};

export default PythonCodeCell;
