/* eslint-disable no-plusplus, no-continue */
import React, { useEffect, useRef, useState } from 'react';
import MonacoEditor, { OnMount, OnChange, loader } from '@monaco-editor/react';
import * as monaco from 'monaco-editor';
import { useTheme } from '@mui/material';
import { projectsServices } from '../../../services';
import { Container } from './styles';
import { Shimmer } from '../../shimmer';
import { CompletionItem } from '../../../../types/frontend';
import { utils } from '../../../helpers';

type Props = {
  filePath?: string;
  content: string;
  setContent: (value: string) => void;
  completions?: Omit<CompletionItem, 'range'>[];
  editorRef?: React.MutableRefObject<monaco.editor.IStandaloneCodeEditor | null>;
  onRunSelected?: (query: string) => void;
};

export const SqlEditorComponent: React.FC<Props> = ({
  filePath,
  content,
  setContent,
  completions = [],
  editorRef,
  onRunSelected,
}) => {
  const theme = useTheme();
  const isDarkMode = theme.palette.mode === 'dark';
  const monacoTheme = isDarkMode ? 'vs-dark' : 'light';
  const prevCompletionsLengthRef = useRef(0);

  // Track the monaco instance and completion provider with state and refs
  const monacoInstanceRef = useRef<typeof monaco | null>(null);
  const [monacoLoaded, setMonacoLoaded] = useState(false);
  const completionProviderRef = useRef<monaco.IDisposable | null>(null);
  const [completionProviderVersion, setCompletionProviderVersion] = useState(0);

  loader.config({
    paths: {
      vs: 'app-asset://zui/node_modules/monaco-editor/min/vs',
    },
  });

  const saveDebounce = useRef<ReturnType<typeof setTimeout> | null>(null);
  const decorationIdsRef = useRef<string[]>([]);

  const handleChange: OnChange = (value) => {
    if (value === undefined) return;
    setContent(value);

    if (saveDebounce.current) clearTimeout(saveDebounce.current);
    saveDebounce.current = setTimeout(() => {
      if (filePath) {
        projectsServices.saveFileContent({ path: filePath, content: value });
      }
    }, 500);
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

  // Update completion provider when completions change
  useEffect(() => {
    // Only run this effect when monaco is loaded and completions have changed
    if (!monacoLoaded || !monacoInstanceRef.current) return;

    // Check if completions have actually changed
    const completionsChanged = prevCompletionsLengthRef.current !== completions.length;
    prevCompletionsLengthRef.current = completions.length;

    if (completionsChanged || completionProviderVersion === 0) {
      console.log(`Updating completions provider with ${completions.length} items`);

      // Use the utility function to register the provider
      completionProviderRef.current = utils.registerMonacoCompletionProvider(
        monacoInstanceRef.current,
        completions,
        completionProviderRef.current
      );

      // Update version to trigger a re-render
      setCompletionProviderVersion(prev => prev + 1);

      // If there's an editor instance and completions were added,
      // force Monaco to refresh intellisense
      if (editorRef?.current && completions.length > 0) {
        try {
          editorRef.current.trigger('', 'editor.action.triggerSuggest', {});
        } catch (err) {
          // Ignore errors from triggering suggestions
        }
      }
    }
  }, [completions, monacoLoaded, completionProviderVersion]);

  // Handle Monaco editor mounting
  const handleEditorMount: OnMount = (editor, monacoInstance) => {
    monacoInstanceRef.current = monacoInstance;
    if (editorRef) editorRef.current = editor;

    // Mark Monaco as loaded
    setMonacoLoaded(true);

    // Initial registration of completion provider
    completionProviderRef.current = utils.registerMonacoCompletionProvider(
      monacoInstance,
      completions,
      null
    );

    // Update version to track provider changes
    setCompletionProviderVersion(1);

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

  // Cleanup effect
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
        }}
        key={`monaco-editor-${completionProviderVersion}`}
      />
    </Container>
  );
};
