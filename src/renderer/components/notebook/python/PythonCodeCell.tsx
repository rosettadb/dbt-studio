/**
 * Python Code Cell
 * Monaco editor (python, or sql for SQL cells) that grows with its content.
 * Shift+Enter runs and advances, Ctrl/Cmd+Enter runs in place, Alt+Enter runs
 * and inserts below.
 */

import React, { useEffect, useRef, useState } from 'react';
import { Box, useTheme } from '@mui/material';
import Editor, { OnMount } from '@monaco-editor/react';
import type { editor } from 'monaco-editor';

const MIN_HEIGHT = 56;
const MAX_HEIGHT = 720;

export type RunMode = 'stay' | 'advance' | 'insert';

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

  useEffect(() => {
    if (focusRequest && editorRef.current) {
      editorRef.current.focus();
    }
  }, [focusRequest]);

  const handleMount: OnMount = (instance, monaco) => {
    editorRef.current = instance;

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
