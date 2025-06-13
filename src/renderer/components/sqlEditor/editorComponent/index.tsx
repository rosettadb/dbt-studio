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
};

export const SqlEditorComponent: React.FC<Props> = ({
  filePath,
  content,
  setContent,
  completions = [],
  editorRef,
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

  // Update completion provider when completions change
  useEffect(() => {
    // Only run this effect when monaco is loaded and completions have changed
    if (!monacoLoaded || !monacoInstanceRef.current) return;

    // Check if completions have actually changed
    const completionsChanged = prevCompletionsLengthRef.current !== completions.length;
    prevCompletionsLengthRef.current = completions.length;

    if (completionsChanged && completions.length > 0) {
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
      if (editorRef?.current) {
        try {
          editorRef.current.trigger('', 'editor.action.triggerSuggest', {});
        } catch (err) {
          // Ignore errors from triggering suggestions
        }
      }
    }
  }, [completions, monacoLoaded]);

  // Handle Monaco editor mounting
  const handleEditorMount: OnMount = (editor, monacoInstance) => {
    monacoInstanceRef.current = monacoInstance;
    if (editorRef) editorRef.current = editor;

    // Mark Monaco as loaded
    setMonacoLoaded(true);

    // Don't register completion provider here - let the useEffect handle it
    // This prevents double registration on mount
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
          minimap: { enabled: false },
          lineNumbers: 'on',
          scrollBeyondLastLine: false,
          automaticLayout: true,
          glyphMargin: false, // Disable glyph margin since we don't need run icons
        }}
        key={`monaco-editor-${completionProviderVersion}`}
      />
    </Container>
  );
};
