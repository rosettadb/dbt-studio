/* eslint-disable no-plusplus, no-continue */
import React, { useEffect, useRef } from 'react';
import MonacoEditor, { OnMount, OnChange, loader } from '@monaco-editor/react';
import * as monaco from 'monaco-editor';
import { useTheme, Box, CircularProgress, Typography } from '@mui/material';
import { projectsServices } from '../../../services';
import { Container } from './styles';
import { Shimmer } from '../../shimmer';
import { CompletionItem } from '../../../../types/frontend';

type Props = {
  filePath?: string;
  content: string;
  setContent: (value: string) => void;
  completions?: Omit<CompletionItem, 'range'>[];
  editorRef?: React.MutableRefObject<monaco.editor.IStandaloneCodeEditor | null>;
  onRunSelected?: (query: string) => void;
  isLoading?: boolean;
};

export const SqlEditorComponent: React.FC<Props> = ({
  filePath,
  content,
  setContent,
  completions = [],
  editorRef,
  onRunSelected,
  isLoading,
}) => {
  const theme = useTheme();
  const isDarkMode = theme.palette.mode === 'dark';
  const monacoTheme = isDarkMode ? 'vs-dark' : 'light';

  loader.config({
    paths: {
      vs: 'app-asset://zui/node_modules/monaco-editor/min/vs',
    },
  });

  const saveDebounce = useRef<ReturnType<typeof setTimeout> | null>(null);
  const decorationIdsRef = useRef<string[]>([]);
  const monacoInstanceRef = useRef<typeof monaco | null>(null);
  const completionProviderRef = useRef<monaco.IDisposable | null>(null);
  const editorInstanceRef = useRef<monaco.editor.IStandaloneCodeEditor | null>(
    null,
  );

  const handleChange: OnChange = (value) => {
    if (value === undefined) return;

    setContent(value);

    if (filePath) {
      if (saveDebounce.current) clearTimeout(saveDebounce.current);
      saveDebounce.current = setTimeout(() => {
        projectsServices.saveFileContent({ path: filePath, content: value });
      }, 500);
    }
  };

  const extractQueryBlock = (
    model: monaco.editor.ITextModel,
    lineNumber: number,
  ) => {
    const totalLines = model.getLineCount();
    let start = lineNumber;
    let end = lineNumber;

    // Expand upward
    for (let i = lineNumber - 1; i >= 1; i--) {
      const line = model.getLineContent(i).trim();
      if (line === '') break;
      start = i;
    }

    // Expand downward
    for (let i = lineNumber + 1; i <= totalLines; i++) {
      const line = model.getLineContent(i).trim();
      if (line === '') break;
      end = i;
    }

    return model
      .getValueInRange(
        new monaco.Range(start, 1, end, model.getLineMaxColumn(end)),
      )
      .trim();
  };

  const addRunIconsToBlocks = (editor: monaco.editor.IStandaloneCodeEditor) => {
    const model = editor.getModel();
    const monacoInstance = monacoInstanceRef.current;
    if (!model || !monacoInstance) return;

    const totalLines = model.getLineCount();
    const newDecorations: monaco.editor.IModelDeltaDecoration[] = [];

    let isInsideBlock = false;
    for (let i = 1; i <= totalLines; i++) {
      const line = model.getLineContent(i).trim();

      if (line === '') {
        isInsideBlock = false;
        continue;
      }

      if (!isInsideBlock) {
        newDecorations.push({
          range: new monacoInstance.Range(i, 1, i, 1),
          options: {
            isWholeLine: true,
            glyphMarginClassName: 'run-query-glyph',
            glyphMarginHoverMessage: { value: '▶ Run this query block' },
          },
        });
        isInsideBlock = true;
      }
    }

    decorationIdsRef.current = editor.deltaDecorations(
      decorationIdsRef.current,
      newDecorations,
    );
  };

  // Register completion provider (can be called multiple times safely)
  const registerCompletionProvider = () => {
    const monacoInstance = monacoInstanceRef.current;
    if (!monacoInstance) return;

    // Dispose existing provider
    if (completionProviderRef.current) {
      completionProviderRef.current.dispose();
    }

    // Register new completion provider
    completionProviderRef.current =
      monacoInstance.languages.registerCompletionItemProvider('sql', {
        provideCompletionItems: (model, position) => {
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
  };

  // Update completion provider when completions change
  useEffect(() => {
    registerCompletionProvider();
  }, [completions]);

  const handleEditorMount: OnMount = (editor, monacoInstance) => {
    monacoInstanceRef.current = monacoInstance;
    editorInstanceRef.current = editor;
    if (editorRef) editorRef.current = editor;

    // Register initial completion provider after monaco is ready
    registerCompletionProvider();

    addRunIconsToBlocks(editor);

    editor.onDidChangeModelContent(() => {
      setTimeout(() => addRunIconsToBlocks(editor), 150);
    });

    editor.onMouseDown((e) => {
      if (
        e.target.type ===
          monacoInstance.editor.MouseTargetType.GUTTER_GLYPH_MARGIN &&
        onRunSelected
      ) {
        const lineNumber = e.target.position?.lineNumber;
        const model = editor.getModel();
        if (!lineNumber || !model) return;

        const query = extractQueryBlock(model, lineNumber);
        if (query) onRunSelected(query);
      }
    });
  };

  useEffect(() => {
    return () => {
      if (saveDebounce.current) clearTimeout(saveDebounce.current);
      if (completionProviderRef.current) {
        completionProviderRef.current.dispose();
      }
    };
  }, []);

  return (
    <Container>
      <MonacoEditor
        height="100%"
        width="100%"
        theme={monacoTheme}
        language="sql"
        value={content}
        onChange={handleChange}
        onMount={handleEditorMount}
        loading={<Shimmer text="Loading editor..." />}
        options={{
          fontSize: 14,
          glyphMargin: true,
          minimap: { enabled: false },
          lineNumbers: 'on',
          scrollBeyondLastLine: false,
          automaticLayout: true,
          readOnly: isLoading,
        }}
      />
      {isLoading && (
        <Box
          sx={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: isDarkMode
              ? 'rgba(30, 30, 30, 0.7)'
              : 'rgba(255, 255, 255, 0.7)',
            zIndex: 10,
            backdropFilter: 'blur(2px)',
          }}
        >
          <CircularProgress size={40} thickness={4} />
          <Typography
            variant="body2"
            sx={{
              mt: 2,
              color: theme.palette.text.primary,
              fontWeight: 500,
            }}
          >
            Switching connection...
          </Typography>
        </Box>
      )}
    </Container>
  );
};
