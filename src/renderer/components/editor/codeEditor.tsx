import MonacoEditor, { OnChange } from '@monaco-editor/react';
import React, { useEffect, useRef } from 'react';
import { Shimmer } from '../shimmer';
import { getDecorations } from './helpers';
import {
  IDisposable,
  IEditorDecorationsCollection,
  IMonaco,
  IStandaloneCodeEditor,
} from '../../../types/editor';

export const CodeEditor = ({
  content,
  originalContent,
  language,
  theme,
  onChange,
  readOnly = false,
}: {
  content: string;
  originalContent: string | null;
  language: string;
  theme: string;
  onChange: OnChange;
  readOnly?: boolean;
}) => {
  const [isMounted, setIsMounted] = React.useState(false);
  const [isDisposed, setIsDisposed] = React.useState(false);
  const editorRef = useRef<IStandaloneCodeEditor | null>(null);
  const monacoRef = useRef<IMonaco | null>(null);
  const decorationsRef = useRef<IEditorDecorationsCollection | null>(null);
  const completionDisposableRef = useRef<IDisposable | null>(null);

  const applyHighlights = (current: string, original: string | null) => {
    if (!editorRef.current || !monacoRef.current || !isMounted || isDisposed)
      return;

    try {
      const monacoInstance = monacoRef.current;
      const editor = editorRef.current;

      // Check if editor is still valid
      if (!editor.getModel) return;

      const model = editor.getModel();
      if (!model) return;

      const range = (index: number) =>
        new monacoInstance.Range(index, 1, index, 1);

      const decorations = getDecorations(
        original,
        current,
        model.getLineCount(),
        range,
      );

      if (!decorationsRef.current) {
        decorationsRef.current =
          editor.createDecorationsCollection(decorations);
      } else {
        decorationsRef.current.set(decorations);
      }
    } catch (error) {
      // Ignore decoration errors during rapid editor changes
    }
  };

  const handleMount = async (
    editor: IStandaloneCodeEditor,
    monacoInstance: IMonaco,
  ) => {
    // Clean up previous resources if they exist
    try {
      if (decorationsRef.current && !decorationsRef.current.clear) {
        decorationsRef.current = null;
      } else {
        decorationsRef.current?.clear();
        decorationsRef.current = null;
      }
      completionDisposableRef.current?.dispose();
      completionDisposableRef.current = null;
    } catch (error) {
      // Ignore cleanup errors during rapid remounting
    }

    editorRef.current = editor;
    monacoRef.current = monacoInstance;
    setIsDisposed(false);

    setTimeout(() => {
      if (!isDisposed) {
        setIsMounted(true);
      }
    }, 50);
  };

  useEffect(() => {
    if (editorRef.current && monacoRef.current && isMounted) {
      applyHighlights(content, originalContent);
    }
    return () => {
      completionDisposableRef.current?.dispose();
    };
  }, [content, originalContent, isMounted]);

  // Cleanup effect for component unmount
  useEffect(() => {
    return () => {
      // Mark as disposed to prevent further operations
      setIsDisposed(true);
      setIsMounted(false);

      // Clean up Monaco resources on unmount
      try {
        completionDisposableRef.current?.dispose();
        completionDisposableRef.current = null;

        if (decorationsRef.current) {
          try {
            decorationsRef.current.clear();
          } catch (e) {
            // Ignore clear errors
          }
          decorationsRef.current = null;
        }

        editorRef.current = null;
        monacoRef.current = null;
      } catch (error) {
        // Ignore disposal errors - they're expected during rapid unmounting
      }
    };
  }, []);

  return (
    <MonacoEditor
      height="100%"
      width="100%"
      theme={theme}
      language={language}
      value={content}
      onMount={handleMount}
      onChange={onChange}
      loading={<Shimmer text="Loading editor..." />}
      options={{
        fontSize: 14,
        minimap: { enabled: false },
        lineNumbers: 'on',
        scrollBeyondLastLine: false,
        automaticLayout: true,
        readOnly,
      }}
    />
  );
};
